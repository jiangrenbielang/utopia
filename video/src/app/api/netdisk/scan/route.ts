import { toServerRequest } from '@/server/adapt';
import { netdiskScanHandler } from '@/server/handlers/netdisk';

export const runtime = 'nodejs';

export function POST(req: Request): Promise<Response> {
  return netdiskScanHandler(toServerRequest(req));
}