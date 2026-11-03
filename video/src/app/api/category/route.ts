import { toServerRequest } from '@/server/adapt';
import { categoryHandler } from '@/server/handlers/category';

export const runtime = 'nodejs';

/** 薄壳：NextRequest → 服务核 handler → Web Response（逻辑见 src/server/handlers/category.ts） */
export function GET(req: Request): Promise<Response> {
  return categoryHandler(toServerRequest(req));
}