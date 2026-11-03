'use client';

import Link from 'next/link';
import { PageShell } from '@/components/study/page-shell';
import { CountdownCard } from '@/components/study/countdown-card';
import { CourseCard } from '@/components/study/course-card';
import { SubjectDot } from '@/components/study/subject-badge';
import { Icon } from '@/components/icon';
import { cn } from '@/lib/utils';
import { useCourses, useStudyConfig, useStudyRecords } from '@/lib/study/store';
import { computePeriod, cumulativeTotals, studyStreak, todayTotals } from '@/lib/study/stats';
import { dateLabel, formatDateShort } from '@/lib/study/date';
import { formatMinutes, formatMinutesCompact } from '@/lib/study/format';
import { SUBJECTS, subjectColor } from '@/lib/study/types';

/** 学习台首页：倒计时 + 今日汇总 + 科目入口 + 最近记录 + 课程推荐 */
export default function HomePage() {
  const records = useStudyRecords();
  const courses = useCourses();
  const config = useStudyConfig();

  const today = todayTotals(records);
  const cumulative = cumulativeTotals(records);
  const streak = studyStreak(records);
  const week = computePeriod(records, 'week');
  const weekMap = new Map(week.bySubject.map((s) => [s.subject, s.totalMin]));

  const recent = [...records]
    .sort((a, b) => b.startTimestamp - a.startTimestamp || b.recordId - a.recordId)
    .slice(0, 5);

  const target = config.dailyTargetMin;
  const targetPct = target > 0 ? Math.min(100, Math.round((today.totalMin / target) * 100)) : 0;

  return (
    <PageShell>
      {/* 顶部问候 + 操作入口 */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <p className="text-xs text-faint">
            {formatDateShort(new Date())} · 今天
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-content mt-1">{greeting()}，今天也要专注</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/timer" className="btn-primary">
            <Icon name="clock" className="w-4 h-4" />
            开始学习
          </Link>
          <Link href="/courses" className="btn-ghost">
            <Icon name="book" className="w-4 h-4" />
            课程库
          </Link>
        </div>
      </div>

      {/* 统计压缩成一行数字条（TVBox 首页的信息条观感） */}
      <section
        className="card flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 mb-4"
        aria-label="学习概览"
      >
        <StatItem label="累计专注" value={`${cumulative.count}`} unit="次" />
        <StatItem label="累计时长" value={formatMinutes(cumulative.totalMin)} />
        <StatItem label="连续打卡" value={`${streak}`} unit="天" accent={streak > 0} />
        <StatItem label="今日学习" value={formatMinutes(today.totalMin)} />
        <StatItem label="今日记录" value={`${today.count}`} unit="段" />
        <StatItem label="本周时长" value={formatMinutes(week.totalMin)} />
      </section>

      {/* 科目横向分类条：TVBox 的分类行，溢出可滑动 */}
      <section className="mb-5" aria-label="按科目学习">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-sm font-medium text-content">按科目学习</h2>
          <Link href="/courses" className="text-xs text-faint hover:text-accent transition-colors">
            全部课程 →
          </Link>
        </div>
        <div className="scroll-hidden flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {SUBJECTS.map((subject) => {
            const color = subjectColor(subject);
            const count = courses.filter((c) => c.subject === subject).length;
            const weekMin = weekMap.get(subject) ?? 0;
            return (
              <Link
                key={subject}
                href={`/courses?subject=${encodeURIComponent(subject)}`}
                className="chip-lg focus-ring shrink-0 whitespace-nowrap border border-line bg-chip text-muted hover:border-accent hover:bg-hover hover:text-content"
                title={weekMin > 0 ? `本周 ${formatMinutesCompact(weekMin)}` : '本周 0'}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                {subject}
                <span className="text-[10px] text-faint">{count}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 倒计时 + 今日汇总 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-4">
        <CountdownCard />

        <section className="card p-5 flex flex-col" aria-label="今日学习汇总">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-content">今日学习</h2>
            <span className="text-[11px] text-faint">{today.count} 段记录</span>
          </div>

          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-bold text-content tabular-nums">{formatMinutes(today.totalMin)}</span>
            {target > 0 && <span className="text-xs text-faint pb-1">目标 {formatMinutes(target)}</span>}
          </div>

          {target > 0 && (
            <div className="mt-2.5 h-1.5 rounded-full bg-chip overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${targetPct}%`,
                  // 目标进度条统一走强调色令牌（去原 LibreTV 的 #00b8e6→#00ccff 霓虹渐变）
                  background: 'linear-gradient(90deg, rgb(var(--c-accent)), rgb(var(--c-accent-hover)))',
                }}
              />
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-1.5">
            {today.bySubject.length > 0 ? (
              today.bySubject.map((s) => (
                <span
                  key={s.subject}
                  className="chip border"
                  style={{ backgroundColor: `${s.color}14`, color: s.color, borderColor: `${s.color}33` }}
                >
                  <SubjectDot subject={s.subject} />
                  {s.subject} {formatMinutesCompact(s.totalMin)}
                </span>
              ))
            ) : (
              <p className="text-xs text-faint leading-relaxed">
                今天还没有学习记录 —— 点「开始学习」选一科专注，或去课程库挑一节网课。
              </p>
            )}
          </div>

          <div className="mt-auto pt-4 flex gap-2">
            <Link href="/timer" className="btn-primary btn-sm flex-1">
              <Icon name="play" className="w-3.5 h-3.5" />
              开始计时
            </Link>
            <Link href="/logs?add=1" className="btn-ghost btn-sm">
              <Icon name="plus" className="w-3.5 h-3.5" />
              补录
            </Link>
          </div>
        </section>
      </div>

      {/* 科目入口已上移为横向 chip 条，这里直接进入课程海报网格 + 最近学习 */}
      <section className="mt-6" aria-label="推荐课程">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-content">课程推荐</h2>
          <Link href="/courses" className="text-xs text-faint hover:text-accent transition-colors">
            课程库 →
          </Link>
        </div>
        {courses.length === 0 ? (
          <div className="border border-dashed border-line rounded-xl p-8 text-center">
            <p className="text-sm text-muted">还没有课程</p>
            <Link href="/courses" className="btn-primary btn-sm mt-3">
              去添加课程
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {courses.slice(0, 10).map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </section>

      <section className="card p-4 mt-6" aria-label="最近学习">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-medium text-content">最近学习</h2>
          <Link href="/logs" className="text-xs text-faint hover:text-accent transition-colors">
            查看全部 →
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="py-8 text-center">
            <Icon name="clock" className="w-6 h-6 mx-auto text-faint mb-2" />
            <p className="text-xs text-faint">还没有学习记录，开始第一次专注吧</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((r) => (
              <li key={r.recordId} className="flex items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-content truncate">{r.studyContent || '（未填写学习内容）'}</p>
                  <p className="text-[11px] text-faint mt-0.5">
                    {dateLabel(r.recordDate)} · {r.subjectName}
                  </p>
                </div>
                <span className="text-xs font-mono text-muted shrink-0">{formatMinutesCompact(r.durationMin)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[11px] text-faint mt-5 leading-relaxed">
        提示：内置示例课程使用公开测试视频流，仅用于演示「播放即计时」；在「课程库 → 编辑课程」中可替换为你自己的网课直链。
      </p>
    </PageShell>
  );
}

/** 一行数字条里的单项：标签 + 数值（+ 单位），强调项用强调色 */
function StatItem({
  label,
  value,
  unit,
  accent = false,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[11px] text-faint">{label}</span>
      <span className={cn('text-base font-semibold tabular-nums', accent ? 'text-accent' : 'text-content')}>{value}</span>
      {unit && <span className="text-[10px] text-faint">{unit}</span>}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 18) return '下午好';
  return '晚上好';
}
