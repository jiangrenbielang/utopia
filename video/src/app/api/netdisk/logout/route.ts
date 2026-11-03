import { netdiskLogoutHandler } from '@/server/handlers/netdisk';

export const runtime = 'nodejs';

export function POST(): Response {
  return netdiskLogoutHandler();
}
