'use client';

import Link from 'next/link';
import { PageShell } from '@/components/study/page-shell';
import { CountdownCard } from '@/components/study/countdown-card';
import { CourseCard } from '@/components/study/course-card';
import { SubjectDot } from '@/components/study/subject-badge';
import { Icon } from '@/components/icon';
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
      {/* 顶部问候 + 累计概览 */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p className="text-xs text-faint">
            {formatDateShort(new Date())} · 今天
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-content mt-1">{greeting()}，今天也要专注</h1>
          <p className="text-sm text-muted mt-1.5">
            累计专注 <span className="text-content">{cumulative.count}</span> 次 ·{' '}
            <span className="text-content">{formatMinutes(cumulative.totalMin)}</span>
            {streak > 0 && (
              <>
                {' '}
                · 连续打卡 <span className="text-accent font-medium">{streak}</span> 天
              </>
            )}
          </p>
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
                style={{ width: `${targetPct}%`, background: 'linear-gradient(90deg, #00b8e6, #00ccff)' }}
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

      {/* 科目入口 */}
      <section className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-content">按科目学习</h2>
          <Link href="/courses" className="text-xs text-faint hover:text-accent transition-colors">
            全部课程 →
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {SUBJECTS.map((subject) => {
            const color = subjectColor(subject);
            const count = courses.filter((c) => c.subject === subject).length;
            const weekMin = weekMap.get(subject) ?? 0;
            return (
              <Link
                key={subject}
                href={`/courses?subject=${encodeURIComponent(subject)}`}
                className="card p-3 hover:border-accent/50 hover:-translate-y-0.5 transition-transform"
                style={{ borderTopColor: color, borderTopWidth: 2 }}
              >
                <div className="flex items-center justify-between gap-1">
                  <SubjectDot subject={subject} />
                  <span className="text-[10px] text-faint">{weekMin > 0 ? `本周 ${formatMinutesCompact(weekMin)}` : '本周 0'}</span>
                </div>
                <p className="mt-2 text-sm font-medium text-content truncate" title={subject}>
                  {subject}
                </p>
                <p className="text-[11px] text-faint mt-0.5">{count} 门课程</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 最近学习 + 推荐课程 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.25fr] gap-4 mt-6">
        <section className="card p-4" aria-label="最近学习">
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

        <section aria-label="推荐课程">
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
            <div className="grid sm:grid-cols-2 gap-3">
              {courses.slice(0, 4).map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          )}
        </section>
      </div>

      <p className="text-[11px] text-faint mt-5 leading-relaxed">
        提示：内置示例课程使用公开测试视频流，仅用于演示「播放即计时」；在「课程库 → 编辑课程」中可替换为你自己的网课直链。
      </p>
    </PageShell>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 18) return '下午好';
  return '晚上好';
}
