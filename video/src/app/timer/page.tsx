'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageShell } from '@/components/study/page-shell';
import { StudySaveDialog } from '@/components/study/save-dialog';
import { SubjectBadge } from '@/components/study/subject-badge';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { dateKey, dateLabel } from '@/lib/study/date';
import { formatClock, formatMinutes } from '@/lib/study/format';
import { todayTotals } from '@/lib/study/stats';
import {
  addStudyRecord,
  discardTimerSession,
  endTimerSession,
  getTimerSession,
  pauseTimerSession,
  resumeTimerSession,
  sessionElapsedMs,
  startTimerSession,
  useStudyRecords,
  useTimerSession,
  type EndedSession,
} from '@/lib/study/store';
import { SUBJECTS, subjectColor } from '@/lib/study/types';
import { cn } from '@/lib/utils';

/** 学习计时页：科目选择 / 开始暂停 / 结束保存（开发文档模块2 与状态机） */
export default function TimerPage() {
  const session = useTimerSession();
  const records = useStudyRecords();
  const { toast } = useToast();
  const [subject, setSubject] = useState('数学');
  const [now, setNow] = useState(() => Date.now());
  const [ended, setEnded] = useState<EndedSession | null>(null);

  useEffect(() => {
    if (!session) return;
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, [session]);

  const today = todayTotals(records);
  const seconds = session ? Math.floor(sessionElapsedMs(session, now) / 1000) : 0;
  const running = Boolean(session?.runningSince);

  // 结束：不足 1 分钟不保存（开发文档边界用例 1），保留会话并暂停，避免误触丢失已有时长
  const finish = () => {
    const current = getTimerSession();
    if (!current) return;
    if (Math.floor(sessionElapsedMs(current) / 1000) < 60) {
      pauseTimerSession();
      toast('学习时长太短（不足 1 分钟），未保存；已暂停，可继续积累', 'warning');
      return;
    }
    const result = endTimerSession();
    if (!result) return;
    setEnded(result);
  };

  const todayList = useMemo(
    () =>
      [...records]
        .filter((r) => r.recordDate === dateKey())
        .sort((a, b) => b.startTimestamp - a.startTimestamp)
        .slice(0, 5),
    [records]
  );

  return (
    <PageShell>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-content">学习计时</h1>
        <p className="text-sm text-muted mt-1.5">选择一个科目开始专注，暂停期间不计时，结束后填写学习内容并保存。</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4">
        <section className="card p-6 sm:p-8 text-center relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-24 h-56 blur-2xl"
            style={{ background: 'radial-gradient(50% 60% at 50% 50%, rgba(0,184,230,0.16), transparent 70%)' }}
          />

          {!session ? (
            <>
              <p className="text-xs text-faint mb-3">选择本次学习的科目</p>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
                {SUBJECTS.map((s) => {
                  const active = subject === s;
                  const color = subjectColor(s);
                  return (
                    <button
                      key={s}
                      className={cn(
                        'chip px-3 py-1.5 border text-xs transition-colors',
                        active ? 'text-content' : 'bg-chip text-muted border-line hover:text-content'
                      )}
                      style={active ? { backgroundColor: `${color}26`, borderColor: color, color } : undefined}
                      onClick={() => setSubject(s)}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>

              <p className="font-mono text-6xl sm:text-7xl font-bold text-accent/70 tabular-nums mt-8">00:00</p>
              <p className="text-xs text-faint mt-2">计时基于开始时间戳，切到其他页面也会继续</p>

              <button className="btn-primary mt-6 px-8" onClick={() => startTimerSession(subject)}>
                <Icon name="play" className="w-4 h-4" />
                开始学习
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center gap-2">
                <SubjectBadge subject={session.subject} />
                <span className="text-[11px] text-faint">{running ? '正在专注' : '已暂停 · 暂停期间不计时'}</span>
              </div>

              <p className="font-mono text-6xl sm:text-7xl font-bold text-accent tabular-nums mt-5">
                {formatClock(seconds)}
              </p>
              <p className="text-xs text-faint mt-2">
                开始于 {new Date(session.startedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · 按 1
                分钟向上取整保存
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
                {running ? (
                  <button className="btn-ghost px-5" onClick={pauseTimerSession}>
                    <Icon name="pause" className="w-4 h-4" />
                    暂停
                  </button>
                ) : (
                  <button className="btn-primary px-5" onClick={resumeTimerSession}>
                    <Icon name="play" className="w-4 h-4" />
                    继续
                  </button>
                )}
                <button className="btn-primary px-5" onClick={finish}>
                  <Icon name="check" className="w-4 h-4" />
                  结束并保存
                </button>
                <button
                  className="btn-ghost !text-danger"
                  onClick={() => {
                    discardTimerSession();
                    toast('已放弃本次计时', 'info');
                  }}
                >
                  放弃
                </button>
              </div>

              {seconds < 60 && (
                <p className="text-[11px] text-faint mt-3">学习时长不足 1 分钟时不会保存记录</p>
              )}
            </>
          )}
        </section>

        <div className="space-y-4">
          <section className="card p-4" aria-label="今日记录">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-medium text-content">今日记录</h2>
              <span className="text-[11px] text-faint">
                {today.count} 段 · {formatMinutes(today.totalMin)}
              </span>
            </div>
            {todayList.length === 0 ? (
              <p className="text-xs text-faint py-6 text-center">今天还没有完成的记录</p>
            ) : (
              <ul className="divide-y divide-line">
                {todayList.map((r) => (
                  <li key={r.recordId} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-content truncate">{r.studyContent || '（未填写内容）'}</span>
                      <span className="text-[11px] font-mono text-muted shrink-0">
                        {formatMinutes(r.durationMin)}
                      </span>
                    </div>
                    <p className="text-[10px] text-faint mt-0.5">
                      {r.subjectName} · {dateLabel(r.recordDate)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/logs" className="text-[11px] text-faint hover:text-accent transition-colors inline-block mt-2">
              查看全部日志 →
            </Link>
          </section>

          <section className="card p-4">
            <h2 className="text-sm font-medium text-content mb-2">计时规则</h2>
            <ul className="text-[11px] text-muted leading-relaxed space-y-1.5 list-disc pl-4">
              <li>时长取整：1 分 30 秒记为 2 分钟。</li>
              <li>不足 1 分钟不保存，避免误触产生碎记录。</li>
              <li>暂停期间不计时；跨零点学习归属开始那天。</li>
              <li>计时状态会保存在本地，切页或刷新后仍可继续。</li>
            </ul>
          </section>
        </div>
      </div>

      <StudySaveDialog
        open={Boolean(ended)}
        durationSec={ended?.seconds ?? 0}
        defaultSubject={ended?.subject ?? '数学'}
        defaultContent={ended?.content ?? ''}
        onCancel={() => setEnded(null)}
        onSave={({ subject: savedSubject, content }) => {
          if (!ended) return;
          addStudyRecord({
            startTimestamp: ended.startedAt,
            endTimestamp: Date.now(),
            durationMin: Math.ceil(ended.seconds / 60),
            subjectName: savedSubject,
            studyContent: content,
            recordDate: dateKey(ended.startedAt),
          });
          setEnded(null);
          toast(`已记录 ${formatMinutes(Math.ceil(ended.seconds / 60))} · ${savedSubject}`, 'success');
        }}
      />
    </PageShell>
  );
}
