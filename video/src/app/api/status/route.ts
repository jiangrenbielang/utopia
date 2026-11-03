import { statusHandler } from '@/server/handlers/status';

export const runtime = 'nodejs';

/**
 * 薄壳：Next.js Route Handler → 服务核 handler（逻辑见 src/server/handlers/status.ts）。
 * 状态与请求无关，服务核 handler 无入参。
 */
export function GET(): Response {
  return statusHandler();
}