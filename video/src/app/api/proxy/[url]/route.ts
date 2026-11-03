import { toServerRequest } from '@/server/adapt';
import { pathProxyHandler } from '@/server/handlers/proxy';

export const runtime = 'nodejs';

/** 薄壳：NextRequest + 动态段 → 服务核 handler → Web Response（逻辑见 src/server/handlers/proxy.ts） */
export async function GET(req: Request, ctx: { params: Promise<{ url: string }> }): Promise<Response> {
  const { url } = await ctx.params;
  return pathProxyHandler(toServerRequest(req, { url }));
}