import { fetchWithSafeRedirects } from '../../lib/fetch-utils';
import {
  authorizeUrl,
  baiduDownloadHeaders,
  clearRefreshToken,
  defaultRedirectUri,
  exchangeCode,
  isConfigured,
  listDir,
  resolveDlink,
  scanVideos,
} from '../../lib/baidu-netdisk';
import { jsonError } from '../../lib/http';
import { jsonResponse } from '../adapt';
import type { ServerRequest } from '../types';

/**
 * 百度网盘接口（平台自带，不经 AList/OpenList）：
 *   GET  /api/netdisk/status      —— 是否已绑定（不含任何令牌内容）
 *   GET  /api/netdisk/auth-url    —— 授权链接
 *   POST /api/netdisk/code        { code, redirectUri? } —— 用授权码换令牌并落盘
 *   POST /api/netdisk/list        { dir } —— 列目录
 *   GET  /api/netdisk/stream?fsid=N —— 解析百度直链并带正确 UA 转发（支持 Range）
 *   POST /api/netdisk/logout      —— 解绑
 *
 * 令牌只存在服务端；前端拿到的永远是本平台的同源地址。
 */

const STREAM_TIMEOUT_MS = 20_000;

export function netdiskStatusHandler(): Response {
  return jsonResponse({ configured: isConfigured(), redirectUri: defaultRedirectUri() });
}

export function netdiskAuthUrlHandler(): Response {
  const redirectUri = defaultRedirectUri();
  return jsonResponse({ url: authorizeUrl(redirectUri), redirectUri });
}

export async function netdiskCodeHandler(req: ServerRequest): Promise<Response> {
  let body: { code?: unknown; redirectUri?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonError('请求格式错误', 400);
  }
  const code = String(body.code || '').trim();
  if (!code) return jsonError('缺少授权码', 400);
  const redirectUri = String(body.redirectUri || defaultRedirectUri()).trim();
  try {
    await exchangeCode(code, redirectUri);
    return jsonResponse({ configured: true });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : '授权失败', 400);
  }
}

export async function netdiskListHandler(req: ServerRequest): Promise<Response> {
  let body: { dir?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonError('请求格式错误', 400);
  }
  const dir = String(body.dir ?? '/').trim() || '/';
  try {
    const entries = await listDir(dir);
    // 目录优先、目录名按本地比较排序，和 TVBox/资源管理器观感一致
    entries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    return jsonResponse({ dir, entries });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : '读取目录失败', 502);
  }
}

export function netdiskLogoutHandler(): Response {
  clearRefreshToken();
  return jsonResponse({ configured: false });
}

/**
 * 递归扫描目录里的视频，供「目录 → 课程章节」批量导入。
 *
 * 排序在服务端做（自然序），前端只负责按返回顺序生成章节 —— 这样「第2讲 / 第10讲」
 * 不会因字典序被排反，且同一份排序逻辑只有一处实现。
 */
export async function netdiskScanHandler(req: ServerRequest): Promise<Response> {
  let body: { dir?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonError('请求格式错误', 400);
  }
  const dir = String(body.dir ?? '/').trim() || '/';
  if (!isConfigured()) return jsonError('尚未绑定百度网盘，请先在「网盘」页完成授权', 400);
  try {
    const result = await scanVideos(dir);
    return jsonResponse({
      dir,
      count: result.videos.length,
      truncated: result.truncated,
      scannedDirs: result.scannedDirs,
      videos: result.videos,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : '扫描目录失败', 502);
  }
}

/**
 * 媒体流代理：/api/netdisk/stream?fsid=N
 *
 * 三件事：解析直链 → 用 `User-Agent: pan.baidu.com` 请求上游 → 原样透传状态与 Range。
 * 超时只作用于「等响应头」：大文件在同一连接上要传很久，给响应体挂超时会把长视频掐断。
 */
export async function netdiskStreamHandler(req: ServerRequest): Promise<Response> {
  const fsId = Number(new URL(req.url).searchParams.get('fsid') || 0);
  if (!Number.isFinite(fsId) || fsId <= 0) return jsonError('缺少有效的 fsid 参数', 400);
  if (!isConfigured()) return jsonError('尚未绑定百度网盘，请先在「网盘」页完成授权', 400);

  let dlink: string;
  try {
    dlink = await resolveDlink(fsId);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : '解析直链失败', 502);
  }

  const controller = new AbortController();
  const onClientAbort = () => controller.abort();
  req.signal.addEventListener('abort', onClientAbort, { once: true });

  const headers = baiduDownloadHeaders(req.headers.get('range'));

  let response: Response;
  try {
    const result = await fetchWithSafeRedirects(
      dlink,
      { headers, signal: controller.signal },
      { headerTimeoutMs: STREAM_TIMEOUT_MS }
    );
    response = result.res;
  } catch (err) {
    return jsonError(`连接百度网盘失败: ${err instanceof Error ? err.message : '未知错误'}`, 502);
  }

  const outHeaders = new Headers();
  for (const name of ['content-type', 'accept-ranges', 'content-range', 'etag', 'last-modified']) {
    const value = response.headers.get(name);
    if (value) outHeaders.set(name, value);
  }
  // 直链本身有时效，不缓存；分片级请求由播放器自行控制频率
  outHeaders.set('Cache-Control', 'no-store');
  outHeaders.set('Access-Control-Allow-Origin', '*');

  return new Response(response.body, { status: response.status, headers: outHeaders });
}