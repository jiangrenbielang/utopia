'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageShell } from '@/components/study/page-shell';
import { CourseCard } from '@/components/study/course-card';
import { CourseDialog } from '@/components/study/course-dialog';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { useCourses, useStudyRecords } from '@/lib/study/store';
import { courseLearned } from '@/lib/study/stats';
import { formatMinutes } from '@/lib/study/format';
import { SUBJECTS, type Course } from '@/lib/study/types';
import { cn } from '@/lib/utils';

/** 课程库：按科目筛选、新建 / 编辑课程 */
export default function CoursesPage() {
  return (
    <Suspense>
      <CoursesContent />
    </Suspense>
  );
}

function CoursesContent() {
  const searchParams = useSearchParams();
  const courses = useCourses();
  const records = useStudyRecords();
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>(searchParams.get('subject') || '全部');
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const subject = searchParams.get('subject');
    if (subject) setFilter(subject);
  }, [searchParams]);

  const list = filter === '全部' ? courses : courses.filter((c) => c.subject === filter);
  const totalMinutes = courses.reduce((sum, c) => sum + courseLearned(records, c.id).totalMin, 0);
  const totalLessons = courses.reduce((sum, c) => sum + c.lessons.length, 0);

  const handleSaved = (course: Course) => {
    toast(`课程「${course.title}」已保存`, 'success');
  };

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-content">课程库</h1>
          <p className="text-sm text-muted mt-1.5">
            {courses.length} 门课程 · {totalLessons} 个章节 · 已学 {formatMinutes(totalMinutes)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/resources" className="btn-ghost">
            <Icon name="search" className="w-4 h-4" />
            资源库
          </Link>
          <button className="btn-primary" onClick={() => setDialogOpen(true)}>
            <Icon name="plus" className="w-4 h-4" />
            添加课程
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {['全部', ...SUBJECTS].map((subject) => {
          const active = filter === subject;
          const count = subject === '全部' ? courses.length : courses.filter((c) => c.subject === subject).length;
          return (
            <button
              key={subject}
              className={cn(
                'chip px-3 py-1 text-xs border transition-colors',
                active
                  ? 'bg-accent text-on-accent border-accent'
                  : 'bg-chip text-muted border-line hover:text-content hover:bg-hover'
              )}
              onClick={() => setFilter(subject)}
            >
              {subject}
              <span className={cn('text-[10px]', active ? 'text-on-accent/70' : 'text-faint')}>{count}</span>
            </button>
          );
        })}
      </div>

      {list.length === 0 ? (
        <div className="border border-dashed border-line rounded-xl p-12 text-center">
          <Icon name="book" className="w-7 h-7 mx-auto text-faint mb-3" />
          <p className="text-sm text-muted">
            {courses.length === 0 ? '还没有课程，先创建第一门课' : '该科目下还没有课程'}
          </p>
          <button className="btn-primary btn-sm mt-4" onClick={() => setDialogOpen(true)}>
            <Icon name="plus" className="w-3.5 h-3.5" />
            添加课程
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {list.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-faint mt-5 leading-relaxed">
        课程章节可填入任意可直链播放的 m3u8 / mp4 地址；没有直链时，先去「资源库」搜索网课视频，播放时同样会记录学习时长。
      </p>

      <CourseDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSaved={handleSaved} />
    </PageShell>
  );
}
