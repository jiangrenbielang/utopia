'use client';

import { useEffect, useState } from 'react';
import { extractBilibiliEmbed } from '@/lib/study/embed';
import { saveCourse } from '@/lib/study/store';
import { SUBJECTS, type Course } from '@/lib/study/types';
import { Icon } from '@/components/icon';

interface LessonDraft {
  id?: string;
  title: string;
  url: string;
}

/** 新建 / 编辑课程：章节支持视频直链（m3u8 / mp4）或 B 站站外播放器嵌入 */
export function CourseDialog({
  open,
  course,
  onClose,
  onSaved,
}: {
  open: boolean;
  course?: Course | null;
  onClose: () => void;
  onSaved?: (course: Course) => void;
}) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<string>('数学');
  const [teacher, setTeacher] = useState('');
  const [description, setDescription] = useState('');
  const [lessons, setLessons] = useState<LessonDraft[]>([{ title: '第 1 讲', url: '' }]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (course) {
      setTitle(course.title);
      setSubject(course.subject);
      setTeacher(course.teacher ?? '');
      setDescription(course.description ?? '');
      setLessons(course.lessons.map((l) => ({ id: l.id, title: l.title, url: l.url ?? l.embedUrl ?? '' })));
    } else {
      setTitle('');
      setSubject('数学');
      setTeacher('');
      setDescription('');
      setLessons([{ title: '第 1 讲', url: '' }]);
    }
  }, [open, course]);

  if (!open) return null;

  const updateLesson = (index: number, patch: Partial<LessonDraft>) => {
    setLessons((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const save = () => {
    if (!title.trim()) {
      setError('请填写课程名称');
      return;
    }
    const validLessons = lessons.filter((l) => l.title.trim());
    if (validLessons.length === 0) {
      setError('至少需要一节课程');
      return;
    }
    const normalizedLessons: { id?: string; title: string; url?: string; embedUrl?: string }[] = [];
    for (const lesson of validLessons) {
      const raw = lesson.url.trim();
      if (!raw) {
        normalizedLessons.push({ id: lesson.id, title: lesson.title });
        continue;
      }
      // 支持直接粘贴 B 站整段 iframe：只提取并保存白名单内的 player.bilibili.com 地址
      const embedUrl = extractBilibiliEmbed(raw);
      if (embedUrl) {
        normalizedLessons.push({ id: lesson.id, title: lesson.title, embedUrl });
        continue;
      }
      if (!/^https?:\/\/.+/i.test(raw)) {
        setError(`「${lesson.title}」的视频地址需要以 http(s):// 开头，或粘贴 B 站嵌入代码`);
        return;
      }
      normalizedLessons.push({ id: lesson.id, title: lesson.title, url: raw });
    }
    const saved = saveCourse({
      id: course?.id,
      title,
      subject,
      teacher,
      description,
      lessons: normalizedLessons,
    });
    onSaved?.(saved);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto p-4 py-8 bg-black/70 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-surface-raised rounded-xl w-full max-w-2xl p-5 shadow-2xl animate-slide-up my-auto"
        role="dialog"
        aria-modal
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-content">{course ? '编辑课程' : '添加课程'}</h2>
          <button className="p-1.5 rounded-md text-muted hover:text-content hover:bg-hover" onClick={onClose} aria-label="关闭">
            <Icon name="close" className="w-5 h-5" />
          </button>
        </div>

        <div className="grid sm:grid-cols-[1fr_160px] gap-3 mb-3">
          <div>
            <label className="block text-xs text-muted mb-1.5" htmlFor="course-title">
              课程名称
            </label>
            <input
              id="course-title"
              className="input w-full"
              placeholder="例如：高等数学 · 基础精讲"
              value={title}
              maxLength={60}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5" htmlFor="course-subject">
              科目
            </label>
            <select
              id="course-subject"
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

        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-muted mb-1.5" htmlFor="course-teacher">
              讲师（可选）
            </label>
            <input
              id="course-teacher"
              className="input w-full"
              value={teacher}
              maxLength={30}
              onChange={(e) => setTeacher(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5" htmlFor="course-desc">
              简介（可选）
            </label>
            <input
              id="course-desc"
              className="input w-full"
              value={description}
              maxLength={120}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted">课程章节</span>
          <span className="text-[11px] text-faint">支持直链或粘贴 B 站整段 iframe 代码</span>
        </div>
        <div className="space-y-2 max-h-[38vh] overflow-y-auto scrollbar-thin pr-1">
          {lessons.map((lesson, index) => (
            <div key={index} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <span className="text-[11px] text-faint w-6 shrink-0 text-center">{index + 1}</span>
              <input
                className="input flex-1 min-w-0"
                placeholder="章节标题"
                value={lesson.title}
                maxLength={80}
                onChange={(e) => updateLesson(index, { title: e.target.value })}
                aria-label={`第 ${index + 1} 讲标题`}
              />
              <input
                className="input flex-[1.4] min-w-0"
                placeholder="视频直链（m3u8 / mp4）或 B 站 iframe 代码，可留空"
                value={lesson.url}
                onChange={(e) => updateLesson(index, { url: e.target.value })}
                aria-label={`第 ${index + 1} 讲视频地址`}
              />
              <button
                className="btn-ghost !px-2 shrink-0"
                onClick={() => setLessons((prev) => prev.filter((_, i) => i !== index))}
                disabled={lessons.length <= 1}
                aria-label="删除该章节"
                title="删除该章节"
              >
                <Icon name="trash" className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          className="btn-ghost btn-sm mt-2"
          onClick={() => setLessons((prev) => [...prev, { title: `第 ${prev.length + 1} 讲`, url: '' }])}
        >
          <Icon name="plus" className="w-3.5 h-3.5" />
          添加章节
        </button>

        {error && <p className="text-xs text-danger mt-2">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-ghost text-sm" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary text-sm" onClick={save}>
            {course ? '保存修改' : '创建课程'}
          </button>
        </div>
      </div>
    </div>
  );
}
