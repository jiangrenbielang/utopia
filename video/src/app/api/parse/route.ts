import { toServerRequest } from '@/server/adapt';
import { parseHandler } from '@/server/handlers/parse';

export const runtime = 'nodejs';

/**
 * 薄壳：Next.js Route Handler → 服务核 handler
 * （解析线路的全部逻辑见 src/server/handlers/parse.ts，桌面端数据层共用同一份）。
 */
export async function POST(req: Request): Promise<Response> {
  return parseHandler(toServerRequest(req));
}