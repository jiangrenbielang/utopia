'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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

/**
 * 课程详情：章节列表、进度与进入播放（播放时自动记录学习时长）。
 *
 * 课程 id 走**查询参数**（`/courses/detail?id=xxx`）而不是动态路由段：
 * 课程是用户本地数据（localStorage），静态导出无法在构建期枚举 `[id]` 的取值，
 * 动态路由在纯静态导出下根本构建不出来。查询参数形式对客户端路由完全等价。
 */
export default function CourseDetailPage() {
  return (
    <Suspense>
      <CourseDetailContent />
    </Suspense>
  );
}

function CourseDetailContent() {
  const searchParams = useSearchParams();
  const courseId = searchParams.get('id') || '';
  const router = useRouter();
  const courses = useCourses();
  const records = useStudyRecords();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const course = courses.find((c) => c.id === courseId);

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
  const playable = course.lessons.filter((l) => l.url || l.embedUrl);
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
        className="card relative overflow-hidden p-4 sm:p-5"
        style={{
          background: `radial-gradient(120% 120% at 0% 0%, ${color}24, transparent 55%), rgb(var(--c-card))`,
        }}
      >
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          {/* 大封面：TVBox 风 2:3 竖版海报，科目配色 + 科目前两字 */}
          <div
            className="poster flex w-36 shrink-0 items-center justify-center sm:w-40"
            style={{ background: `linear-gradient(135deg, ${color}38, ${color}14)` }}
            aria-hidden
          >
            <span className="text-5xl font-black" style={{ color }}>
              {course.subject.slice(0, 2)}
            </span>
            <div className="poster-scrim absolute inset-x-0 bottom-0 h-14" />
            <span className="absolute inset-x-0 bottom-1.5 text-center text-[11px] text-white/90">
              {totalLessons} 讲
            </span>
          </div>

          <div className="min-w-0 w-full flex-1">
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

        {/* TVBox 风剧集网格：每讲一张小格 */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {course.lessons.map((lesson, index) => {
            const learnedMin = byLesson.get(lesson.id) ?? 0;
            return (
              <div
                key={lesson.id}
                className="card flex flex-col p-2.5 transition-colors hover:border-accent/50"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-mono shrink-0"
                    style={{ backgroundColor: `${color}1f`, color }}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {learnedMin > 0 && (
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-success" title="已记录学习时长">
                      <Icon name="check" className="w-3.5 h-3.5" />
                      已记录
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-content line-clamp-2" title={lesson.title}>
                  {lesson.title}
                </p>
                <p className="mt-0.5 text-[10px] text-faint">
                  {learnedMin > 0 ? `已学 ${formatMinutes(learnedMin)}` : '未学习'}
                  {!lesson.url && !lesson.embedUrl && ' · 待补充视频'}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                  {lesson.url || lesson.embedUrl ? (
                    <Link
                      href={watchHref(course, lesson)}
                      className="btn-ghost btn-sm"
                    >
                      <Icon name="play" className="w-3.5 h-3.5" />
                      播放
                    </Link>
                  ) : (
                    <button className="btn-ghost btn-sm" disabled title="请先编辑课程补充视频地址">
                      待补充
                    </button>
                  )}
                </div>
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

/** 课程章节 → 播放页（source=course 直链；source=embed 为 B 站站外播放器 iframe） */
function watchHref(course: Course, lesson: Lesson): string {
  const sp = new URLSearchParams({
    source: lesson.embedUrl ? 'embed' : 'course',
    url: lesson.embedUrl || lesson.url || '',
    title: lesson.title,
    subject: course.subject,
    courseId: course.id,
    lessonId: lesson.id,
    courseTitle: course.title,
  });
  return `/watch?${sp.toString()}`;
}
