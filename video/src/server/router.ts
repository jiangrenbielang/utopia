import { jsonResponse } from './adapt';
import { bangumiHandler } from './handlers/bangumi';
import { categoryHandler } from './handlers/category';
import { detailHandler } from './handlers/detail';
import { doubanHandler } from './handlers/douban';
import { hotListHandler } from './handlers/hotList';
import { livePlaylistHandler } from './handlers/livePlaylist';
import {
  netdiskAuthUrlHandler,
  netdiskCodeHandler,
  netdiskListHandler,
  netdiskLogoutHandler,
  netdiskScanHandler,
  netdiskStatusHandler,
  netdiskStreamHandler,
} from './handlers/netdisk';
import { pathProxyHandler, proxyHandler } from './handlers/proxy';
import { parseHandler } from './handlers/parse';
import { publishHandler } from './handlers/publish';
import { qualityHandler } from './handlers/quality';
import { searchHandler } from './handlers/search';
import { sourceListHandler } from './handlers/sourceList';
import { sourceTestHandler } from './handlers/sourceTest';
import { statusHandler } from './handlers/status';
import { tvboxHandler } from './handlers/tvbox';
import type { Route, RouteHandler, ServerRequest } from './types';

/**
 * 全量路由表：与 Next.js 构建产物 `src/app/api/**\/route.ts` 的接口逐一对应。
 * 新增接口必须同时落在这里（Electron 数据层）与那边（Next 宿主），否则桌面端没有它。
 *
 * 路径匹配规则与 Next 的 app router 对齐：
 * - 精确路径匹配（尾斜杠归一化后）；
 * - 路径段动态路由（`[url]`）按前缀匹配，段值原样（仍保持百分号编码）交给
 *   `decodePathTarget` 解码，与 Next 侧 `[url]` 参数的解码结果一致。
 */
const ROUTES: Route[] = [
  { path: '/api/status', method: 'GET', handler: statusHandler },
  { path: '/api/search', method: 'POST', handler: searchHandler },
  { path: '/api/detail', method: 'GET', handler: detailHandler },
  { path: '/api/quality', method: 'POST', handler: qualityHandler },
  { path: '/api/source/test', method: 'POST', handler: sourceTestHandler },
  { path: '/api/source-list', method: 'GET', handler: sourceListHandler },
  { path: '/api/publish', method: 'POST', handler: publishHandler },
  { path: '/api/proxy', method: 'GET', handler: proxyHandler },
  { path: '/api/live/playlist', method: 'GET', handler: livePlaylistHandler },
  { path: '/api/douban', method: 'GET', handler: doubanHandler },
  { path: '/api/hot-list', method: 'GET', handler: hotListHandler },
  { path: '/api/bangumi/calendar', method: 'GET', handler: bangumiHandler },
  { path: '/api/tvbox', method: 'GET', handler: tvboxHandler },
  { path: '/api/category', method: 'GET', handler: categoryHandler },
  { path: '/api/parse', method: 'POST', handler: parseHandler },
  // 平台自带的百度网盘能力（不经 AList / OpenList）
  { path: '/api/netdisk/status', method: 'GET', handler: netdiskStatusHandler },
  { path: '/api/netdisk/auth-url', method: 'GET', handler: netdiskAuthUrlHandler },
  { path: '/api/netdisk/code', method: 'POST', handler: netdiskCodeHandler },
  { path: '/api/netdisk/list', method: 'POST', handler: netdiskListHandler },
  { path: '/api/netdisk/stream', method: 'GET', handler: netdiskStreamHandler },
  { path: '/api/netdisk/scan', method: 'POST', handler: netdiskScanHandler },
  { path: '/api/netdisk/logout', method: 'POST', handler: netdiskLogoutHandler },
];

interface DynamicRoute {
  /** 前缀（含结尾斜杠）：命中后其余部分即动态段的值 */
  prefix: string;
  method: 'GET' | 'POST';
  handler: RouteHandler;
  /** 动态段的参数名（对应 Next 侧的 `[url]`） */
  param: string;
}

const DYNAMIC_ROUTES: DynamicRoute[] = [
  // 旧路径形式：/api/proxy/<encodeURIComponent(target)>
  { prefix: '/api/proxy/', method: 'GET', handler: pathProxyHandler, param: 'url' },
];

/** 方法不匹配时的 405 响应（与 Next 的行为一致：带上 Allow） */
function methodNotAllowed(allow: string): Response {
  return jsonResponse({ error: '方法不允许' }, { status: 405, headers: { Allow: allow } });
}

/** 处理器抛错时的兜底 500（响应头已发出的情况由宿主侧处理，这里只管还没写响应） */
function serverError(err: unknown): Response {
  return jsonResponse(
    { error: err instanceof Error ? err.message : '服务端内部错误' },
    { status: 500 }
  );
}

/** 去掉尾斜杠：`/api/status/` 等价于 `/api/status`（与 Next 的 app router 一致） */
function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.replace(/\/+$/, '');
  return pathname;
}

/**
 * 路由分发：唯一入口。两个宿主（Next Route Handler 壳子 / Electron 主进程 http.Server）
 * 都只调用这一个函数，保证两侧的路由行为不会漂移。
 */
export async function route(req: ServerRequest): Promise<Response> {
  let pathname: string;
  try {
    pathname = normalizePathname(new URL(req.url).pathname);
  } catch {
    return jsonResponse({ error: '无效的请求地址' }, { status: 400 });
  }

  const exact = ROUTES.find((r) => r.path === pathname);
  if (exact) {
    if (exact.method !== req.method) return methodNotAllowed(exact.method);
    try {
      return await exact.handler(req);
    } catch (err) {
      return serverError(err);
    }
  }

  for (const dyn of DYNAMIC_ROUTES) {
    if (!pathname.startsWith(dyn.prefix)) continue;
    const rest = pathname.slice(dyn.prefix.length);
    // 空段不是合法路由（`/api/proxy/` 应落到 404），与 Next 的动态段要求一致
    if (!rest) continue;
    if (dyn.method !== req.method) return methodNotAllowed(dyn.method);
    try {
      return await dyn.handler({ ...req, params: { [dyn.param]: rest } });
    } catch (err) {
      return serverError(err);
    }
  }

  return jsonResponse({ error: '接口不存在' }, { status: 404 });
}