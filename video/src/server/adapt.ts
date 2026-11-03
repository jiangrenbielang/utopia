import type { ServerRequest } from './types';

/**
 * Next.js 的 Route Handler 壳子用这个适配器把 `Request`/`NextRequest` 变成服务核认识的
 * `ServerRequest`。Node 宿主的适配在 `index.ts` 里（从 `http.IncomingMessage` 构造）。
 *
 * 刻意**惰性**转发 `json()`/`text()`：请求体只在处理器真正读取时才消费，
 * 与直接调用 `req.json()` 的行为一致（未读的请求体不会在这里被提前吃掉）。
 */
export function toServerRequest(req: Request, params: Record<string, string> = {}): ServerRequest {
  return {
    method: req.method,
    url: req.url,
    headers: req.headers,
    params,
    signal: req.signal,
    json: () => req.json(),
    text: () => req.text(),
  };
}

/**
 * JSON 响应的统一出口。
 *
 * 语义与 `NextResponse.json(data, init)` 一致，但产出的是 Web 标准 `Response`：
 * Next 的 Route Handler 直接接受它，Node 侧也能直接写回 `http.ServerResponse`。
 * 全部处理器都走这一个函数，避免两个宿主的响应细节出现分歧。
 */
export function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

/** NDJSON（每行一个 JSON）流式响应的公共响应头 */
export const NDJSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/x-ndjson; charset=utf-8',
  'Cache-Control': 'no-store',
  // 禁用反向代理缓冲，保证每条结果立即到达客户端
  'X-Accel-Buffering': 'no',
};