import { toServerRequest } from '@/server/adapt';
import { netdiskCodeHandler } from '@/server/handlers/netdisk';

export const runtime = 'nodejs';

export function POST(req: Request): Promise<Response> {
  return netdiskCodeHandler(toServerRequest(req));
}
