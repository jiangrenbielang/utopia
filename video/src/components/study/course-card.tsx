'use client';

import Link from 'next/link';
import { Icon } from '@/components/icon';
import { courseLearned } from '@/lib/study/stats';
import { useStudyRecords } from '@/lib/study/store';
import { subjectColor, type Course } from '@/lib/study/types';
import { formatMinutesCompact } from '@/lib/study/format';

/**
 * 课程卡片：TVBox 风竖版海报卡（2:3），封面用科目配色 + 科目前两字，
 * 标题与进度贴在封面下沿；学习进度仍按已记录的章节聚合。
 */
export function CourseCard({ course }: { course: Course }) {
  const records = useStudyRecords();
  const { totalMin, byLesson } = courseLearned(records, course.id);
  const totalLessons = course.lessons.length;
  const doneLessons = course.lessons.filter((l) => byLesson.has(l.id)).length;
  const pct = totalLessons > 0 ? Math.round((doneLessons / totalLessons) * 100) : 0;
  const color = subjectColor(course.subject);

  return (
    <Link
      href={`/courses/detail?id=${encodeURIComponent(course.id)}`}
      className="card poster-card-hover focus-ring group flex flex-col overflow-hidden"
    >
      <div
        className="poster flex items-center justify-center"
        style={{
          background: `radial-gradient(120% 120% at 0% 0%, ${color}38 0%, transparent 60%), linear-gradient(160deg, ${color}1f, rgb(var(--c-chip)))`,
        }}
      >
        <span className="text-5xl font-black leading-none" style={{ color }}>
          {course.subject.slice(0, 2)}
        </span>
        <span
          className="tag absolute left-2 top-2 border font-medium"
          style={{ backgroundColor: `${color}26`, color, borderColor: `${color}44` }}
        >
          {course.subject}
        </span>
        {course.sample && (
          <span className="tag absolute right-2 top-2 bg-black/70 text-white">示例</span>
        )}
        {/* 底部遮罩 + 集数：标题压在图上时保证可读 */}
        <div className="poster-scrim absolute inset-x-0 bottom-0 h-16" />
        <span className="absolute inset-x-0 bottom-1.5 flex items-center justify-center gap-1 text-[11px] text-white/90">
          <Icon name="book" className="w-3.5 h-3.5" />
          {totalLessons} 讲
        </span>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
          <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-2.5">
        <h3 className="text-[13px] font-medium leading-snug text-content line-clamp-2 group-hover:text-accent transition-colors">
          {course.title}
        </h3>
        {course.teacher && <p className="mt-0.5 truncate text-[11px] text-faint">{course.teacher}</p>}
        <div className="mt-auto flex items-center justify-between pt-2 text-[11px] text-faint">
          <span>已学 {formatMinutesCompact(totalMin)}</span>
          <span className="shrink-0">
            {doneLessons}/{totalLessons} 讲
          </span>
        </div>
      </div>
    </Link>
  );
}