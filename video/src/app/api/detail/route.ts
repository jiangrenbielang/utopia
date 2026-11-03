import { toServerRequest } from '@/server/adapt';
import { detailHandler } from '@/server/handlers/detail';

export const runtime = 'nodejs';

/** 薄壳：NextRequest → 服务核 handler → Web Response（逻辑见 src/server/handlers/detail.ts） */
export function GET(req: Request): Promise<Response> {
  return detailHandler(toServerRequest(req));
}