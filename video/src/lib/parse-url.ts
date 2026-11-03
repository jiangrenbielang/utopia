/**
 * TVBOX「解析线路」的契约层（纯函数）。
 *
 * ## 这个契约的证据边界（实现前先说清楚）
 *
 * - **请求形状有配置证据**：实测真实配置里的解析地址**全部**写成
 *   `https://host/.../player/?url=` 或 `https://host/?url=` 这种「已带 `?url=` 尾巴」的形式
 *   （15 条里有 5 条可达的都是如此），客户端把原始播放地址直接接在后面即可；
 *   少数只给到路径的，补一个 `?url=`。
 * - **响应形状有源码证据**：播放结果是 TVBOX 的 play-result JSON，字段表
 *   （`url` / `header` / `parse` / `jx` …）来自上游客户端源码，见
 *   `docs/tvbox-config-and-ui-spec.md` §3.4。
 * - **无法核实的部分**：能连通的那几条解析接口返回的是 **HTML 播放页**（不是 JSON），
 *   即 `type:0` 的「黑盒嗅探」——那需要浏览器执行页面脚本并拦截媒体请求。
 *   因此本模块把「返回 HTML」当作**一等结果**（`needs-browser`）而不是错误：
 *   能解析就给出地址，不能解析就说清楚原因，不假装成功。
 *
 * 纯函数、无 IO，便于直接单测。
 */

/** 解析成功后的结果 */
export interface ParseResolved {
  kind: 'resolved';
  /** 真实可播放地址（只接受 http(s)） */
  url: string;
  /** 播放器需要附带的请求头（防盗链） */
  header?: Record<string, string>;
}

/** 解析线路返回的是页面而不是接口：需要浏览器嗅探，本客户端做不到 */
export interface ParseNeedsBrowser {
  kind: 'needs-browser';
  message: string;
}

/** 返回了 JSON 但没有可用地址 */
export interface ParseNoUrl {
  kind: 'no-url';
  message: string;
}

/** 空响应 */
export interface ParseEmpty {
  kind: 'empty';
  message: string;
}

export type ParseOutcome = ParseResolved | ParseNeedsBrowser | ParseNoUrl | ParseEmpty;

/** 播放结果 JSON 里我们认得的字段（其余字段忽略，不做校验） */
interface PlayResultLike {
  url?: unknown;
  header?: unknown;
  msg?: unknown;
}

/**
 * 拼装解析请求地址。
 *
 * 真实配置的解析地址几乎都自带 `?url=` 结尾（实测 5/5 可达条目都是），此时**直接拼接**
 * 原始播放地址——注意是原始而非编码后的：社区实现就是这么调的，编码后反而取不到
 * （实测同一接口「拼接编码后地址」直接超时，而「原始地址直接拼接」返回 200）。
 * 若地址既不以 `=` 结尾也不含查询串，则补一个 `?url=`。
 */
export function buildParseRequest(parseUrl: string, target: string): string {
  const base = parseUrl.trim();
  if (!base) return '';
  // 以 `=` 结尾（如 `?url=`、`&url=`）：尾巴已经就位，直接接上目标地址
  if (base.endsWith('=')) return `${base}${target}`;
  return `${base}${base.includes('?') ? '&' : '?'}url=${target}`;
}

/** 判断响应体是不是 HTML 页面（解析线路返回播放页的典型特征） */
export function looksLikeHtml(body: string, contentType?: string): boolean {
  if (contentType && /text\/html/i.test(contentType)) return true;
  const head = body.replace(/^\uFEFF/, '').trimStart().slice(0, 200).toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<head') || head.startsWith('<body');
}

/** 取请求头对象（值转字符串，丢弃空项） */
function readHeader(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string' && raw.trim() !== '') out[key] = raw;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * 把解析线路的响应体解析成结果。
 *
 * 判定顺序刻意是「先看是不是页面」：真实的可达接口返回的就是 HTML 播放页，
 * 若先当 JSON 解析只会得到一句「不是合法 JSON」，用户无法区分「线路坏了」和
 * 「这条线路本客户端跑不了」。
 */
export function parsePlayResult(body: string, contentType?: string): ParseOutcome {
  const text = (body || '').replace(/^\uFEFF/, '').trim();
  if (!text) return { kind: 'empty', message: '解析线路没有返回内容' };
  if (looksLikeHtml(text, contentType)) {
    return {
      kind: 'needs-browser',
      message: '这条解析线路返回的是播放页（需要在浏览器里执行脚本、拦截真实媒体请求），本客户端无法运行它',
    };
  }

  let json: PlayResultLike;
  try {
    json = JSON.parse(text) as PlayResultLike;
  } catch {
    return {
      kind: 'no-url',
      message: '解析线路返回的内容既不是播放页也不是 JSON，无法识别',
    };
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { kind: 'no-url', message: '解析线路返回的 JSON 结构不认识' };
  }

  const url = typeof json.url === 'string' ? json.url.trim() : '';
  if (url && /^https?:\/\//i.test(url)) {
    return { kind: 'resolved', url, header: readHeader(json.header) };
  }

  // 上游给的原因可能比自己编的文案有用（例如「该视频需要 VIP」）
  const reason = typeof json.msg === 'string' && json.msg.trim() !== '' ? json.msg.trim() : '';
  return {
    kind: 'no-url',
    message: reason ? `解析线路没有给出地址：${reason}` : '解析线路返回的 JSON 里没有可用的播放地址',
  };
}