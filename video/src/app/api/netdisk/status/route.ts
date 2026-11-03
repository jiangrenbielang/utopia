import { netdiskStatusHandler } from '@/server/handlers/netdisk';

export const runtime = 'nodejs';

export function GET(): Response {
  return netdiskStatusHandler();
}
