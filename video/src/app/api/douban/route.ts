import { toServerRequest } from '@/server/adapt';
import { doubanHandler } from '@/server/handlers/douban';

export const runtime = 'nodejs';

/** 薄壳：NextRequest → 服务核 handler → Web Response（逻辑见 src/server/handlers/douban.ts） */
export function GET(req: Request): Promise<Response> {
  return doubanHandler(toServerRequest(req));
}