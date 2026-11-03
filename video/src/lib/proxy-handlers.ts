import { jsonError } from './http';
import { allowLivePrivate, allowPrivateUpstream, checkLiveUrlAllowed, checkProxyUrlAllowed, isValidProxyUrl } from './ssrf';
import { fetchWithSafeRedirects } from './fetch-utils';
import { rewriteM3u8, LIVE_STREAM_BASE } from './m3u8';

/**
 * 代理目标地址的两种传入形式：
 * - 路径段：/api/proxy/<encodeURIComponent(url)>（旧形式，保持兼容）；
 * - 查询串：/api/proxy?url=<encodeURIComponent(url)>（新形式）。
 *
 * 路径形式在 EdgeOne 等会做 URL 归一化的网关上有致命缺陷：路径里的 %2F
 * 会在路由匹配前被解码成 /，多段路径令单段动态路由 [url] 匹配失败（404）。
 * 查询串不参与路径归一化，全平台行为一致；路由同时支持两种形式，
 * 旧地址（缓存页 / 已下发的播放列表）不受影响。
 */

const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '1', 10);
/**
 * 上游「等响应头」的超时（毫秒）。`REQUEST_TIMEOUT` 就是它——注意它**只管到响应头为止**，
 * 拿到响应头后计时器立即清除，响应体可以无限时长流式透传（大文件/长视频必需）。
 */
const HEADER_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT || '15000', 10);
const UA =
  process.env.USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * 精确域名匹配：仅 `douban.com` 本身及其子域放行。
 * 不能用 endsWith('douban.com')——那样 `evil-douban.com` 也会命中，形成鉴权绕过。
 */
function isDoubanHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === 'douban.com' || h.endsWith('.douban.com') ||
    h === 'doubanio.com' || h.endsWith('.doubanio.com')
  );
}

/** 解码路径段形式的代理目标（网关可能已把 %2F 解码为 /，失败时原样返回） */
export function decodePathTarget(encodedUrl: string): string {
  try { return decodeURIComponent(encodedUrl); } catch { return encodedUrl; }
}

/**
 * 代理处理器只用到请求上的两样东西：请求头（Range / 条件头透传）与「客户端已断开」信号。
 * 显式声明成最小结构而不是绑定 `Request`，是为了让同一份逻辑同时挂在
 * Next.js 的 Route Handler 与 Electron 主进程的纯 Node 请求上——两者都天然满足该结构。
 */
export interface ProxyRequestView {
  headers: Headers;
  signal: AbortSignal;
}

/**
 * 通用流式代理（点播 / 图片）：
 * - SSRF 防护是该路由唯一的准入门槛：字面量校验 + DNS 解析校验缺一不可；
 * - 豆瓣封面等图片域自动伪装 Referer，规避防盗链；
 * - m3u8 文本重写为代理地址，分片/key/map 全部经本站转发，规避上游 CORS。
 */
export async function handleProxyRequest(req: ProxyRequestView, targetUrl: string): Promise<Response> {
  /**
   * 准入校验：默认沿用严格尺子（字面量 400 / 内网 403）。
   * 部署者打开 ALLOW_PRIVATE_UPSTREAM 后放行内网——AList / OpenList 这类自建网盘
   * 通常就在局域网或本机，不放行的话用户把直链填进课程也播不出来（M3U8 与分片都会在
   * 这里被拦）。此时仍强制 http(s) 协议，只是不再拒绝私有地址。
   */
  const privateAllowed = allowPrivateUpstream();
  if (privateAllowed) {
    if (!/^https?:\/\//i.test(targetUrl)) {
      return new Response('无效的 URL', { status: 400 });
    }
  } else if (!isValidProxyUrl(targetUrl)) {
    return new Response('无效的 URL', { status: 400 });
  }

  const verdict = await checkProxyUrlAllowed(targetUrl);
  if (!verdict.ok) {
    return new Response('不允许访问私有/保留网络地址', { status: 403 });
  }

  const headers: Record<string, string> = { 'User-Agent': UA, Accept: '*/*' };
  try {
    if (isDoubanHost(new URL(targetUrl).hostname)) {
      headers.Referer = 'https://movie.douban.com/';
    }
  } catch { /* 忽略非法 URL */ }

  const range = req.headers.get('range');
  if (range) headers.Range = range;

  /**
   * ⚠️ 绝不能给「整个响应体」挂超时。
   *
   * 这里原本是 `signal: AbortSignal.timeout(TIMEOUT_MS)`（默认 8 秒），而该信号作用于
   * **整条响应流**：一段 185MB 的网课视频在同一条连接上要传几十秒，8 秒就被掐断，
   * 播放器只能反复重连重取 —— 现象就是「加载视频极慢 / 一直转圈」。
   *
   * 实测（客户端限速 200KB/s 读前 4MB）：直连 AList 能完整读满 4.00MB / 21.8s；
   * 经本代理在 12.2s / 2.22MB 处被中断（curl 退出码 18）。修掉后同一请求可读满。
   *
   * 现在改为**只对「等响应头」限时**（headerTimeoutMs），拿到响应头就解除计时，
   * body 无限时长流式透传 —— 与直播流路由（handleLiveStreamRequest）一致。
   */
  const controller = new AbortController();
  const onClientAbort = () => controller.abort();
  // 客户端断开（切集 / 关页 / 拖动进度）时终止上游，避免废弃连接占着 AList 与网盘配额
  req.signal.addEventListener('abort', onClientAbort, { once: true });

  let response: Response | undefined;
  let finalUrl = targetUrl;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fetchWithSafeRedirects(
        targetUrl,
        { headers, signal: controller.signal },
        // 逐跳复检同样要认这个开关，否则自建 AList 的重定向会被拦下
        { allowPrivate: privateAllowed, headerTimeoutMs: HEADER_TIMEOUT_MS }
      );
      response = result.res;
      finalUrl = result.finalUrl;
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!response) {
    return new Response(
      `代理请求失败: ${lastError instanceof Error ? lastError.message : '未知错误'}`,
      { status: 502 }
    );
  }

  const contentType = response.headers.get('content-type') || '';
  /**
   * 是否 HLS 清单。三个判据取或：
   * 1. content-type 声明 mpegurl；
   * 2. **最终 URL 的路径**以 `.m3u8` / `.m3u` 结尾；
   *
   * 第 2 条必须剥掉查询串再判：自建网盘（AList / OpenList）的直链形如
   * `/p/媒体/demo.m3u8?sign=…`，整串 `endsWith('.m3u8')` 为假，而它们返回的
   * content-type 又常是 `application/octet-stream`——两个判据都会落空，
   * 清单不被重写，相对分片就会被浏览器解析到 `/api/proxy?url=…` 上而播不出来。
   */
  const finalPath = (() => {
    try {
      return new URL(finalUrl).pathname.toLowerCase();
    } catch {
      return targetUrl.toLowerCase().split('?')[0];
    }
  })();
  const isM3u8 =
    contentType.includes('mpegurl') ||
    contentType.includes('x-mpegurl') ||
    finalPath.endsWith('.m3u8') ||
    finalPath.endsWith('.m3u');

  // m3u8 文本：重写为代理地址（以重定向后的最终 URL 为 base 解析相对地址）
  if (isM3u8) {
    const text = await response.text();
    return new Response(rewriteM3u8(text, finalUrl), {
      status: response.status,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // 其余（图片 / JSON / 分片 / key）流式透传
  const outHeaders = new Headers();
  for (const name of ['content-type', 'accept-ranges', 'content-range', 'etag', 'last-modified']) {
    const v = response.headers.get(name);
    if (v) outHeaders.set(name, v);
  }
  // fetch 会自动解压，转发时必须去掉长度相关头避免浏览器二次解压
  // 图片基本不变：长缓存交给浏览器与边缘 CDN（分片 / key 仍保守 1 小时）
  outHeaders.set(
    'Cache-Control',
    contentType.startsWith('image/') ? 'public, max-age=2592000' : 'public, max-age=3600'
  );
  outHeaders.set('Access-Control-Allow-Origin', '*');

  return new Response(response.body, {
    status: response.status,
    headers: outHeaders,
  });
}

/**
 * 直播流专用长连接代理（不复用 /api/proxy）：
 *
 * 直播是单一无限长连接（HTTP-FLV），对「整体超时」极其敏感；现在点播侧也已改成
 * 「仅对响应头等待设超时」，两条路由的超时语义一致：拿到响应头后 body 不再限时。
 * 本路由额外做了三件事：
 *
 * - 不重试（重试对直播无意义）；
 * - m3u8 manifest 仍需重写（变体/分片地址改指本路由），FLV 等纯透传；
 * - 每一跳都强制 SSRF 校验（不信任解析阶段的校验结果）；
 * - 部署者可设 LIVE_ALLOW_PRIVATE=1 显式放行内网自建源（默认拒绝）。
 */
export async function handleLiveStreamRequest(req: ProxyRequestView, targetUrl: string): Promise<Response> {
  const verdict = await checkLiveUrlAllowed(targetUrl);
  if (!verdict.ok) return jsonError(verdict.reason, 403);

  const controller = new AbortController();
  // 客户端断开（切台/关页）时终止上游连接，防止连接泄漏
  const onClientAbort = () => controller.abort();
  req.signal.addEventListener('abort', onClientAbort, { once: true });

  const headers: Record<string, string> = { 'User-Agent': UA, Accept: '*/*' };

  let response: Response;
  let finalUrl: string;
  try {
    // 客户端断开（切台/关页）时经 controller.signal 终止上游连接，防止连接泄漏
    const result = await fetchWithSafeRedirects(
      targetUrl,
      { headers, signal: controller.signal },
      { allowPrivate: allowLivePrivate(), headerTimeoutMs: HEADER_TIMEOUT_MS }
    );
    response = result.res;
    finalUrl = result.finalUrl;
  } catch (err) {
    return jsonError(
      `直播流连接失败: ${err instanceof Error ? err.message : '未知错误'}`,
      502
    );
  }

  if (!response.ok && response.body) {
    // 非直播正常响应（403/404 等）：透传原始状态码便于前端与开发者工具定位
    // （一律包成 502 会掩盖「token 过期 403」与「源瞬断」的区别）
    try { await response.body.cancel(); } catch { /* 忽略 */ }
    return Response.json(
      { error: `直播流上游返回 ${response.status}` },
      {
        status: response.status,
        headers: { 'Cache-Control': 'no-store', 'X-Live-Upstream-Status': String(response.status) },
      }
    );
  }

  const contentType = response.headers.get('content-type') || '';
  const isM3u8 =
    contentType.includes('mpegurl') || contentType.includes('x-mpegurl') ||
    targetUrl.toLowerCase().split('?')[0].endsWith('.m3u8');

  // HLS manifest：重写变体/分片地址指向本路由，保证后续请求同源同鉴权。
  // 关键：以重定向后的最终 URL 为 base 解析相对地址（gslb 调度源 302 后路径会变）
  if (isM3u8) {
    const text = await response.text();
    return new Response(rewriteM3u8(text, finalUrl, 0, LIVE_STREAM_BASE), {
      status: response.status,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-store',
      },
    });
  }

  // FLV / TS 等流媒体：纯流式透传（禁止缓冲与缓存）
  const outHeaders = new Headers();
  const ct = contentType || 'video/mp2t';
  outHeaders.set('Content-Type', ct);
  outHeaders.set('Cache-Control', 'no-store, no-transform');
  outHeaders.set('X-Accel-Buffering', 'no');

  return new Response(response.body, {
    status: response.status,
    headers: outHeaders,
  });
}
