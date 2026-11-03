import { describe, expect, it } from 'vitest';
import { RESUME_TAIL_GUARD_SECONDS, resolveResumePosition } from './resume';

/**
 * 续播位置判定。
 *
 * 起因：网盘视频从「网盘」页播放时没有 `lessonId`/`vodId`，进度根本没落盘，
 * 每次从头开始。修好落盘键之后，这里锁住几条边界，避免「一进去就结束」这种更糟的体验。
 */
describe('resolveResumePosition', () => {
  it('没有记录 → 从头播', () => {
    expect(resolveResumePosition(undefined)).toBe(0);
    expect(resolveResumePosition(null)).toBe(0);
  });

  it('URL 显式带的 position 优先（分享/回链场景）', () => {
    expect(resolveResumePosition({ position: 120, duration: 3600 }, 600)).toBe(600);
    // 即使记录已接近结尾，URL 明确要求某个位置也照样回到那里
    expect(resolveResumePosition({ position: 3595, duration: 3600 }, 30)).toBe(30);
  });

  it('看到一半 → 从记录位置继续', () => {
    expect(resolveResumePosition({ position: 1200, duration: 3600 })).toBe(1200);
  });

  it('记录不足 1 秒视为无效', () => {
    expect(resolveResumePosition({ position: 0.4, duration: 3600 })).toBe(0);
    expect(resolveResumePosition({ position: 0, duration: 3600 })).toBe(0);
  });

  it('已接近结尾 → 不再续播（否则一进页面就结束）', () => {
    const duration = 3600;
    expect(resolveResumePosition({ position: duration - RESUME_TAIL_GUARD_SECONDS, duration })).toBe(0);
    expect(resolveResumePosition({ position: duration - 5, duration })).toBe(0);
    // 差一点到保护线之外仍应续播
    expect(resolveResumePosition({ position: duration - RESUME_TAIL_GUARD_SECONDS - 1, duration })).toBe(
      duration - RESUME_TAIL_GUARD_SECONDS - 1
    );
  });

  it('时长未知（0）时不套用结尾保护，正常续播', () => {
    expect(resolveResumePosition({ position: 500, duration: 0 })).toBe(500);
  });

  it('位置不是有限数 → 从头播', () => {
    expect(resolveResumePosition({ position: Number.NaN, duration: 3600 })).toBe(0);
  });
});