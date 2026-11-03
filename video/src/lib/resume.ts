/**
 * 续播位置判定（纯函数，便于单测）。
 *
 * 播放器侧只会对「已保存位置 > 10 秒且 < 时长 - 2 秒」的地址做跳转并提示
 * 「已从 xx 继续播放」；这里负责更早一步的取舍：
 * - URL 显式带的 `position` 参数优先（分享/回链场景）；
 * - 上次已看到接近结尾时不再续播 —— 否则一进页面就结束，观感像「从头开始」；
 * - 位置过小（不足 1 秒）视为无效记录。
 */

/** 距结尾不足这么多秒就不续播（按上次记录的时长算） */
export const RESUME_TAIL_GUARD_SECONDS = 15;

export interface ProgressRecord {
  position: number;
  duration: number;
}

export function resolveResumePosition(
  entry: ProgressRecord | null | undefined,
  urlPosition = 0
): number {
  if (urlPosition > 0) return urlPosition;
  if (!entry) return 0;
  const { position, duration } = entry;
  if (!Number.isFinite(position) || position < 1) return 0;
  if (Number.isFinite(duration) && duration > 0 && position >= duration - RESUME_TAIL_GUARD_SECONDS) {
    return 0;
  }
  return position;
}