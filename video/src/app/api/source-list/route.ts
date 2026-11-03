import { toServerRequest } from '@/server/adapt';
import { sourceListHandler } from '@/server/handlers/sourceList';

export const runtime = 'nodejs';

/** 薄壳：NextRequest → 服务核 handler → Web Response（逻辑见 src/server/handlers/sourceList.ts） */
export function GET(req: Request): Promise<Response> {
  return sourceListHandler(toServerRequest(req));
}