import { toServerRequest } from '@/server/adapt';
import { tvboxHandler } from '@/server/handlers/tvbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 薄壳：NextRequest → 服务核 handler → Web Response（逻辑见 src/server/handlers/tvbox.ts） */
export function GET(req: Request): Promise<Response> {
  return tvboxHandler(toServerRequest(req));
}