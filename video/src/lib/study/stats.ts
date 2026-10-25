import { addDays, addMonths, dateKey, diffDays, formatDateShort, startOfDay, startOfMonth, startOfWeek } from './date';
import type { StudyRecord } from './types';
import { subjectColor } from './types';

/**
 * 统计口径（开发文档第六节，唯一依据）：
 * - 日：今天 0 点 ~ 明天 0 点；
 * - 周：本周一 0 点 ~ 下周一 0 点（自然周）；
 * - 月：本月 1 日 0 点 ~ 下月 1 日 0 点；
 * - 累计专注次数 / 总学习时长：全量，不受筛选影响；
 * - 日均：周期总时长 ÷ 周期内已过天数（空周期为 0）。
 */

export type StatPeriod = 'day' | 'week' | 'month';

export interface PeriodRange {
  start: Date;
  end: Date;
  /** 周期内已过天数（用于日均） */
  elapsedDays: number;
  label: string;
}

/** 计算某个自然周期的边界；anchor 为周期内任意一天 */
export function getPeriodRange(period: StatPeriod, anchor: Date = new Date()): PeriodRange {
  const today = startOfDay();
  if (period === 'day') {
    const start = startOfDay(anchor);
    const end = addDays(start, 1);
    const elapsedDays = today >= start ? 1 : 0;
    return { start, end, elapsedDays, label: formatDateShort(start) };
  }
  if (period === 'week') {
    const start = startOfWeek(anchor);
    const end = addDays(start, 7);
    const elapsedDays = Math.min(7, Math.max(0, diffDays(start, today) + 1));
    const label = `${formatDateShort(start).replace(/ .*/, '')} - ${formatDateShort(addDays(start, 6)).replace(/ .*/, '')}`;
    return { start, end, elapsedDays, label };
  }
  const start = startOfMonth(anchor);
  const end = addMonths(start, 1);
  const elapsedDays = Math.min(diffDays(start, end), Math.max(0, diffDays(start, today) + 1));
  return { start, end, elapsedDays, label: `${start.getFullYear()}年${start.getMonth() + 1}月` };
}

export interface SubjectTotal {
  subject: string;
  totalMin: number;
  pct: number;
  color: string;
}

export interface PeriodStats {
  range: PeriodRange;
  totalMin: number;
  count: number;
  dailyAvgMin: number;
  bySubject: SubjectTotal[];
}

/** 按日期区间过滤（recordDate 为 yyyy-MM-dd，可直接比较） */
export function recordsInRange(records: StudyRecord[], start: Date, end: Date): StudyRecord[] {
  const from = dateKey(start);
  const to = dateKey(end);
  return records.filter((r) => r.recordDate >= from && r.recordDate < to);
}

export function subjectTotals(records: StudyRecord[]): SubjectTotal[] {
  const map = new Map<string, number>();
  for (const r of records) {
    map.set(r.subjectName, (map.get(r.subjectName) ?? 0) + r.durationMin);
  }
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  return [...map.entries()]
    .map(([subject, totalMin]) => ({
      subject,
      totalMin,
      pct: total > 0 ? Math.round((totalMin / total) * 100) : 0,
      color: subjectColor(subject),
    }))
    .sort((a, b) => b.totalMin - a.totalMin);
}

export function computePeriod(records: StudyRecord[], period: StatPeriod, anchor?: Date): PeriodStats {
  const range = getPeriodRange(period, anchor);
  const inRange = recordsInRange(records, range.start, range.end);
  const totalMin = inRange.reduce((sum, r) => sum + r.durationMin, 0);
  return {
    range,
    totalMin,
    count: inRange.length,
    dailyAvgMin: range.elapsedDays > 0 ? Math.round(totalMin / range.elapsedDays) : 0,
    bySubject: subjectTotals(inRange),
  };
}

export function cumulativeTotals(records: StudyRecord[]): { count: number; totalMin: number } {
  return {
    count: records.length,
    totalMin: records.reduce((sum, r) => sum + r.durationMin, 0),
  };
}

/** 今日汇总（首页卡片用） */
export function todayTotals(records: StudyRecord[]): { totalMin: number; count: number; bySubject: SubjectTotal[] } {
  const today = dateKey();
  const todayRecords = records.filter((r) => r.recordDate === today);
  return {
    totalMin: todayRecords.reduce((sum, r) => sum + r.durationMin, 0),
    count: todayRecords.length,
    bySubject: subjectTotals(todayRecords),
  };
}

/** 连续打卡天数（今天或昨天有记录才延续） */
export function studyStreak(records: StudyRecord[]): number {
  if (records.length === 0) return 0;
  const days = new Set(records.map((r) => r.recordDate));
  const today = startOfDay();
  let cursor = days.has(dateKey(today)) ? today : addDays(today, -1);
  if (!days.has(dateKey(cursor))) return 0;
  let streak = 0;
  while (days.has(dateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** 某课程已学分钟数（按章节聚合） */
export function courseLearned(records: StudyRecord[], courseId: string): { totalMin: number; byLesson: Map<string, number> } {
  const byLesson = new Map<string, number>();
  let totalMin = 0;
  for (const r of records) {
    if (r.courseId !== courseId || !r.lessonId) continue;
    byLesson.set(r.lessonId, (byLesson.get(r.lessonId) ?? 0) + r.durationMin);
    totalMin += r.durationMin;
  }
  return { totalMin, byLesson };
}
