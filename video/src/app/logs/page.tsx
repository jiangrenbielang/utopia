'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageShell } from '@/components/study/page-shell';
import { RecordDialog } from '@/components/study/record-dialog';
import { SubjectBadge } from '@/components/study/subject-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import {
  deleteStudyRecord,
  restoreStudyRecord,
  useStudyRecords,
} from '@/lib/study/store';
import { dateKey, dateLabel } from '@/lib/study/date';
import { formatMinutes } from '@/lib/study/format';
import { SUBJECTS, type StudyRecord } from '@/lib/study/types';

const PAGE_SIZE = 20;

/** 历史日志：日期/科目筛选、分页、编辑删除、手动补录（开发文档模块4 / 模块6） */
export default function LogsPage() {
  return (
    <Suspense>
      <LogsContent />
    </Suspense>
  );
}

function LogsContent() {
  const searchParams = useSearchParams();
  const records = useStudyRecords();
  const { toast } = useToast();
  const [dateFilter, setDateFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('全部');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StudyRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StudyRecord | null>(null);

  // 首页「补录」入口：/logs?add=1 自动打开弹窗
  useEffect(() => {
    if (searchParams.get('add') === '1') setDialogOpen(true);
  }, [searchParams]);

  const filtered = useMemo(() => {
    const list = records.filter((r) => {
      if (dateFilter && r.recordDate !== dateFilter) return false;
      if (subjectFilter !== '全部' && r.subjectName !== subjectFilter) return false;
      return true;
    });
    return list.sort(
      (a, b) => b.recordDate.localeCompare(a.recordDate) || b.startTimestamp - a.startTimestamp
    );
  }, [records, dateFilter, subjectFilter]);

  const totalMin = filtered.reduce((sum, r) => sum + r.durationMin, 0);
  const visible = filtered.slice(0, visibleCount);

  const groups = useMemo(() => {
    const map = new Map<string, StudyRecord[]>();
    for (const record of visible) {
      const list = map.get(record.recordDate) ?? [];
      list.push(record);
      map.set(record.recordDate, list);
    }
    return [...map.entries()];
  }, [visible]);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-content">学习日志</h1>
          <p className="text-sm text-muted mt-1.5">
            共 {filtered.length} 条记录 · 合计 {formatMinutes(totalMin)}
          </p>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          <Icon name="plus" className="w-4 h-4" />
          手动补录
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="date"
          className="input !py-1.5 text-xs w-40"
          value={dateFilter}
          max={dateKey()}
          onChange={(e) => {
            setDateFilter(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          aria-label="按日期筛选"
        />
        <select
          className="input !py-1.5 text-xs w-40"
          value={subjectFilter}
          onChange={(e) => {
            setSubjectFilter(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          aria-label="按科目筛选"
        >
          <option value="全部">全部科目</option>
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {(dateFilter || subjectFilter !== '全部') && (
          <button
            className="text-xs text-faint hover:text-accent transition-colors"
            onClick={() => {
              setDateFilter('');
              setSubjectFilter('全部');
              setVisibleCount(PAGE_SIZE);
            }}
          >
            清除筛选
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="border border-dashed border-line rounded-xl p-12 text-center">
          <Icon name="list" className="w-7 h-7 mx-auto text-faint mb-3" />
          <p className="text-sm text-muted">
            {records.length === 0 ? '还没有学习记录，去开始第一次专注吧' : '没有符合筛选条件的记录'}
          </p>
          <div className="flex justify-center gap-2 mt-4">
            <button className="btn-ghost btn-sm" onClick={openAdd}>
              补录一条
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([day, dayRecords]) => (
            <section key={day}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs text-muted font-medium">
                  {dateLabel(day)}
                  <span className="text-faint font-normal ml-1.5">{day}</span>
                </h2>
                <span className="text-[11px] text-faint">
                  {formatMinutes(dayRecords.reduce((sum, r) => sum + r.durationMin, 0))}
                </span>
              </div>
              <div className="space-y-2">
                {dayRecords.map((record) => (
                  <div key={record.recordId} className="card p-3 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <SubjectBadge subject={record.subjectName} />
                        <span className="text-xs font-mono text-muted">{formatMinutes(record.durationMin)}</span>
                        {record.courseId && <span className="text-[10px] text-faint">课程记录</span>}
                      </div>
                      <p className="text-sm text-content mt-1.5 break-words">{record.studyContent || '（未填写内容）'}</p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        className="p-1.5 rounded-md text-muted hover:text-content hover:bg-hover transition-colors"
                        onClick={() => {
                          setEditing(record);
                          setDialogOpen(true);
                        }}
                        aria-label="编辑记录"
                        title="编辑"
                      >
                        <Icon name="edit" className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1.5 rounded-md text-muted hover:text-danger hover:bg-hover transition-colors"
                        onClick={() => setPendingDelete(record)}
                        aria-label="删除记录"
                        title="删除"
                      >
                        <Icon name="trash" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {filtered.length > visibleCount && (
            <div className="flex justify-center">
              <button className="btn-ghost btn-sm" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
                加载更多（还有 {filtered.length - visibleCount} 条）
              </button>
            </div>
          )}
        </div>
      )}

      <RecordDialog
        open={dialogOpen}
        record={editing}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        onSaved={(message) => toast(message, 'success')}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        danger
        title="删除学习记录"
        message={
          pendingDelete
            ? `确定删除「${pendingDelete.studyContent || '未填写内容'}」这条 ${formatMinutes(
                pendingDelete.durationMin
              )} 的记录吗？`
            : ''
        }
        confirmLabel="删除"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          const removed = deleteStudyRecord(pendingDelete.recordId);
          setPendingDelete(null);
          if (removed) {
            toast('记录已删除', 'info', {
              action: {
                label: '撤销',
                onClick: () => restoreStudyRecord(removed),
              },
            });
          }
        }}
      />
    </PageShell>
  );
}
