'use client';

import { useEffect, useState } from 'react';
import { SUBJECTS } from '@/lib/study/types';
import { formatMinutes } from '@/lib/study/format';

/**
 * 结束学习时的保存弹窗：展示取整后的时长，填写科目与本次学习内容。
 * 计时页（自由计时）与播放页（网课自动计时）共用。
 */
export function StudySaveDialog({
  open,
  durationSec,
  defaultSubject,
  defaultContent,
  title = '保存学习记录',
  hint,
  onCancel,
  onSave,
}: {
  open: boolean;
  durationSec: number;
  defaultSubject: string;
  defaultContent: string;
  title?: string;
  hint?: string;
  onCancel: () => void;
  onSave: (input: { subject: string; content: string }) => void;
}) {
  const [subject, setSubject] = useState(defaultSubject);
  const [content, setContent] = useState(defaultContent);

  useEffect(() => {
    if (!open) return;
    setSubject(defaultSubject);
    setContent(defaultContent);
  }, [open, defaultSubject, defaultContent]);

  if (!open) return null;

  const minutes = Math.max(1, Math.ceil(durationSec / 60));
  const tooShort = durationSec < 60;
  const canSave = !tooShort && content.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-black/70 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-surface-raised rounded-xl w-full max-w-md p-5 shadow-2xl animate-slide-up" role="dialog" aria-modal>
        <h2 className="text-base font-semibold text-content mb-1">{title}</h2>
        <p className="text-xs text-faint mb-4">
          {hint ?? '本次学习时长按 1 分钟向上取整记录，保存后可在统计与日志中查看。'}
        </p>

        <div className="flex items-center gap-2 mb-4 text-sm">
          <span className="text-muted">本次学习</span>
          <span className="font-mono tabular-nums text-accent font-semibold text-base">
            {formatMinutes(minutes)}
          </span>
          {tooShort && <span className="text-danger text-xs">不足 1 分钟，无法保存</span>}
        </div>

        <label className="block text-xs text-muted mb-1.5" htmlFor="save-subject">
          科目
        </label>
        <select
          id="save-subject"
          className="input w-full mb-3"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        >
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <label className="block text-xs text-muted mb-1.5" htmlFor="save-content">
          本次学习内容
        </label>
        <textarea
          id="save-content"
          className="input w-full min-h-[96px] resize-y"
          placeholder="例如：高数第六章 定积分应用，做了 20 道题"
          value={content}
          maxLength={500}
          onChange={(e) => setContent(e.target.value)}
        />

        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-ghost text-sm" onClick={onCancel}>
            丢弃
          </button>
          <button
            className="btn-primary text-sm"
            disabled={!canSave}
            onClick={() => onSave({ subject, content: content.trim() })}
          >
            保存记录
          </button>
        </div>
      </div>
    </div>
  );
}
