import { decodePathTarget, handleProxyRequest } from '../../lib/proxy-handlers';
import type { ServerRequest } from '../types';

/**
 * 查询串形式的通用代理：/api/proxy?url=<encodeURIComponent(target)>。
 * 查询串不参与网关路径归一化（EdgeOne 等会把路径里的 %2F 解码成 /），
 * 全平台行为一致；旧路径形式 /api/proxy/<encoded> 仍由 pathProxyHandler 兼容。
 */
export async function proxyHandler(req: ServerRequest): Promise<Response> {
  const targetUrl = new URL(req.url).searchParams.get('url');
  if (!targetUrl) return new Response('缺少 url 参数', { status: 400 });
  return handleProxyRequest(req, targetUrl);
}

/** 旧路径形式的通用代理：/api/proxy/<encodeURIComponent(target)>，保持兼容（详见 proxy-handlers.ts） */
export async function pathProxyHandler(req: ServerRequest): Promise<Response> {
  return handleProxyRequest(req, decodePathTarget(req.params.url || ''));
}