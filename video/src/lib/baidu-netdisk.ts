import fs from 'node:fs';
import path from 'node:path';

/**
 * 百度网盘（平台自带能力，不依赖 AList / OpenList）。
 *
 * 设计要点：
 * - **令牌只保存在服务端**：浏览器的 fetch 既发不了 `Referer` 也改不了 `User-Agent`，
 *   而百度对 >20MB 的文件强制要求 `User-Agent: pan.baidu.com`；因此令牌与下载都由服务核持有。
 * - 令牌落盘到本地数据目录（默认 `<cwd>/.utopia-data/baidu.json`，可用 `UTOPIA_DATA_DIR` 改），
 *   文件权限 0600；也可用环境变量 `BAIDU_REFRESH_TOKEN` 只读注入（适合容器部署）。
 * - 应用凭据默认用 AList 生态已验证可用的一套（可用 `BAIDU_CLIENT_ID` / `BAIDU_CLIENT_SECRET` 覆盖）。
 * - 所有出网目标都是固定域名，不接受用户传入的 URL，因此不存在代理那类 SSRF 面。
 */

const CLIENT_ID = process.env.BAIDU_CLIENT_ID || 'hq9yQ9w9kR4YHj1kyYafLygVocobh7Sf';
const CLIENT_SECRET = process.env.BAIDU_CLIENT_SECRET || 'YH2VpZcFJHYNnV6vLfHQXDBhcE7ZChyE';
const UA = 'pan.baidu.com';
const DEFAULT_SCOPE = 'basic,netdisk';

/** 允许转发的下载域名后缀（百度 CDN 家族）；其余一律拒绝，避免变成开放代理 */
const ALLOWED_DL_SUFFIXES = [
  'baidu.com',
  'baidupcs.com',
  'bdstatic.com',
  'bcebos.com',
  'baidubce.com',
];

export interface BaiduEntry {
  fsId: number;
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  /** 浏览器能直接解码的容器（mp4 / m3u8 / ts） */
  playable: boolean;
  modified?: string;
}

interface TokenFile {
  refreshToken: string;
  scope?: string;
  savedAt?: number;
}

/** 内存中的 access_token 缓存（进程内有效，不落盘） */
let accessTokenCache: { token: string; expiresAt: number } | null = null;
/** dlink 缓存：百度直链带时间戳，几分钟就过期，缓存太旧反而报错 */
const dlinkCache = new Map<number, { url: string; expiresAt: number }>();

function dataDir(): string {
  return process.env.UTOPIA_DATA_DIR || path.join(process.cwd(), '.utopia-data');
}

function tokenFile(): string {
  return path.join(dataDir(), 'baidu.json');
}

/** 读取已保存的 refresh_token（环境变量优先，其次本地文件） */
export function readRefreshToken(): string {
  const fromEnv = (process.env.BAIDU_REFRESH_TOKEN || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const raw = fs.readFileSync(tokenFile(), 'utf8');
    const parsed = JSON.parse(raw) as TokenFile;
    return String(parsed.refreshToken || '').trim();
  } catch {
    return '';
  }
}

/** 是否已完成授权 */
export function isConfigured(): boolean {
  return readRefreshToken().length > 0;
}

function persistRefreshToken(refreshToken: string, scope?: string): void {
  // 环境变量注入的场景是只读的，不回写文件
  if ((process.env.BAIDU_REFRESH_TOKEN || '').trim()) return;
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const payload: TokenFile = { refreshToken, scope, savedAt: Date.now() };
  const file = tokenFile();
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* Windows 上 chmod 基本无效，忽略 */
  }
}

export function clearRefreshToken(): void {
  accessTokenCache = null;
  dlinkCache.clear();
  try {
    fs.unlinkSync(tokenFile());
  } catch {
    /* 文件不存在即视为已清除 */
  }
}

/** 拼授权地址：默认 `oob`（百度页面直接显示授权码），部署者可指定自己的回调 */
export function authorizeUrl(redirectUri = defaultRedirectUri()): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: DEFAULT_SCOPE,
    display: 'page',
  });
  return `https://openapi.baidu.com/oauth/2.0/authorize?${params.toString()}`;
}

export function defaultRedirectUri(): string {
  return (process.env.BAIDU_REDIRECT_URI || 'oob').trim();
}

/** 用授权码换令牌，并把 refresh_token 落到本地 */
export async function exchangeCode(code: string, redirectUri = defaultRedirectUri()): Promise<void> {
  const trimmed = code.trim();
  if (!/^[A-Za-z0-9._-]{8,}$/.test(trimmed)) throw new Error('授权码格式不正确');
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: trimmed,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: redirectUri,
  });
  const res = await fetch(`https://openapi.baidu.com/oauth/2.0/token?${params.toString()}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json()) as Record<string, unknown>;
  const refreshToken = String(data.refresh_token || '');
  if (!refreshToken) {
    const error = String(data.error || '');
    const desc = String(data.error_description || '');
    if (error === 'invalid_grant') {
      throw new Error(`授权码无效或已使用（${desc || 'invalid_grant'}）。请重新打开授权链接，注意授权码只能用一次`);
    }
    if (error === 'invalid_client') {
      throw new Error(`应用凭据被百度拒绝（${desc || error}）。请检查 BAIDU_CLIENT_ID / BAIDU_CLIENT_SECRET`);
    }
    throw new Error(`换取令牌失败：${error || res.status} ${desc}`.trim());
  }
  persistRefreshToken(refreshToken, String(data.scope || DEFAULT_SCOPE));
  accessTokenCache = {
    token: String(data.access_token || ''),
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 3600) - 120) * 1000,
  };
}

/**
 * 取可用的 access_token；必要时用 refresh_token 续期。
 *
 * 两个必须遵守的事实（都是实测踩到的）：
 * 1. 百度**每次续期都会下发新的 refresh_token，旧的随即作废**（"refresh token has been used"），
 *    所以拿到就必须回写；
 * 2. 续期必须**单飞**：并发请求各自去续期会互相把对方的新令牌作废，最后整条链断掉。
 *    这里用 `refreshInFlight` 合并并发；若发现令牌已被别处轮换，则用文件里的新令牌重试一次。
 */
let refreshInFlight: Promise<string> | null = null;

export async function getAccessToken(): Promise<string> {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now()) return accessTokenCache.token;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = refreshAccessToken().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function refreshAccessToken(allowRetry = true): Promise<string> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) throw new Error('尚未绑定百度网盘，请先在「网盘」页完成授权');

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  const res = await fetch(`https://openapi.baidu.com/oauth/2.0/token?${params.toString()}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json()) as Record<string, unknown>;
  const accessToken = String(data.access_token || '');
  if (!accessToken) {
    const error = String(data.error || '');
    const desc = String(data.error_description || '');
    const expired = /invalid refresh token|has been used|expired_token/i.test(`${error} ${desc}`);
    if (expired && allowRetry) {
      // 另一个进程（浏览器里的 Web 实例 / 桌面客户端）可能已经轮换过，读文件里的新令牌再试一次
      const latest = readRefreshToken();
      if (latest && latest !== refreshToken) return refreshAccessToken(false);
    }
    if (expired) {
      throw new Error('百度网盘授权已失效（刷新令牌已被使用或过期），请到「网盘」页重新授权一次');
    }
    throw new Error(`刷新百度的 access_token 失败：${error || res.status} ${desc}`.trim());
  }
  const nextRefresh = String(data.refresh_token || refreshToken);
  persistRefreshToken(nextRefresh, String(data.scope || DEFAULT_SCOPE));
  accessTokenCache = {
    token: accessToken,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 3600) - 120) * 1000,
  };
  return accessToken;
}

/** 百度 API 的 errno → 可读中文 */
function describeErrno(errno: number, fallback: string): string {
  const map: Record<number, string> = {
    '-1': '百度返回了系统错误',
    '0': '',
    '2': '参数错误',
    '-6': '百度网盘授权已失效，请重新授权',
    '-7': '文件或目录不存在',
    '-9': '文件不存在',
    '12': '账号可能触发百度风控（如 hit black userlist）',
    '111': '百度网盘 access_token 已过期，请重试',
    '31066': '该文件不允许直接访问（可能被百度限制）',
    '31329': '账号可能触发百度风控（如 hit illeage dlna）',
  };
  const text = map[String(errno) as unknown as number];
  return text || fallback;
}

function assertDownloadUrl(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error('百度返回的直链不是合法地址');
  }
  const ok = ALLOWED_DL_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  if (!ok) throw new Error(`百度返回的直链域名不在允许范围（${host}）`);
}

/** 目录列表（默认根目录为空串，表示网盘根） */
export async function listDir(dir = '/'): Promise<BaiduEntry[]> {
  const accessToken = await getAccessToken();
  const params = new URLSearchParams({
    method: 'list',
    access_token: accessToken,
    dir,
    order: 'name',
    start: '0',
    limit: '1000',
    web: 'web',
  });
  const res = await fetch(`https://pan.baidu.com/rest/2.0/xpan/file?${params.toString()}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json()) as {
    errno?: number;
    list?: Array<Record<string, unknown>>;
    error_msg?: string;
  };
  const errno = Number(data.errno ?? 0);
  if (errno !== 0) {
    throw new Error(`读取目录失败（errno ${errno}）：${describeErrno(errno, String(data.error_msg || ''))}`);
  }
  return (data.list || []).map(toEntry);
}

/** 自然序比较：`第2讲` 排在 `第10讲` 前面（纯字典序会排反） */
const naturalCollator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

/** 浏览器能直接解码的容器（与 toEntry 的 playable 判定保持一致） */
const VIDEO_EXT = /\.(mp4|m3u8|ts)$/i;

export interface ScanResult {
  videos: BaiduEntry[];
  /** 命中上限被截断（目录过大时保护服务端与百度配额） */
  truncated: boolean;
  scannedDirs: number;
}

/**
 * 递归扫描目录下的视频文件，用于「目录 → 课程章节」批量导入。
 *
 * 限额（都可调）：最多扫 80 个目录、最多 400 个文件、最深 6 层。
 * 排序用自然序，保证「第1讲、第2讲、…、第10讲」的章节顺序正确。
 */
export async function scanVideos(
  dir: string,
  options: { maxDepth?: number; maxFiles?: number; maxDirs?: number } = {}
): Promise<ScanResult> {
  const maxDepth = options.maxDepth ?? 6;
  const maxFiles = options.maxFiles ?? 400;
  const maxDirs = options.maxDirs ?? 80;

  const queue: { dir: string; depth: number }[] = [{ dir, depth: 0 }];
  const videos: BaiduEntry[] = [];
  let scannedDirs = 0;
  let truncated = false;

  while (queue.length > 0) {
    if (scannedDirs >= maxDirs) {
      truncated = true;
      break;
    }
    const current = queue.shift()!;
    scannedDirs += 1;
    const entries = await listDir(current.dir);
    for (const entry of entries) {
      if (entry.isDir) {
        if (current.depth + 1 <= maxDepth) {
          queue.push({ dir: entry.path || joinPath(current.dir, entry.name), depth: current.depth + 1 });
        }
        continue;
      }
      if (!VIDEO_EXT.test(entry.name)) continue;
      videos.push(entry);
      if (videos.length >= maxFiles) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
  }

  videos.sort((a, b) => naturalCollator.compare(a.path || a.name, b.path || b.name));
  return { videos, truncated, scannedDirs };
}

function joinPath(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, '')}/${name}`;
}

function toEntry(item: Record<string, unknown>): BaiduEntry {
  const name = String(item.server_filename || item.filename || '');
  const isDir = Number(item.isdir || 0) === 1;
  const size = Number(item.size || 0);
  const lower = name.toLowerCase();
  const playable = !isDir && (lower.endsWith('.mp4') || lower.endsWith('.m3u8') || lower.endsWith('.ts'));
  return {
    fsId: Number(item.fs_id || 0),
    name,
    path: String(item.path || ''),
    isDir,
    size,
    playable,
    modified: item.server_mtime ? new Date(Number(item.server_mtime) * 1000).toISOString() : undefined,
  };
}

/** 用 fs_id 解析可下载直链（带缓存） */
export async function resolveDlink(fsId: number): Promise<string> {
  const cached = dlinkCache.get(fsId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const accessToken = await getAccessToken();
  const params = new URLSearchParams({
    method: 'filemetas',
    access_token: accessToken,
    fsids: JSON.stringify([fsId]),
    dlink: '1',
    thumb: '0',
  });
  const res = await fetch(`https://pan.baidu.com/rest/2.0/xpan/multimedia?${params.toString()}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json()) as {
    errno?: number;
    /** 实测该接口把条目放在 `list` 里（文档/部分版本写作 `info`），两个都认 */
    list?: Array<Record<string, unknown>>;
    info?: Array<Record<string, unknown>>;
  };
  const errno = Number(data.errno ?? 0);
  if (errno !== 0) {
    throw new Error(`解析直链失败（errno ${errno}）：${describeErrno(errno, '')}`);
  }
  const item = data.list?.[0] ?? data.info?.[0];
  const rawDlink = String((item as Record<string, unknown> | undefined)?.dlink || '');
  if (!rawDlink) throw new Error('百度没有返回可播放的直链（文件可能被限制或需要会员）');
  assertDownloadUrl(rawDlink);
  /**
   * 关键细节（实测踩出来的）：百度 CDN 只认「直链 + access_token」。
   * 只带 `User-Agent: pan.baidu.com` 或加 Referer 都会返回
   * `403 {"error_code":31045,"error_msg":"user not exists"}`；
   * 把 `access_token` 拼到直链查询串上立刻 200 并返回真实媒体数据。
   *
   * 令牌只发往百度 CDN（由服务端发起），不会出现在前端的播放地址里。
   */
  const url = appendAccessToken(rawDlink, await getAccessToken());
  // 百度直链带 `expires`（实测 8 小时）；本地缓存 10 分钟，既省一次解析又不会拿到过期链接
  dlinkCache.set(fsId, { url, expiresAt: Date.now() + 10 * 60 * 1000 });
  return url;
}

/** 把 access_token 拼到直链查询串（已存在则替换） */
function appendAccessToken(url: string, accessToken: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('access_token', accessToken);
    return parsed.toString();
  } catch {
    const glue = url.includes('?') ? '&' : '?';
    return `${url}${glue}access_token=${encodeURIComponent(accessToken)}`;
  }
}

/** 供下载代理使用的固定请求头（百度要求 pan.baidu.com 身份） */
export function baiduDownloadHeaders(range?: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'User-Agent': UA, Accept: '*/*' };
  if (range) headers.Range = range;
  return headers;
}