'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageShell } from '@/components/study/page-shell';
import { DonutChart } from '@/components/study/donut';
import { Icon } from '@/components/icon';
import { useStudyRecords } from '@/lib/study/store';
import { computePeriod, cumulativeTotals, type StatPeriod } from '@/lib/study/stats';
import { addDays, addMonths, dateKey, parseDateKey } from '@/lib/study/date';
import { formatMinutes } from '@/lib/study/format';
import { cn } from '@/lib/utils';

/** 统计页：日/周/月口径、累计指标、饼图与各科明细（开发文档模块3 / 第六节） */
export default function StatsPage() {
  const records = useStudyRecords();
  const [period, setPeriod] = useState<StatPeriod>('day');
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const stats = computePeriod(records, period, anchor);
  const cumulative = cumulativeTotals(records);

  const shift = (dir: number) => {
    if (period === 'day') setAnchor((d) => addDays(d, dir));
    else if (period === 'week') setAnchor((d) => addDays(d, dir * 7));
    else setAnchor((d) => addMonths(d, dir));
  };

  const maxSubjectMin = stats.bySubject[0]?.totalMin ?? 0;

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-content">学习统计</h1>
          <p className="text-sm text-muted mt-1.5">按日 / 周 / 月查看学习时长分布，累计指标不受筛选影响。</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            className="btn-ghost !px-2"
            onClick={() => shift(-1)}
            aria-label="上一周期"
            title="上一周期"
          >
            <Icon name="arrowDown" className="w-4 h-4 rotate-90" />
          </button>
          <button
            className={cn(
              'px-2.5 py-1.5 rounded-md text-xs',
              'bg-chip text-muted hover:text-content border border-line'
            )}
            onClick={() => setAnchor(new Date())}
            title="回到当前周期"
          >
            今天
          </button>
          <button className="btn-ghost !px-2" onClick={() => shift(1)} aria-label="下一周期" title="下一周期">
            <Icon name="arrowDown" className="w-4 h-4 -rotate-90" />
          </button>
        </div>
      </div>

      {/* 日 / 周 / 月切换 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex rounded-lg border border-line bg-chip p-0.5">
          {(
            [
              ['day', '日'],
              ['week', '周'],
              ['month', '月'],
            ] as [StatPeriod, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              className={cn(
                'px-4 py-1.5 rounded-md text-sm transition-colors',
                period === value ? 'bg-accent text-on-accent' : 'text-muted hover:text-content'
              )}
              onClick={() => setPeriod(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {period === 'day' && (
          <input
            type="date"
            className="input !py-1.5 text-xs"
            value={dateKey(anchor)}
            max={dateKey()}
            onChange={(e) => {
              if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setAnchor(parseDateKey(e.target.value));
            }}
            aria-label="选择日期"
          />
        )}

        <span className="text-xs text-faint">{stats.range.label}</span>
      </div>

      {/* 指标卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="累计专注次数" value={`${cumulative.count}`} unit="次" hint="全量记录" />
        <MetricCard label="总学习时长" value={formatMinutes(cumulative.totalMin)} hint="全量累计" />
        <MetricCard label="日均专注" value={formatMinutes(stats.dailyAvgMin)} hint={`周期内 ${stats.range.elapsedDays} 天`} />
        <MetricCard label="当前周期总时长" value={formatMinutes(stats.totalMin)} hint={stats.range.label} accent />
      </div>

      {/* 饼图 */}
      <section className="card p-5 mt-4" aria-label="各科时长占比">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-content">各科时长占比</h2>
          <span className="text-[11px] text-faint">{stats.bySubject.length} 个科目</span>
        </div>

        {stats.totalMin === 0 ? (
          <div className="py-12 text-center">
            <Icon name="chart" className="w-7 h-7 mx-auto text-faint mb-3" />
            <p className="text-sm text-muted">本周期还没有学习记录，去专注一下吧</p>
            <Link href="/timer" className="btn-primary btn-sm mt-4">
              开始学习
            </Link>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-6 mt-4">
            <DonutChart data={stats.bySubject} totalMin={stats.totalMin} />
            <ul className="flex-1 w-full space-y-2.5">
              {stats.bySubject.map((item) => (
                <li key={item.subject} className="flex items-center gap-2 text-sm">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-content truncate flex-1">{item.subject}</span>
                  <span className="text-xs text-muted font-mono">{formatMinutes(item.totalMin)}</span>
                  <span className="text-xs text-faint w-9 text-right">{item.pct}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 各科耗时明细 */}
      {stats.bySubject.length > 0 && (
        <section className="card p-5 mt-4" aria-label="各科耗时">
          <h2 className="text-sm font-medium text-content mb-3">各科耗时</h2>
          <ul className="space-y-3">
            {stats.bySubject.map((item) => (
              <li key={item.subject}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-content">{item.subject}</span>
                  <span className="text-faint">
                    {formatMinutes(item.totalMin)} · {item.pct}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-chip overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${maxSubjectMin > 0 ? Math.round((item.totalMin / maxSubjectMin) * 100) : 0}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}

function MetricCard({
  label,
  value,
  unit,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="card p-4">
      <p className="text-[11px] text-faint">{label}</p>
      <p className={cn('mt-1.5 font-semibold tabular-nums', accent ? 'text-accent text-xl' : 'text-content text-xl')}>
        {value}
        {unit && <span className="text-xs text-muted ml-1 font-normal">{unit}</span>}
      </p>
      {hint && <p className="text-[10px] text-faint mt-1 truncate">{hint}</p>}
    </div>
  );
}
