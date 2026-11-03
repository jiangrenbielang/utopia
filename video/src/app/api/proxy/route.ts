import { toServerRequest } from '@/server/adapt';
import { proxyHandler } from '@/server/handlers/proxy';

export const runtime = 'nodejs';

/** 薄壳：NextRequest → 服务核 handler → Web Response（逻辑见 src/server/handlers/proxy.ts） */
export function GET(req: Request): Promise<Response> {
  return proxyHandler(toServerRequest(req));
}