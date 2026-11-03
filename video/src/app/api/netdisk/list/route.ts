import { toServerRequest } from '@/server/adapt';
import { netdiskListHandler } from '@/server/handlers/netdisk';

export const runtime = 'nodejs';

export function POST(req: Request): Promise<Response> {
  return netdiskListHandler(toServerRequest(req));
}
