/**
 * 读取当前主题的强调色，供 ArtPlayer 的 `theme` 使用。
 *
 * 取舍：ArtPlayer 的 `theme` 只接受颜色字符串，而强调色由 CSS 变量按亮/暗主题给出，
 * 因此只能在**创建播放器实例时**解析一次 CSS 变量；运行中切换亮/暗主题不会重建播放器，
 * 实例会沿用创建时的颜色。这样既与当前主题一致，又避免了重建播放器带来的换源/进度丢失风险。
 * 解析失败（SSR、变量缺失、值不是三通道 RGB）时退回深色主题的默认强调色。
 */
export function readAccentColor(): string {
  const fallback = '#0070e0';
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--c-accent').trim();
  if (!raw) return fallback;
  const parts = raw.split(/\s+/).map((n) => Number(n));
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return fallback;
  return `rgb(${parts.join(', ')})`;
}