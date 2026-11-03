import { fetchUpstream } from '../../lib/fetch-utils';
import { buildParseRequest, parsePlayResult } from '../../lib/parse-url';
import { checkUpstreamAllowed, isValidProxyUrl } from '../../lib/ssrf';
import { jsonResponse } from '../adapt';
import { requestTimeoutMs } from '../request-timeout';
import type { ServerRequest } from '../types';

/**
 * POST /api/parse —— 用一条 TVBOX 解析线路去换真实播放地址。
 *
 * 请求体：`{ parseUrl: string, target: string }`
 *   - `parseUrl`：配置里 `parses[]` 的地址（通常自带 `?url=` 尾巴）；
 *   - `target`：待解析的播放页地址。
 *
 * 响应（都是 200，用 `kind` 区分结果，便于前端给不同提示）：
 *   - `{ ok:true,  kind:'resolved', url, header? }` 拿到地址
 *   - `{ ok:false, kind:'needs-browser', message, upstreamStatus }` 该线路返回播放页
 *     ——`type:0` 的黑盒嗅探需要浏览器执行脚本，本客户端做不到，如实告知而不是报错
 *   - `{ ok:false, kind:'no-url' | 'empty', message, upstreamStatus }` 线路没给出地址
 * 传输入错（地址非法 / SSRF 拦下 / 请求失败）才用 4xx/5xx + `{ error }`。
 *
 * 安全：`parseUrl` 是用户可配地址，必须过字面量 + DNS 双校验；
 * `target` 只做**字面量**校验——我们不请求它，只是把它交给第三方解析服务，
 * 但同样不该把内网地址递出去。
 */
export async function parseHandler(req: ServerRequest): Promise<Response> {
  let body: { parseUrl?: unknown; target?: unknown };
  try {
    body = (await req.json()) as { parseUrl?: unknown; target?: unknown };
  } catch {
    return jsonResponse({ error: '请求格式错误' }, { status: 400 });
  }

  const parseUrl = typeof body.parseUrl === 'string' ? body.parseUrl.trim() : '';
  const target = typeof body.target === 'string' ? body.target.trim() : '';
  if (!isValidProxyUrl(parseUrl)) {
    return jsonResponse({ error: '无效的解析地址' }, { status: 400 });
  }
  if (!isValidProxyUrl(target)) {
    return jsonResponse({ error: '无效的待解析地址' }, { status: 400 });
  }

  const verdict = await checkUpstreamAllowed(parseUrl);
  if (!verdict.ok) {
    return jsonResponse({ error: verdict.reason }, { status: 403 });
  }

  try {
    const res = await fetchUpstream(buildParseRequest(parseUrl, target), {
      timeoutMs: requestTimeoutMs(),
      headers: { Accept: '*/*' },
    });
    const contentType = res.headers.get('content-type') || '';
    // 解析接口只该返回一小段内容；截断是为了防上游返回巨大页面把内存吃掉
    const text = (await res.text()).slice(0, MAX_BODY_BYTES);
    const outcome = parsePlayResult(text, contentType);

    if (outcome.kind === 'resolved') {
      return jsonResponse(
        { ok: true, kind: 'resolved', url: outcome.url, header: outcome.header },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }
    // 非 2xx 也照样解析响应体：不少解析站用 502 + JSON 说明具体原因
    return jsonResponse(
      { ok: false, kind: outcome.kind, message: outcome.message, upstreamStatus: res.status },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    return jsonResponse(
      { error: `解析线路请求失败：${err instanceof Error ? err.message : '未知错误'}` },
      { status: 502 }
    );
  }
}

/** 解析响应体上限：只该是一小段 JSON / 播放页，超出说明目标不对 */
const MAX_BODY_BYTES = 512 * 1024;