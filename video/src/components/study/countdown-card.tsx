'use client';

import { useState } from 'react';
import { updateStudyConfig, useStudyConfig } from '@/lib/study/store';
import { dateKey, diffDays, parseDateKey, startOfDay, weekdayCn } from '@/lib/study/date';
import { Icon } from '@/components/icon';
import { cn } from '@/lib/utils';

/** 首页倒计时卡片：目标日期可配置、过期态切换文案（开发文档 2.1 / 五.1） */
export function CountdownCard({ className }: { className?: string }) {
  const config = useStudyConfig();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(config.examTargetDate);

  const target = parseDateKey(config.examTargetDate);
  const remaining = diffDays(startOfDay(), target);
  const expired = remaining < 0;
  const isToday = remaining === 0;

  return (
    <>
      <section className={cn('card relative overflow-hidden p-5 sm:p-6', className)} aria-label="考研倒计时">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full blur-2xl"
          style={{ background: 'radial-gradient(circle, rgba(0,184,230,0.22), transparent 65%)' }}
        />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">
              距离 <span className="text-content font-medium">考研初试</span>
              {expired ? '已结束' : isToday ? '就是今天' : '还有'}
            </p>
            <div className="mt-1 flex items-end gap-2">
              {expired ? (
                <span className="text-4xl sm:text-5xl font-bold brand-gradient leading-none">已考完</span>
              ) : (
                <>
                  <span className="font-mono text-6xl sm:text-7xl font-bold leading-none text-accent tabular-nums">
                    {remaining}
                  </span>
                  <span className="text-muted pb-1.5 text-sm">天</span>
                </>
              )}
            </div>
            <p className="text-xs text-faint mt-3">
              {expired
                ? `考试已结束 ${Math.abs(remaining)} 天，辛苦了`
                : isToday
                  ? '今天就是考试日，稳住心态'
                  : `目标日期：${config.examTargetDate} ${weekdayCn(target)}`}
            </p>
          </div>
          <button
            className="p-2 rounded-md text-muted hover:text-content hover:bg-hover transition-colors shrink-0"
            onClick={() => {
              setDraft(config.examTargetDate);
              setOpen(true);
            }}
            aria-label="设置考试日期"
            title="设置考试日期"
          >
            <Icon name="gear" />
          </button>
        </div>
      </section>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-surface-raised rounded-xl w-full max-w-sm p-5 shadow-2xl animate-slide-up" role="dialog" aria-modal>
            <h2 className="text-base font-semibold text-content mb-1">设置考研目标日期</h2>
            <p className="text-xs text-faint mb-4">首页倒计时会按该日期实时更新，可随时修改。</p>
            <label className="block text-xs text-muted mb-1.5" htmlFor="exam-date">
              考试日期
            </label>
            <input
              id="exam-date"
              type="date"
              className="input w-full"
              value={draft}
              min="2000-01-01"
              max="2100-12-31"
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-5">
              <button className="btn-ghost text-sm" onClick={() => setOpen(false)}>
                取消
              </button>
              <button
                className="btn-primary text-sm"
                disabled={!/^\d{4}-\d{2}-\d{2}$/.test(draft)}
                onClick={() => {
                  updateStudyConfig({ examTargetDate: draft || dateKey() });
                  setOpen(false);
                }}
              >
                确认保存
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
