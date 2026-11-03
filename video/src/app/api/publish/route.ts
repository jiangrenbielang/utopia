import { toServerRequest } from '@/server/adapt';
import { publishHandler } from '@/server/handlers/publish';

export const runtime = 'nodejs';

/** 薄壳：NextRequest → 服务核 handler → Web Response（逻辑见 src/server/handlers/publish.ts） */
export function POST(req: Request): Promise<Response> {
  return publishHandler(toServerRequest(req));
}