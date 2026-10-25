'use client';

import Link from 'next/link';
import { Icon } from '@/components/icon';
import { courseLearned } from '@/lib/study/stats';
import { useStudyRecords } from '@/lib/study/store';
import { subjectColor, type Course } from '@/lib/study/types';
import { formatMinutesCompact } from '@/lib/study/format';

/** 课程卡片：科目固定配色封面 + 学习进度（按已记录的章节聚合） */
export function CourseCard({ course }: { course: Course }) {
  const records = useStudyRecords();
  const { totalMin, byLesson } = courseLearned(records, course.id);
  const totalLessons = course.lessons.length;
  const doneLessons = course.lessons.filter((l) => byLesson.has(l.id)).length;
  const pct = totalLessons > 0 ? Math.round((doneLessons / totalLessons) * 100) : 0;
  const color = subjectColor(course.subject);

  return (
    <Link
      href={`/courses/${course.id}`}
      className="card group hover:border-accent/50 hover:-translate-y-0.5 flex flex-col"
    >
      <div
        className="relative aspect-[16/7] overflow-hidden"
        style={{
          background: `radial-gradient(120% 140% at 0% 0%, ${color}38 0%, transparent 60%), linear-gradient(135deg, ${color}1f, rgb(var(--c-chip)))`,
        }}
      >
        <span
          className="absolute left-3 top-3 tag font-medium border"
          style={{ backgroundColor: `${color}26`, color, borderColor: `${color}44` }}
        >
          {course.subject}
        </span>
        {course.sample && (
          <span className="absolute right-3 top-3 tag bg-chip/80 text-faint border border-line">示例</span>
        )}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-11 h-11 rounded-full border border-line bg-page/40 backdrop-blur flex items-center justify-center text-muted group-hover:text-accent group-hover:border-accent/50 transition-colors">
            <Icon name="play" className="w-5 h-5" />
          </span>
        </span>
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 text-[11px] text-muted">
          <Icon name="book" className="w-3.5 h-3.5" />
          {totalLessons} 讲
        </span>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-line/60">
          <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
      </div>

      <div className="p-3.5 flex-1 flex flex-col">
        <h3 className="text-sm font-medium text-content truncate group-hover:text-accent transition-colors">
          {course.title}
        </h3>
        <p className="text-xs text-faint mt-1 truncate">
          {course.teacher ? `${course.teacher} · ` : ''}
          {course.description || '暂无课程简介'}
        </p>
        <div className="mt-auto pt-3 flex items-center justify-between text-[11px] text-faint">
          <span>已学 {formatMinutesCompact(totalMin)}</span>
          <span>
            {doneLessons}/{totalLessons} 讲
          </span>
        </div>
      </div>
    </Link>
  );
}
