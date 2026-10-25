import React, { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Edit2,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import CourseEditorModal from '../components/CourseEditorModal';
import CoursePlayer from '../components/CoursePlayer';
import { deleteCourse, getCourses, saveCourse } from '../services/storage';

function formatMinutes(min) {
  const total = Math.max(0, Math.round(min || 0));
  if (total < 60) return `${total} 分钟`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}

function formatCompact(min) {
  const total = Math.max(0, Math.round(min || 0));
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

/**
 * 移动端课程库：与 Web 端一致，按科目组织课程、章节进度、播放即计时。
 */
export default function CoursesPage({ config, records, onRefreshData, onCoursesChanged }) {
  const [courses, setCourses] = useState(() => getCourses());
  const [filter, setFilter] = useState('全部');
  const [selectedId, setSelectedId] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [editor, setEditor] = useState({ open: false, course: null });

  const subjects = config.subjects || [];
  const subjectColor = (name) => subjects.find((s) => s.name === name)?.color || '#9AA5B1';

  const refreshCourses = () => {
    setCourses(getCourses());
    onCoursesChanged?.();
  };

  const statsFor = (course) => {
    const byLesson = new Map();
    let total = 0;
    records.forEach((r) => {
      if (r.course_id !== course.id || !r.lesson_id) return;
      byLesson.set(r.lesson_id, (byLesson.get(r.lesson_id) || 0) + (r.duration_min || 0));
      total += r.duration_min || 0;
    });
    const done = (course.lessons || []).filter((l) => byLesson.has(l.id)).length;
    const pct = course.lessons?.length ? Math.round((done / course.lessons.length) * 100) : 0;
    return { byLesson, total, done, pct };
  };

  const list = filter === '全部' ? courses : courses.filter((c) => c.subject === filter);
  const selected = courses.find((c) => c.id === selectedId) || null;

  const handleSave = (data) => {
    const saved = saveCourse(data);
    refreshCourses();
    setEditor({ open: false, course: null });
    setSelectedId(saved.id);
  };

  const handleDelete = (course) => {
    if (!window.confirm(`确定删除课程「${course.title}」吗？已产生的学习记录会保留。`)) return;
    deleteCourse(course.id);
    refreshCourses();
    setSelectedId(null);
  };

  const playLesson = (course, lesson) => {
    if (!lesson.url?.trim()) {
      window.alert('该章节还没有配置视频地址，请先编辑课程补充直链。');
      return;
    }
    setPlaying({ course, lesson });
  };

  if (selected) {
    const stat = statsFor(selected);
    const playable = (selected.lessons || []).filter((l) => l.url?.trim());
    const nextLesson = playable.find((l) => !stat.byLesson.has(l.id)) || playable[0];

    return (
      <div className="animate-fade-in" style={{ padding: '16px', paddingBottom: 32 }}>
        <button
          onClick={() => setSelectedId(null)}
          style={{ background: 'transparent', color: 'var(--text-sub)', padding: '4px 0', marginBottom: 10, fontSize: '0.85rem' }}
        >
          <ArrowLeft size={18} /> 课程库
        </button>

        <div
          className="card"
          style={{
            background: `linear-gradient(135deg, ${subjectColor(selected.subject)}22, var(--bg-card))`,
            padding: 18,
          }}
        >
          <span
            className="tag"
            style={{
              display: 'inline-flex',
              padding: '3px 8px',
              borderRadius: 999,
              fontSize: '0.72rem',
              fontWeight: 700,
              color: subjectColor(selected.subject),
              background: `${subjectColor(selected.subject)}22`,
            }}
          >
            {selected.subject}
          </span>
          {selected.sample && (
            <span style={{ marginLeft: 6, fontSize: '0.68rem', color: 'var(--text-muted)' }}>示例课程</span>
          )}
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: 8 }}>{selected.title}</h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-sub)', marginTop: 4 }}>
            {selected.teacher ? `${selected.teacher} · ` : ''}
            {selected.lessons?.length || 0} 讲 · 已学 {formatMinutes(stat.total)}
          </p>
          {selected.description && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)', marginTop: 10, lineHeight: 1.5 }}>{selected.description}</p>
          )}

          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 7, background: 'var(--bg-main)', borderRadius: 4, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${stat.pct}%`,
                  background: subjectColor(selected.subject),
                  borderRadius: 4,
                }}
              />
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-sub)' }}>
              {stat.done}/{selected.lessons?.length || 0} 讲 · {stat.pct}%
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button
              className="btn-primary"
              onClick={() => nextLesson && playLesson(selected, nextLesson)}
              disabled={!nextLesson}
              style={{ padding: '10px 14px', fontSize: '0.85rem' }}
            >
              <Play size={16} fill="white" /> {stat.done > 0 ? '继续学习' : '开始学习'}
            </button>
            <button
              className="btn-outline"
              onClick={() => setEditor({ open: true, course: selected })}
              style={{ padding: '10px 12px', fontSize: '0.82rem' }}
            >
              <Edit2 size={15} /> 编辑
            </button>
            <button
              className="btn-outline"
              onClick={() => handleDelete(selected)}
              style={{ padding: '10px 12px', fontSize: '0.82rem', color: '#EF4444' }}
            >
              <Trash2 size={15} /> 删除
            </button>
          </div>
        </div>

        <h3 style={{ fontSize: '0.92rem', fontWeight: 700, margin: '16px 0 8px' }}>章节列表</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(selected.lessons || []).map((lesson, index) => {
            const learned = stat.byLesson.get(lesson.id) || 0;
            return (
              <div
                key={lesson.id || index}
                className="card"
                style={{ padding: 12, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: `${subjectColor(selected.subject)}18`,
                    color: subjectColor(selected.subject),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {lesson.title}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {learned > 0 ? `已学 ${formatCompact(learned)}` : '未学习'}
                    {!lesson.url && ' · 待补充视频'}
                  </div>
                </div>
                {learned > 0 && <CheckCircle2 size={15} color="#10B981" />}
                <button
                  className="btn-outline"
                  disabled={!lesson.url}
                  onClick={() => playLesson(selected, lesson)}
                  style={{ padding: '6px 10px', fontSize: '0.78rem', flexShrink: 0, opacity: lesson.url ? 1 : 0.5 }}
                >
                  <Play size={14} /> 播放
                </button>
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.6 }}>
          播放网课时会自动记录学习时长（不足 1 分钟不保存），离开播放页自动保存；可在历史日志中修改内容。
        </p>

        {playing && (
          <CoursePlayer
            course={playing.course}
            lesson={playing.lesson}
            subjects={subjects}
            onClose={() => {
              setPlaying(null);
              onRefreshData?.();
            }}
            onSaved={() => onRefreshData?.()}
          />
        )}

        {editor.open && (
          <CourseEditorModal
            course={editor.course}
            subjects={subjects}
            onSave={handleSave}
            onClose={() => setEditor({ open: false, course: null })}
          />
        )}
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ padding: '16px', paddingBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>课程库</h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-sub)', marginTop: 2 }}>
            {courses.length} 门课程 · {courses.reduce((n, c) => n + (c.lessons?.length || 0), 0)} 个章节
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setEditor({ open: true, course: null })}
          style={{ padding: '9px 12px', fontSize: '0.82rem' }}
        >
          <Plus size={16} /> 添加课程
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 0 12px' }}>
        {['全部', ...subjects.map((s) => s.name)].map((name) => {
          const active = filter === name;
          const count = name === '全部' ? courses.length : courses.filter((c) => c.subject === name).length;
          return (
            <button
              key={name}
              onClick={() => setFilter(name)}
              style={{
                flexShrink: 0,
                padding: '6px 10px',
                borderRadius: 999,
                fontSize: '0.76rem',
                fontWeight: 600,
                background: active ? 'var(--primary-blue)' : 'var(--bg-card)',
                color: active ? '#fff' : 'var(--text-sub)',
                border: `1px solid ${active ? 'var(--primary-blue)' : 'var(--border-color)'}`,
              }}
            >
              {name} {count}
            </button>
          );
        })}
      </div>

      {list.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <BookOpen size={36} color="var(--text-muted)" style={{ marginBottom: 8 }} />
          <p style={{ fontSize: '0.9rem', color: 'var(--text-sub)' }}>
            {courses.length === 0 ? '还没有课程，先创建第一门课' : '该科目下还没有课程'}
          </p>
          <button
            className="btn-primary"
            onClick={() => setEditor({ open: true, course: null })}
            style={{ marginTop: 14, padding: '9px 14px', fontSize: '0.82rem' }}
          >
            <Plus size={16} /> 添加课程
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map((course) => {
            const stat = statsFor(course);
            const color = subjectColor(course.subject);
            return (
              <div
                key={course.id}
                className="card"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(course.id)}
                onKeyDown={(e) => e.key === 'Enter' && setSelectedId(course.id)}
                style={{ padding: 0, marginBottom: 0, overflow: 'hidden', cursor: 'pointer' }}
              >
                <div
                  style={{
                    height: 92,
                    background: `linear-gradient(135deg, ${color}33, ${color}0d)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        background: `${color}22`,
                        color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <BookOpen size={21} />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color }}>{course.subject}</span>
                      <div style={{ fontSize: '0.92rem', fontWeight: 700, marginTop: 2 }}>{course.title}</div>
                    </div>
                  </div>
                  <ChevronRight size={18} color="var(--text-muted)" />
                </div>
                <div style={{ padding: '10px 16px 12px' }}>
                  <div style={{ fontSize: '0.73rem', color: 'var(--text-sub)' }}>
                    {course.teacher ? `${course.teacher} · ` : ''}
                    {course.lessons?.length || 0} 讲 · 已学 {formatCompact(stat.total)}
                    {course.sample && <span style={{ marginLeft: 6, color: 'var(--text-muted)' }}>示例</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <div style={{ flex: 1, height: 6, background: 'var(--bg-main)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${stat.pct}%`, background: color, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {stat.done}/{course.lessons?.length || 0} 讲
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 14, lineHeight: 1.6 }}>
        课程章节支持 m3u8 / mp4 直链；内置示例课程使用公开测试流，可在编辑课程中替换为自己的网课地址。
      </p>

      {editor.open && (
        <CourseEditorModal
          course={editor.course}
          subjects={subjects}
          onSave={handleSave}
          onClose={() => setEditor({ open: false, course: null })}
        />
      )}
    </div>
  );
}
