import { toServerRequest } from '@/server/adapt';
import { hotListHandler } from '@/server/handlers/hotList';

export const runtime = 'nodejs';

/** 薄壳：NextRequest → 服务核 handler → Web Response（逻辑见 src/server/handlers/hotList.ts） */
export function GET(req: Request): Promise<Response> {
  return hotListHandler(toServerRequest(req));
}