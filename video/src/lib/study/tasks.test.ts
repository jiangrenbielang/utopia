import { describe, expect, it, vi } from 'vitest';
import { buildDayPlan, isEffectiveDay, PHASES, taskStreak, EXAM_DATE, type TaskChecks } from './tasks';

function date(s: string): Date {
  return new Date(`${s}T10:00:00`);
}

describe('阶段判定', () => {
  it('阶段区间连续且无重叠地覆盖全程', () => {
    for (let i = 1; i < PHASES.length; i++) {
      const prev = PHASES[i - 1].range[1];
      const next = PHASES[i].range[0];
      // 前一阶段结束日的次日 = 下一阶段开始日
      const dayAfter = new Date(`${prev}T00:00:00`);
      dayAfter.setDate(dayAfter.getDate() + 1);
      const key = `${dayAfter.getFullYear()}-${String(dayAfter.getMonth() + 1).padStart(2, '0')}-${String(dayAfter.getDate()).padStart(2, '0')}`;
      expect(key).toBe(next);
    }
  });

  it('计划开始前与结束后无阶段', () => {
    expect(buildDayPlan(date('2026-11-01'))).toBeNull();
    expect(buildDayPlan(date('2027-09-01'))).toBeNull();
  });

  it('边界日落在正确阶段', () => {
    expect(buildDayPlan(date('2026-11-02'))?.phase.id).toBe('p0');
    expect(buildDayPlan(date('2026-12-31'))?.phase.id).toBe('p0');
    expect(buildDayPlan(date('2027-01-01'))?.phase.id).toBe('p1');
    expect(buildDayPlan(date('2027-02-28'))?.phase.id).toBe('p1');
    expect(buildDayPlan(date('2027-03-01'))?.phase.id).toBe('p2');
    expect(buildDayPlan(date(EXAM_DATE))?.phase.id).toBe('exam');
    expect(buildDayPlan(date('2027-06-20'))?.phase.id).toBe('rest');
  });
});

describe('每日任务生成', () => {
  it('工作日使用工作日模板', () => {
    const plan = buildDayPlan(date('2026-11-04')); // 周三
    expect(plan?.isSunday).toBe(false);
    expect(plan?.tasks.map((t) => t.id)).toContain('p0-math-video');
  });

  it('周日自动切换休整模板', () => {
    const plan = buildDayPlan(date('2026-11-08')); // 周日
    expect(plan?.isSunday).toBe(true);
    expect(plan?.tasks.map((t) => t.id)).toContain('p0-weekly');
    expect(plan?.tasks.map((t) => t.id)).not.toContain('p0-math-video');
  });

  it('无周日模板的阶段周日沿用工作日任务', () => {
    const plan = buildDayPlan(date('2027-06-20')); // 周日（rest 阶段无 sundayTasks）
    expect(plan?.isSunday).toBe(true);
    expect(plan?.tasks.map((t) => t.id)).toContain('rest-relax');
  });

  it('距初试天数按自然日计算（初试首日为 0，次日为 -1）', () => {
    expect(buildDayPlan(date('2026-11-02'))?.daysToExam).toBe(229);
    expect(buildDayPlan(date(EXAM_DATE))?.daysToExam).toBe(0);
    expect(buildDayPlan(date('2027-06-20'))?.daysToExam).toBe(-1); // 初试次日
  });

  it('每个任务的科目都在配色表内（不会退化为灰色以外的意外值）', () => {
    for (const p of PHASES) {
      const all = [...p.weekdayTasks, ...(p.sundayTasks ?? [])];
      for (const t of all) {
        expect(['数学', '英语', '政治', '专业课', '其他']).toContain(t.subject);
      }
    }
  });
});

describe('打卡口径', () => {
  it('勾选过半（至少 1 项）为有效打卡', () => {
    expect(isEffectiveDay(0, 4)).toBe(false);
    expect(isEffectiveDay(1, 1)).toBe(true);
    expect(isEffectiveDay(2, 4)).toBe(true);
    expect(isEffectiveDay(1, 4)).toBe(false);
    expect(isEffectiveDay(0, 0)).toBe(false);
  });

  it('连击：今天达标从今天数，未达标从昨天数，中断归零', () => {
    // 固定「今天」为 2026-11-04（周三，p0 阶段内第 3 天），消除真实运行日期的巧合
    vi.useFakeTimers({ now: new Date('2026-11-04T10:00:00') });
    try {
      const make = (entries: [string, number][]): TaskChecks => {
        const out: TaskChecks = {};
        for (const [day, n] of entries) {
          const plan = buildDayPlan(date(day));
          const ids = plan?.tasks.map((t) => t.id) ?? [];
          out[day] = Object.fromEntries(ids.slice(0, n).map((id) => [id, true]));
        }
        return out;
      };
      // 11-04 / 11-03 全勾，11-02 未勾 → 2
      expect(taskStreak(make([['2026-11-04', 4], ['2026-11-03', 4], ['2026-11-02', 0]]))).toBe(2);
      // 11-04 全勾，11-03 未勾 → 1
      expect(taskStreak(make([['2026-11-04', 4], ['2026-11-03', 0]]))).toBe(1);
      // 11-04 未勾，11-03 全勾 → 从昨天起算 → 1
      expect(taskStreak(make([['2026-11-04', 0], ['2026-11-03', 4]]))).toBe(1);
      // 11-04 未勾，11-03 未勾（streak 锚定昨天）→ 0
      expect(taskStreak(make([['2026-11-04', 0], ['2026-11-03', 0], ['2026-11-02', 4]]))).toBe(0);
      // 空表 → 0
      expect(taskStreak({})).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
