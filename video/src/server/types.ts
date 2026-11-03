/**
 * 服务核（Electron 主进程内建数据层）的框架无关类型。
 *
 * 「一份逻辑、两个宿主」是本目录存在的理由：
 * - 宿主一：Next.js Route Handler（`src/app/api/**\/route.ts` 只是薄壳）；
 * - 宿主二：Electron 主进程的纯 Node `http.Server`（`desktop/web-server.js` 把 /api/* 挂进来）。
 *
 * 因此这里刻意不出现 `NextRequest` / `http.IncomingMessage` 等任一宿主的类型：
 * 请求侧用下面的 `ServerRequest`（两个宿主都能现成提供），
 * 响应侧统一用 Web 标准 `Response`（Next 直接接受它，Node 侧用
 * `Readable.fromWeb(res.body)` 管到 `http.ServerResponse`）。
 */

/** 请求侧最小视图：两个宿主都能廉价构造出来 */
export interface ServerRequest {
  /** 大写 HTTP 方法 */
  method: string;
  /** 完整请求 URL（含查询串），如 `http://127.0.0.1:3210/api/detail?id=1` */
  url: string;
  /** 请求头 */
  headers: Headers;
  /** 动态路由段（如 `[url]`），无动态段时为空对象 */
  params: Record<string, string>;
  /** 客户端断开信号（长连接/流式接口用来终止上游请求） */
  signal: AbortSignal;
  /** 解析请求体 JSON；非 JSON 时抛错（与 `Request.json()` 语义一致） */
  json(): Promise<unknown>;
  /** 读取请求体文本 */
  text(): Promise<string>;
}

/** 路由处理器：一份逻辑，两个宿主共用 */
export type RouteHandler = (req: ServerRequest) => Promise<Response> | Response;

/** 路由表条目 */
export interface Route {
  /** 精确匹配的 pathname（动态段路由走 prefix 匹配，见 router.ts） */
  path: string;
  /** 允许的方法 */
  method: 'GET' | 'POST';
  handler: RouteHandler;
}