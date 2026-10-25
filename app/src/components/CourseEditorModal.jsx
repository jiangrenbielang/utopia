import React, { useEffect, useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { extractBilibiliEmbed } from '../services/courseSource';

const emptyLesson = (index) => ({ id: `l-${Date.now()}-${index}`, title: `第 ${index + 1} 讲`, url: '' });

/**
 * 移动端课程编辑：与 Web 端课程库一致，支持章节视频直链（m3u8 / mp4）。
 */
export default function CourseEditorModal({ course, subjects, onSave, onClose }) {
  const subjectNames = (subjects || []).map((s) => s.name);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState(subjectNames[0] || '数学');
  const [teacher, setTeacher] = useState('');
  const [description, setDescription] = useState('');
  const [lessons, setLessons] = useState([emptyLesson(0)]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (course) {
      setTitle(course.title || '');
      setSubject(course.subject || subjectNames[0] || '数学');
      setTeacher(course.teacher || '');
      setDescription(course.description || '');
      setLessons(
        course.lessons?.length
          ? course.lessons.map((l) => ({ id: l.id, title: l.title, url: l.url || l.embedUrl || '' }))
          : [emptyLesson(0)]
      );
    } else {
      setTitle('');
      setSubject(subjectNames[0] || '数学');
      setTeacher('');
      setDescription('');
      setLessons([emptyLesson(0)]);
    }
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course]);

  const updateLesson = (index, patch) => {
    setLessons((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('请填写课程名称');
      return;
    }
    const valid = lessons.filter((l) => l.title.trim());
    if (valid.length === 0) {
      setError('至少需要一节课程');
      return;
    }
    const normalizedLessons = [];
    for (const lesson of valid) {
      const raw = lesson.url.trim();
      if (!raw) {
        normalizedLessons.push({ id: lesson.id, title: lesson.title.trim() });
        continue;
      }
      const embedUrl = extractBilibiliEmbed(raw);
      if (embedUrl) {
        normalizedLessons.push({ id: lesson.id, title: lesson.title.trim(), embedUrl });
        continue;
      }
      if (!/^https?:\/\/.+/i.test(raw)) {
        setError(`「${lesson.title}」的视频地址需要以 http(s):// 开头，或粘贴 B 站嵌入代码`);
        return;
      }
      normalizedLessons.push({ id: lesson.id, title: lesson.title.trim(), url: raw });
    }
    onSave({
      ...(course || {}),
      title: title.trim(),
      subject,
      teacher: teacher.trim() || undefined,
      description: description.trim() || undefined,
      lessons: normalizedLessons,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{course ? '编辑课程' : '添加课程'}</h3>
          <button onClick={onClose} style={{ background: 'transparent', padding: 4 }} aria-label="关闭">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit}>
          <label style={labelStyle}>课程名称</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：高等数学 · 基础精讲" style={{ marginBottom: 12 }} />

          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>科目</label>
              <select value={subject} onChange={(e) => setSubject(e.target.value)}>
                {Array.from(new Set([subject, ...subjectNames])).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>讲师（可选）</label>
              <input value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="张老师" />
            </div>
          </div>

          <label style={labelStyle}>简介（可选）</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="这门课讲什么？"
            style={{ marginBottom: 12 }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>课程章节</label>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>支持 B 站 iframe，可留空</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '32vh', overflowY: 'auto', paddingRight: 2 }}>
            {lessons.map((lesson, index) => (
              <div key={lesson.id || index} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', width: 16, paddingTop: 12, flexShrink: 0 }}>
                  {index + 1}
                </span>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input
                    value={lesson.title}
                    onChange={(e) => updateLesson(index, { title: e.target.value })}
                    placeholder="章节标题"
                    style={{ padding: '8px 10px', fontSize: '0.85rem' }}
                  />
                  <input
                    value={lesson.url}
                    onChange={(e) => updateLesson(index, { url: e.target.value })}
                    placeholder="视频直链 m3u8 / mp4，或粘贴 B 站 iframe 代码"
                    style={{ padding: '8px 10px', fontSize: '0.78rem' }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setLessons((prev) => prev.filter((_, i) => i !== index))}
                  disabled={lessons.length <= 1}
                  style={{ background: 'transparent', color: 'var(--text-muted)', padding: 8 }}
                  aria-label="删除章节"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn-outline"
            onClick={() => setLessons((prev) => [...prev, emptyLesson(prev.length)])}
            style={{ width: '100%', padding: 8, marginTop: 8, fontSize: '0.82rem' }}
          >
            <Plus size={15} /> 添加章节
          </button>

          {error && <p style={{ color: '#EF4444', fontSize: '0.78rem', marginTop: 8 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="button" className="btn-outline" onClick={onClose} style={{ flex: 1, padding: 10 }}>
              取消
            </button>
            <button type="submit" className="btn-primary" style={{ flex: 1.3, padding: 10 }}>
              <Save size={17} /> {course ? '保存修改' : '创建课程'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const labelStyle = {
  fontSize: '0.8rem',
  color: 'var(--text-sub)',
  display: 'block',
  marginBottom: 4,
  fontWeight: 600,
};
