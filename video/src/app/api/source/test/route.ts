import { toServerRequest } from '@/server/adapt';
import { sourceTestHandler } from '@/server/handlers/sourceTest';

export const runtime = 'nodejs';

/** 薄壳：NextRequest → 服务核 handler → Web Response（逻辑见 src/server/handlers/sourceTest.ts） */
export function POST(req: Request): Promise<Response> {
  return sourceTestHandler(toServerRequest(req));
}