import http from 'node:http';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import { route } from './router';
import type { ServerRequest } from './types';

/**
 * 服务核的 Node 宿主：把 `src/server/**` 的同一份逻辑挂到一个纯 `http.Server` 上。
 *
 * - `createServer()` 返回尚未 listen 的 `http.Server`（Electron 主进程把它和静态文件
 *   服务合并挂在同一个 3210 端口上，见 `desktop/web-server.js`）；
 *   也可以直接 `listen(3210, '127.0.0.1')` 单独起一个数据层。
 * - 请求侧把 `http.IncomingMessage` 适配成 `ServerRequest`；
 *   响应侧把 Web 标准 `Response` 适配回 `http.ServerResponse`（流式用 `Readable.fromWeb`），
 *   因此 NDJSON 逐条推送与 HTTP-FLV 长连接的行为与 Next 宿主完全一致。
 */

/** 数据层默认监听端口：与旧版 Next.js standalone 服务保持同一个 origin */
export const DEFAULT_PORT = 3210;
/** 只监听环回地址：本地数据层不对外暴露 */
export const DEFAULT_HOST = '127.0.0.1';

/**
 * 固定 origin。
 * 处理器只用到 pathname / searchParams（以及个别 `new URL(source.url)`），
 * 用固定值可以避免把请求头里的 Host 带进后续解析。
 */
const ORIGIN = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;

/** 请求体上限：本数据层的请求体都是小 JSON，超出即拒（防内存放大） */
const MAX_BODY_BYTES = 16 * 1024 * 1024;

/** 读取请求体（只在处理器真正调用 json()/text() 时才发生） */
function readRequestBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
    req.on('aborted', () => reject(new Error('客户端已断开')));
  });
}

/** 统一的错误响应（请求体读取失败等） */
function badRequest(err: unknown): Response {
  return Response.json(
    { error: err instanceof Error ? err.message : '请求体读取失败' },
    { status: 400 }
  );
}

/**
 * `http.IncomingMessage` → `ServerRequest`。
 * 请求体惰性读取并缓存：处理器重复调用 `json()`/`text()` 不会第二次消费流。
 * `signal` 在客户端断开（响应连接 close）时触发，供直播长连接代理终止上游请求。
 */
export function createServerRequest(req: http.IncomingMessage, res: http.ServerResponse): ServerRequest {
  const controller = new AbortController();
  const abort = () => controller.abort();
  res.on('close', abort);
  req.on('aborted', abort);

  let bodyPromise: Promise<Buffer> | null = null;
  const body = () => {
    if (!bodyPromise) bodyPromise = readRequestBody(req);
    return bodyPromise;
  };

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (typeof value === 'string') {
      headers.set(name, value);
    }
  }

  return {
    method: (req.method || 'GET').toUpperCase(),
    url: `${ORIGIN}${req.url || '/'}`,
    headers,
    params: {},
    signal: controller.signal,
    json: async () => JSON.parse((await body()).toString('utf8')) as unknown,
    text: async () => (await body()).toString('utf8'),
  };
}

/** 状态码不允许带响应体（Node 会拒绝写入） */
function hasNoBody(status: number): boolean {
  return status === 204 || status === 304 || (status >= 100 && status < 200);
}

/**
 * Web 标准 `Response` → `http.ServerResponse`。
 *
 * 流式 body 直接 `Readable.fromWeb(...).pipe(...)`：
 * - 天然支持 NDJSON（逐条推送）与 HTTP-FLV（无限长连接）；
 * - 不设置 content-length，走 chunked，`Range`/`206` 由上游响应头原样透传；
 * - 客户端断开时销毁 body（从而取消上游 fetch），避免连接泄漏。
 */
export async function writeResponse(
  response: Response,
  nodeRes: http.ServerResponse,
  headOnly = false
): Promise<void> {
  nodeRes.statusCode = response.status;
  for (const [name, value] of response.headers) {
    // 本数据层不产生 Set-Cookie（代理只透传白名单响应头），因此不做 cookie 特殊处理
    if (name.toLowerCase() === 'set-cookie') continue;
    nodeRes.setHeader(name, value);
  }

  if (headOnly || hasNoBody(response.status) || response.body === null) {
    nodeRes.end();
    return;
  }

  nodeRes.flushHeaders();
  const body = Readable.fromWeb(response.body as unknown as NodeWebReadableStream<Uint8Array>);

  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    body.on('error', () => {
      nodeRes.destroy();
      done();
    });
    nodeRes.on('close', () => {
      body.destroy();
      done();
    });
    nodeRes.on('finish', done);
    body.pipe(nodeRes);
  });
}

/**
 * 纯 Node 的请求处理器：路由分发 + 响应回写。
 * 两个用途——`createServer()` 的监听器，以及被 `desktop/web-server.js` 直接挂在
 * 合并端口上（`/api/*` 走这里，其余走静态文件）。
 */
export async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const serverReq = createServerRequest(req, res);
  let response: Response;
  try {
    response = await route(serverReq);
  } catch (err) {
    response = badRequest(err);
  }

  if (res.writableEnded) return;
  try {
    await writeResponse(response, res, (req.method || 'GET').toUpperCase() === 'HEAD');
  } catch {
    // 响应头已发出后连接出错（客户端断开等）：直接销毁连接
    if (!res.writableEnded) res.destroy();
  }
}

/** 创建（尚未 listen 的）数据层 http.Server */
export function createServer(): http.Server {
  const server = http.createServer((req, res) => {
    void handleRequest(req, res);
  });
  // 长连接（HTTP-FLV / NDJSON）不设响应超时：body 时长不受限
  server.requestTimeout = 0;
  server.headersTimeout = 60_000;
  server.keepAliveTimeout = 30_000;
  return server;
}

/** 创建并监听环回地址，返回已就绪的 http.Server */
export function startServer(port: number = DEFAULT_PORT, host: string = DEFAULT_HOST): Promise<http.Server> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => reject(err);
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve(server);
    });
  });
}

export { route } from './router';
export type { Route, RouteHandler, ServerRequest } from './types';
export { jsonResponse } from './adapt';