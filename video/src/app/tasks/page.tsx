'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { PageShell } from '@/components/study/page-shell';
import { SubjectDot } from '@/components/study/subject-badge';
import { Icon } from '@/components/icon';
import { dateKey, formatDateShort } from '@/lib/study/date';
import { formatMinutes } from '@/lib/study/format';
import { todayTotals } from '@/lib/study/stats';
import { useStudyRecords } from '@/lib/study/store';
import {
  buildDayPlan,
  countChecked,
  taskColor,
  taskStreak,
  toggleTaskCheck,
  useTaskChecks,
  type DailyTask,
} from '@/lib/study/tasks';
import { cn } from '@/lib/utils';

/**
 * 每日任务清单：按复习计划阶段自动生成当天任务，可勾选、看完成度与连击。
 * 任务与学习计时联动：卡片上实时显示对应科目今日已学时长。
 */
export default function TasksPage() {
  const checks = useTaskChecks();
  const records = useStudyRecords();

  const today = useMemo(() => new Date(), []);
  const plan = useMemo(() => buildDayPlan(today), [today]);
  const yesterdayPlan = useMemo(() => buildDayPlan(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)), [today]);

  const todayKey = dateKey(today);
  const doneCount = plan ? countChecked(checks, todayKey) : 0;
  const total = plan?.tasks.length ?? 0;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const streak = useMemo(() => taskStreak(checks), [checks]);
  const todayStudy = useMemo(() => todayTotals(records), [records]);
  const subjectMinutes = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of todayStudy.bySubject) map.set(s.subject, s.totalMin);
    return map;
  }, [todayStudy.bySubject]);

  if (!plan) {
    return (
      <PageShell>
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-content">每日任务</h1>
          <p className="text-sm text-muted mt-1.5">当前日期不在复习计划区间内（2026-11-02 ~ 2028-03-31）。</p>
        </div>
        <section className="card p-6 text-sm text-muted">
          计划之外的日子，好好休息。可前往 <Link href="/courses" className="text-accent hover:underline">课程库</Link> 自由学习。
        </section>
      </PageShell>
    );
  }

  const yesterdayKey = dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
  const yesterdayDone = yesterdayPlan ? countChecked(checks, yesterdayKey) : 0;
  const yesterdayTotal = yesterdayPlan?.tasks.length ?? 0;

  return (
    <PageShell>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-content">每日任务</h1>
          <p className="text-sm text-muted mt-1.5">
            {formatDateShort(today)} · <span className="text-content font-medium">{plan.phase.name}</span>
            {plan.isSunday && <span className="text-accent">（休整日）</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {plan.daysToExam > 0 ? (
            <span className="tag font-medium" style={{ backgroundColor: 'rgb(var(--c-accent) / 0.12)', color: 'rgb(var(--c-accent))' }}>
              <Icon name="flag" className="w-3.5 h-3.5" />
              距初试 {plan.daysToExam} 天
            </span>
          ) : (
            <span className="tag bg-chip text-muted border border-line">初试已结束</span>
          )}
          <Link href="/timer" className="btn-ghost btn-sm">
            <Icon name="play" className="w-3.5 h-3.5" />
            去计时
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
        {/* 今日任务清单 */}
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-content flex items-center gap-2">
              <Icon name="calendar" className="w-4 h-4 text-accent" />
              今日任务 · 完成 {doneCount}/{total}
            </h2>
            <span className="text-xs text-faint">点击整行勾选 / 取消</span>
          </div>

          {/* 完成度进度条 */}
          <div className="mb-4">
            <div className="h-2 rounded-full bg-chip overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? 'rgb(var(--c-success))' : 'rgb(var(--c-accent))' }}
              />
            </div>
            {pct >= 100 && (
              <p className="text-xs text-success mt-2 flex items-center gap-1">
                <Icon name="check" className="w-3.5 h-3.5" />
                今日任务全部完成，干得漂亮！
              </p>
            )}
          </div>

          <ol className="space-y-2">
            {plan.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                checked={Boolean(checks[todayKey]?.[task.id])}
                studiedMin={subjectMinutes.get(task.subject) ?? 0}
                onToggle={() => toggleTaskCheck(todayKey, task.id)}
              />
            ))}
          </ol>

          <p className="text-[11px] text-faint mt-4 leading-relaxed">{plan.phase.goal}</p>
        </section>

        {/* 右栏：状态 + 节奏说明 */}
        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="text-sm font-medium text-content mb-3 flex items-center gap-2">
              <Icon name="bolt" className="w-4 h-4 text-accent" />
              今日状态
            </h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-chip p-3">
                <dt className="text-[11px] text-faint">已计时</dt>
                <dd className="mt-1 text-content font-semibold">{formatMinutes(todayStudy.totalMin)}</dd>
              </div>
              <div className="rounded-lg bg-chip p-3">
                <dt className="text-[11px] text-faint">任务完成</dt>
                <dd className="mt-1 text-content font-semibold">{doneCount}/{total}（{pct}%）</dd>
              </div>
              <div className="rounded-lg bg-chip p-3">
                <dt className="text-[11px] text-faint">连续打卡</dt>
                <dd className="mt-1 text-content font-semibold">{streak} 天</dd>
              </div>
              <div className="rounded-lg bg-chip p-3">
                <dt className="text-[11px] text-faint">昨日完成</dt>
                <dd className="mt-1 text-content font-semibold">
                  {yesterdayTotal > 0 ? `${yesterdayDone}/${yesterdayTotal}` : '—'}
                </dd>
              </div>
            </dl>
            <p className="text-[11px] text-faint mt-3">
              打卡口径：当天勾选过半即算有效打卡；学习时长来自计时与网课播放记录。
            </p>
          </section>

          <section className="card p-5">
            <h2 className="text-sm font-medium text-content mb-2 flex items-center gap-2">
              <Icon name="list" className="w-4 h-4 text-accent" />
              本周节奏
            </h2>
            <ul className="text-sm text-muted space-y-1.5 leading-relaxed list-disc list-inside">
              <li>周一至周六：主任务日，按左侧清单推进；周日休整，只做回顾与规划。</li>
              <li>当前阶段任务为{plan.isSunday ? '周日休整模板' : '工作日模板'}，周日自动切换。</li>
              <li>每个阶段目标见课程库「里程碑 · 进度检查点」，偏差超 2 周就压缩后续计划。</li>
            </ul>
            <Link href="/courses" className="btn-ghost btn-sm mt-3">
              <Icon name="book" className="w-3.5 h-3.5" />
              查看计划课程
            </Link>
          </section>
        </div>
      </div>
    </PageShell>
  );
}

function TaskRow({
  task,
  checked,
  studiedMin,
  onToggle,
}: {
  task: DailyTask;
  checked: boolean;
  studiedMin: number;
  onToggle: () => void;
}) {
  const color = taskColor(task);
  return (
    <li>
      <button
        type="button"
        className={cn(
          'w-full text-left flex items-start gap-3 rounded-lg border p-3 transition-colors',
          checked ? 'border-transparent' : 'border-line hover:border-accent hover:bg-hover'
        )}
        style={checked ? { backgroundColor: `${color}14` } : undefined}
        onClick={onToggle}
        aria-pressed={checked}
      >
        {/* 勾选框 */}
        <span
          aria-hidden
          className={cn(
            'mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors',
            checked ? 'text-white'
              : 'border-line text-transparent'
          )}
          style={checked ? { backgroundColor: color, borderColor: color } : undefined}
        >
          <Icon name="check" className="w-3.5 h-3.5" />
        </span>

        <SubjectDot subject={task.subject} className="mt-1.5" />

        <span className="flex-1 min-w-0">
          <span
            className={cn('block text-sm font-medium', checked ? 'text-muted line-through' : 'text-content')}
          >
            {task.title}
          </span>
          {task.detail && <span className="block text-xs text-faint mt-0.5 leading-relaxed">{task.detail}</span>}
          <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-faint">
            {task.minutes > 0 && (
              <span className="tag bg-chip border border-line">建议 {formatMinutes(task.minutes)}</span>
            )}
            {task.minutes === 0 && <span className="tag bg-chip border border-line">当日关键节点</span>}
            {studiedMin > 0 && (
              <span className="tag border" style={{ backgroundColor: `${color}12`, color, borderColor: `${color}33` }}>
                今日已学 {formatMinutes(studiedMin)}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}
