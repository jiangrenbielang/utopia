/** 本地日期工具：全部按设备本地时区计算，避免 UTC 造成的跨日错位。 */

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 本地日期 → yyyy-MM-dd */
export function dateKey(value: Date | number = new Date()): string {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** yyyy-MM-dd → 本地 0 点 */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map((n) => parseInt(n, 10));
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

export function startOfDay(value: Date = new Date()): Date {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(value: Date, days: number): Date {
  const d = new Date(value);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(value: Date, months: number): Date {
  const d = new Date(value);
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** 周一为一周起点 */
export function startOfWeek(value: Date): Date {
  const d = startOfDay(value);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(d, offset);
}

export function startOfMonth(value: Date): Date {
  const d = startOfDay(value);
  d.setDate(1);
  return d;
}

/** 两个本地 0 点之间的整天数 */
export function diffDays(from: Date, to: Date): number {
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function weekdayCn(value: Date): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][value.getDay()];
}

/** 8月7日 周五 */
export function formatDateShort(value: Date | string): string {
  const d = typeof value === 'string' ? parseDateKey(value) : value;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekdayCn(d)}`;
}

/** 今天 / 昨天 / 8月7日 周五 */
export function dateLabel(key: string): string {
  const today = dateKey();
  const yesterday = dateKey(addDays(new Date(), -1));
  if (key === today) return '今天';
  if (key === yesterday) return '昨天';
  return formatDateShort(key);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}
