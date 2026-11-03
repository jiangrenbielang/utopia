import { toServerRequest } from '@/server/adapt';
import { qualityHandler } from '@/server/handlers/quality';

export const runtime = 'nodejs';

/** 薄壳：NextRequest → 服务核 handler → Web Response（逻辑见 src/server/handlers/quality.ts） */
export function POST(req: Request): Promise<Response> {
  return qualityHandler(toServerRequest(req));
}