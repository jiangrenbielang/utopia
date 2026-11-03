import { toServerRequest } from '@/server/adapt';
import { searchHandler } from '@/server/handlers/search';

export const runtime = 'nodejs';

/** 薄壳：NextRequest → 服务核 handler → Web Response（逻辑见 src/server/handlers/search.ts） */
export function POST(req: Request): Promise<Response> {
  return searchHandler(toServerRequest(req));
}