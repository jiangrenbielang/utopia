'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/icon';
import { formatClock } from '@/lib/study/format';
import {
  heartbeatTimerSession,
  pauseTimerSession,
  resumeTimerSession,
  sessionElapsedMs,
  useTimerSession,
} from '@/lib/study/store';
import { cn } from '@/lib/utils';

/**
 * 全局计时迷你条：任意页面可见（计时页自身除外），
 * 显示科目与实时时长，支持就地暂停/继续，点击进入计时页。
 */
export function TimerBar() {
  const session = useTimerSession();
  const pathname = usePathname();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!session) return;
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, [session]);

  // 心跳落盘：页面存活时每 10s 更新一次，重启后据此判断离线时长（开发文档 2.3.4）
  useEffect(() => {
    if (!session) return;
    const beat = setInterval(() => heartbeatTimerSession(), 10_000);
    return () => clearInterval(beat);
  }, [session]);

  if (!session || pathname === '/timer') return null;

  const running = session.runningSince != null;
  const seconds = Math.floor(sessionElapsedMs(session, now) / 1000);

  return (
    <div className="fixed bottom-20 sm:bottom-6 right-3 sm:right-6 z-30 animate-slide-up">
      <div className="flex items-center gap-1 rounded-full border border-accent/40 bg-surface-raised/95 backdrop-blur px-3 py-2 shadow-lg">
        <span className="relative flex h-2 w-2 mr-0.5" aria-hidden>
          {running && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          )}
          <span className={cn('relative inline-flex h-2 w-2 rounded-full', running ? 'bg-accent' : 'bg-faint')} />
        </span>
        <Link href="/timer" className="flex items-center gap-2 text-xs text-muted hover:text-content">
          <span className="max-w-[7rem] truncate">{session.subject}</span>
          <span className="font-mono tabular-nums text-sm text-content">{formatClock(seconds)}</span>
        </Link>
        <button
          className="p-1.5 rounded-full text-muted hover:text-content hover:bg-hover transition-colors"
          onClick={() => (running ? pauseTimerSession() : resumeTimerSession())}
          aria-label={running ? '暂停计时' : '继续计时'}
          title={running ? '暂停' : '继续'}
        >
          <Icon name={running ? 'pause' : 'play'} className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
