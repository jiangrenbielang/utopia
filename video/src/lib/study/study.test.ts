import { describe, expect, it } from 'vitest';
import { addDays, dateKey, startOfDay, startOfMonth, startOfWeek } from './date';
import { computePeriod, cumulativeTotals, getPeriodRange, recordsInRange, studyStreak, subjectTotals } from './stats';
import { formatClock, formatMinutes, formatMinutesCompact } from './format';
import { extractBilibiliEmbed } from './embed';
import type { StudyRecord } from './types';

function record(partial: Partial<StudyRecord> & { recordDate: string; durationMin: number }): StudyRecord {
  const start = new Date(`${partial.recordDate}T09:00:00`).getTime();
  return {
    recordId: Math.floor(Math.random() * 100000),
    startTimestamp: start,
    endTimestamp: start + partial.durationMin * 60_000,
    subjectName: '数学',
    studyContent: '',
    createdAt: start,
    updatedAt: start,
    ...partial,
    durationMin: partial.durationMin,
    recordDate: partial.recordDate,
  };
}

describe('统计口径', () => {
  const today = startOfDay();

  it('日视图为今天 0 点 ~ 明天 0 点', () => {
    const range = getPeriodRange('day', today);
    expect(dateKey(range.start)).toBe(dateKey(today));
    expect(dateKey(range.end)).toBe(dateKey(addDays(today, 1)));
    expect(range.elapsedDays).toBe(1);
  });

  it('周视图以周一为起点（自然周）', () => {
    const range = getPeriodRange('week', today);
    expect(range.start.getDay()).toBe(1);
    expect(dateKey(range.end)).toBe(dateKey(addDays(range.start, 7)));
    expect(range.elapsedDays).toBeGreaterThanOrEqual(1);
    expect(range.elapsedDays).toBeLessThanOrEqual(7);
  });

  it('月视图以 1 日为起点', () => {
    const range = getPeriodRange('month', today);
    expect(dateKey(range.start)).toBe(dateKey(startOfMonth(today)));
    expect(range.elapsedDays).toBe(new Date().getDate());
  });

  it('周期过滤包含起始日、不包含结束日', () => {
    const start = startOfDay();
    const end = addDays(start, 1);
    const records = [
      record({ recordDate: dateKey(start), durationMin: 10 }),
      record({ recordDate: dateKey(end), durationMin: 20 }),
    ];
    expect(recordsInRange(records, start, end)).toHaveLength(1);
  });

  it('各科占比按分钟四舍五入到整数', () => {
    const totals = subjectTotals([
      record({ recordDate: '2026-10-01', durationMin: 60, subjectName: '数学' }),
      record({ recordDate: '2026-10-01', durationMin: 30, subjectName: '英语' }),
      record({ recordDate: '2026-10-01', durationMin: 10, subjectName: '其他' }),
    ]);
    expect(totals.map((t) => t.pct)).toEqual([60, 30, 10]);
    expect(totals[0].color).toBe('#4A90D9');
  });

  it('日均 = 周期时长 / 已过天数，累计不受筛选影响', () => {
    const records = [
      record({ recordDate: dateKey(today), durationMin: 60 }),
      record({ recordDate: dateKey(addDays(today, -1)), durationMin: 30 }),
    ];
    const period = computePeriod(records, 'day', today);
    expect(period.totalMin).toBe(60);
    expect(period.dailyAvgMin).toBe(60);
    expect(cumulativeTotals(records)).toEqual({ count: 2, totalMin: 90 });
  });

  it('连续打卡可跨到昨天，中断则为 0', () => {
    const records = [
      record({ recordDate: dateKey(today), durationMin: 1 }),
      record({ recordDate: dateKey(addDays(today, -1)), durationMin: 1 }),
      record({ recordDate: dateKey(addDays(today, -2)), durationMin: 1 }),
    ];
    expect(studyStreak(records)).toBe(3);
    expect(studyStreak([record({ recordDate: dateKey(addDays(today, -2)), durationMin: 1 })])).toBe(0);
  });

  it('周一作为一周第一天', () => {
    const wednesday = new Date(2026, 9, 21); // 2026-10-21 周三
    expect(startOfWeek(wednesday).getDay()).toBe(1);
    expect(dateKey(startOfWeek(wednesday))).toBe('2026-10-19');
  });
});

describe('B 站嵌入', () => {
  const iframe =
    '<iframe src="//player.bilibili.com/player.html?isOutside=true&aid=116281978197595&bvid=BV19PQBBREK1&cid=36927900669&p=35" scrolling="no" allowfullscreen="true"></iframe>';

  it('从整段 iframe 代码中提取播放器地址并升级为 https', () => {
    const url = extractBilibiliEmbed(iframe);
    expect(url).toBe(
      'https://player.bilibili.com/player.html?isOutside=true&aid=116281978197595&bvid=BV19PQBBREK1&cid=36927900669&p=35'
    );
  });

  it('拒绝非 B 站或非播放器地址', () => {
    expect(extractBilibiliEmbed('https://example.com/video.m3u8')).toBeNull();
    expect(extractBilibiliEmbed('https://player.bilibili.com.evil.com/player.html?aid=1')).toBeNull();
    expect(extractBilibiliEmbed('https://www.bilibili.com/video/BV19PQBBREK1')).toBeNull();
  });
});

describe('时长格式', () => {
  it('计时器显示', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(3725)).toBe('1:02:05');
  });

  it('中文时长', () => {
    expect(formatMinutes(45)).toBe('45 分钟');
    expect(formatMinutes(60)).toBe('1 小时');
    expect(formatMinutes(95)).toBe('1 小时 35 分钟');
    expect(formatMinutesCompact(95)).toBe('1h35m');
    expect(formatMinutesCompact(45)).toBe('45m');
  });
});
