import { toServerRequest } from '@/server/adapt';
import { netdiskStreamHandler } from '@/server/handlers/netdisk';

export const runtime = 'nodejs';

export function GET(req: Request): Promise<Response> {
  return netdiskStreamHandler(toServerRequest(req));
}
