'use client';

import { useEffect, useState } from 'react';
import { addStudyRecord, updateStudyRecord } from '@/lib/study/store';
import { dateKey, parseDateKey } from '@/lib/study/date';
import { SUBJECTS, type StudyRecord } from '@/lib/study/types';
import { cn } from '@/lib/utils';

/**
 * 手动补录 / 编辑学习记录弹窗（开发文档模块6、模块4）。
 * 补录不产生真实起止时间戳，按「日期 + 时长」反推占位时间戳。
 */
export function RecordDialog({
  open,
  record,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** 传入记录为编辑模式，缺省为补录 */
  record?: StudyRecord | null;
  onClose: () => void;
  onSaved?: (message: string) => void;
}) {
  const editing = Boolean(record);
  const [date, setDate] = useState(dateKey());
  const [subject, setSubject] = useState<string>('数学');
  const [duration, setDuration] = useState(60);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (record) {
      setDate(record.recordDate);
      setSubject(record.subjectName);
      setDuration(record.durationMin);
      setContent(record.studyContent);
    } else {
      setDate(dateKey());
      setSubject('数学');
      setDuration(60);
      setContent('');
    }
  }, [open, record]);

  if (!open) return null;

  const save = () => {
    const minutes = Math.round(Number(duration));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('请选择有效的日期');
      return;
    }
    if (!Number.isFinite(minutes) || minutes < 1) {
      setError('学习时长至少 1 分钟');
      return;
    }
    if (minutes > 1440) {
      setError('单次学习时长不能超过 1440 分钟（一天）');
      return;
    }
    if (!content.trim()) {
      setError('请填写本次学习内容');
      return;
    }
    // 占位时间戳：当日 9 点起算，仅用于排序与导出，不参与真实计时
    const startTimestamp = parseDateKey(date).getTime() + 9 * 3_600_000;
    const endTimestamp = startTimestamp + minutes * 60_000;

    if (record) {
      updateStudyRecord(record.recordId, {
        startTimestamp,
        endTimestamp,
        durationMin: minutes,
        subjectName: subject,
        studyContent: content.trim(),
        recordDate: date,
      });
      onSaved?.('记录已更新');
    } else {
      addStudyRecord({
        startTimestamp,
        endTimestamp,
        durationMin: minutes,
        subjectName: subject,
        studyContent: content.trim(),
        recordDate: date,
      });
      onSaved?.('补录成功');
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-black/70 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-raised rounded-xl w-full max-w-md p-5 shadow-2xl animate-slide-up" role="dialog" aria-modal>
        <h2 className="text-base font-semibold text-content mb-4">{editing ? '编辑学习记录' : '手动补录'}</h2>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-muted mb-1.5" htmlFor="record-date">
              日期
            </label>
            <input
              id="record-date"
              type="date"
              className="input w-full"
              value={date}
              max={dateKey()}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5" htmlFor="record-subject">
              科目
            </label>
            <select
              id="record-subject"
              className="input w-full"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="block text-xs text-muted mb-1.5" htmlFor="record-duration">
          学习时长（分钟）
        </label>
        <div className="flex items-center gap-2 mb-3">
          <button className="btn-ghost !px-3" onClick={() => setDuration((d) => Math.max(1, Number(d) - 5))} aria-label="减少 5 分钟">
            −5
          </button>
          <input
            id="record-duration"
            type="number"
            min={1}
            max={1440}
            step={5}
            className="input w-24 text-center font-mono"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
          <button
            className="btn-ghost !px-3"
            onClick={() => setDuration((d) => Math.min(1440, Number(d) + 5))}
            aria-label="增加 5 分钟"
          >
            +5
          </button>
          <span className="text-xs text-faint">1 ~ 1440 分钟</span>
        </div>

        <label className="block text-xs text-muted mb-1.5" htmlFor="record-content">
          学习内容
        </label>
        <textarea
          id="record-content"
          className="input w-full min-h-[90px] resize-y"
          placeholder="本次具体学了什么？"
          value={content}
          maxLength={500}
          onChange={(e) => setContent(e.target.value)}
        />

        {error && <p className="text-xs text-danger mt-2">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-ghost text-sm" onClick={onClose}>
            取消
          </button>
          <button className={cn('btn-primary text-sm')} onClick={save}>
            {editing ? '保存修改' : '保存补录'}
          </button>
        </div>
      </div>
    </div>
  );
}
