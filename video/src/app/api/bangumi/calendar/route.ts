import { bangumiHandler } from '@/server/handlers/bangumi';

export const runtime = 'nodejs';

/**
 * 薄壳：Next.js Route Handler → 服务核 handler（逻辑见 src/server/handlers/bangumi.ts）。
 * 每日放送表与请求参数无关，服务核 handler 无入参。
 */
export function GET(): Promise<Response> {
  return bangumiHandler();
}