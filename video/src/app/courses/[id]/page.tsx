'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { PageShell } from '@/components/study/page-shell';
import { CourseDialog } from '@/components/study/course-dialog';
import { SubjectBadge } from '@/components/study/subject-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { deleteCourse, useCourses, useStudyRecords } from '@/lib/study/store';
import { courseLearned } from '@/lib/study/stats';
import { formatMinutes } from '@/lib/study/format';
import { subjectColor, type Course, type Lesson } from '@/lib/study/types';

/** 课程详情：章节列表、进度与进入播放（播放时自动记录学习时长） */
export default function CourseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const courses = useCourses();
  const records = useStudyRecords();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const course = courses.find((c) => c.id === params?.id);

  if (!course) {
    return (
      <PageShell>
        <div className="py-20 text-center">
          <Icon name="book" className="w-8 h-8 mx-auto text-faint mb-3" />
          <p className="text-sm text-muted">课程不存在或已被删除</p>
          <Link href="/courses" className="btn-primary btn-sm mt-4">
            返回课程库
          </Link>
        </div>
      </PageShell>
    );
  }

  const { totalMin, byLesson } = courseLearned(records, course.id);
  const totalLessons = course.lessons.length;
  const doneLessons = course.lessons.filter((l) => byLesson.has(l.id)).length;
  const pct = totalLessons > 0 ? Math.round((doneLessons / totalLessons) * 100) : 0;
  const color = subjectColor(course.subject);
  const playable = course.lessons.filter((l) => l.url);
  const nextLesson = playable.find((l) => !byLesson.has(l.id)) ?? playable[0];

  const handleSaved = (saved: Course) => {
    toast(`课程「${saved.title}」已更新`, 'success');
  };

  return (
    <PageShell>
      <nav className="flex items-center gap-1.5 text-xs text-faint mb-4" aria-label="面包屑">
        <Link href="/courses" className="hover:text-accent transition-colors">
          课程库
        </Link>
        <span>/</span>
        <span className="text-muted truncate">{course.title}</span>
      </nav>

      <section
        className="card relative overflow-hidden p-5 sm:p-6"
        style={{
          background: `radial-gradient(120% 120% at 0% 0%, ${color}24, transparent 55%), rgb(var(--c-card))`,
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div
            className="w-full sm:w-40 aspect-[16/9] sm:aspect-square rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `linear-gradient(135deg, ${color}38, ${color}14)` }}
            aria-hidden
          >
            <span className="text-4xl font-black" style={{ color }}>
              {course.subject.slice(0, 2)}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <SubjectBadge subject={course.subject} />
              {course.sample && <span className="tag bg-chip text-faint border border-line">示例课程</span>}
            </div>
            <h1 className="text-2xl font-bold text-content mt-2">{course.title}</h1>
            <p className="text-xs text-faint mt-1">
              {course.teacher ? `${course.teacher} · ` : ''}
              {totalLessons} 讲 · 已学 {formatMinutes(totalMin)}
            </p>
            {course.description && (
              <p className="text-sm text-muted leading-relaxed mt-3 line-clamp-3">{course.description}</p>
            )}

            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 flex-1 max-w-xs rounded-full bg-chip overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
              </div>
              <span className="text-[11px] text-faint">
                {doneLessons}/{totalLessons} 讲 · {pct}%
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-4">
              {nextLesson ? (
                <Link
                  href={watchHref(course, nextLesson)}
                  className="btn-primary"
                >
                  <Icon name="play" className="w-4 h-4" />
                  {byLesson.size > 0 ? '继续学习' : '开始学习'}
                </Link>
              ) : (
                <button className="btn-primary" disabled title="请先编辑课程，为章节补充视频地址">
                  <Icon name="play" className="w-4 h-4" />
                  暂无视频
                </button>
              )}
              <Link href={`/resources?s=${encodeURIComponent(course.title)}`} className="btn-ghost">
                <Icon name="search" className="w-4 h-4" />
                在资源库找视频
              </Link>
              <button className="btn-ghost" onClick={() => setEditOpen(true)}>
                <Icon name="edit" className="w-4 h-4" />
                编辑
              </button>
              <button className="btn-ghost !text-danger" onClick={() => setDeleteOpen(true)}>
                <Icon name="trash" className="w-4 h-4" />
                删除
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5" aria-label="章节列表">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-content">章节列表</h2>
          <span className="text-xs text-faint">{totalLessons} 讲</span>
        </div>

        <div className="space-y-2">
          {course.lessons.map((lesson, index) => {
            const learnedMin = byLesson.get(lesson.id) ?? 0;
            return (
              <div key={lesson.id} className="card p-3 flex items-center gap-3 hover:border-accent/40 transition-colors">
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono shrink-0"
                  style={{ backgroundColor: `${color}1f`, color }}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-content truncate">{lesson.title}</p>
                  <p className="text-[11px] text-faint mt-0.5">
                    {learnedMin > 0 ? `已学 ${formatMinutes(learnedMin)}` : '未学习'}
                    {!lesson.url && ' · 待补充视频'}
                  </p>
                </div>
                {learnedMin > 0 && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-success shrink-0">
                    <Icon name="check" className="w-3.5 h-3.5" />
                    已记录
                  </span>
                )}
                {lesson.url ? (
                  <Link href={watchHref(course, lesson)} className="btn-ghost btn-sm shrink-0">
                    <Icon name="play" className="w-3.5 h-3.5" />
                    播放
                  </Link>
                ) : (
                  <button className="btn-ghost btn-sm shrink-0" disabled title="请先编辑课程补充视频地址">
                    待补充
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-[11px] text-faint mt-4 leading-relaxed">
        播放网课时页面会按实际观看时长自动计时（不足 1 分钟不记录），离开页面时自动保存；也可在播放页手动结束并补充学习内容。
      </p>

      <CourseDialog open={editOpen} course={course} onClose={() => setEditOpen(false)} onSaved={handleSaved} />

      <ConfirmDialog
        open={deleteOpen}
        danger
        title="删除课程"
        message={
          <>
            确定删除「{course.title}」吗？已产生的学习记录会保留，但课程与章节配置将无法恢复。
          </>
        }
        confirmLabel="删除课程"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          deleteCourse(course.id);
          setDeleteOpen(false);
          toast('课程已删除', 'info');
          router.push('/courses');
        }}
      />
    </PageShell>
  );
}

/** 课程章节 → 播放页（source=course 表示直链播放，不依赖点播源） */
function watchHref(course: Course, lesson: Lesson): string {
  const sp = new URLSearchParams({
    source: 'course',
    url: lesson.url ?? '',
    title: lesson.title,
    subject: course.subject,
    courseId: course.id,
    lessonId: lesson.id,
    courseTitle: course.title,
  });
  return `/watch?${sp.toString()}`;
}
