import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Hls from 'hls.js';
import { ArrowLeft, Check, Clock, X } from 'lucide-react';
import { addRecord, formatDate } from '../services/storage';

function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * 移动端课程播放器：与 Web 端「播放即计时」一致。
 * - 按真实播放进度累计，暂停/快进不计；
 * - 满 1 分钟可结束并填写内容，离开页面自动保存；
 * - 记录关联 course_id / lesson_id，用于课程章节进度。
 */
export default function CoursePlayer({ course, lesson, subjects = [], onClose, onSaved }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const watchedRef = useRef(0);
  const lastTimeRef = useRef(0);
  const startRef = useRef(null);
  const savedRef = useRef(false);
  const [watchedSec, setWatchedSec] = useState(0);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [content, setContent] = useState(`${course.title} · ${lesson.title}`);
  const [subject, setSubject] = useState(course.subject);

  const subjectOptions = Array.from(new Set([course.subject, ...subjects.map((s) => s.name)]));
  const contentRef = useRef(content);
  const subjectRef = useRef(subject);
  contentRef.current = content;
  subjectRef.current = subject;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    setError('');
    const url = lesson.url;
    if (!url) {
      setError('本节暂未配置视频地址，请先在课程编辑中补充');
      return undefined;
    }

    const isHls = /\.m3u8(\?|$)/i.test(url);
    if (isHls && !video.canPlayType('application/vnd.apple.mpegurl') && Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 30 });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setError('视频加载失败，请检查网络或视频地址');
      });
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    video.src = url;
    return () => {
      video.removeAttribute('src');
      video.load();
    };
  }, [lesson.url]);

  const persist = (override) => {
    if (savedRef.current) return false;
    const seconds = Math.floor(watchedRef.current);
    if (seconds < 60) return false;
    const start = startRef.current || Date.now();
    addRecord({
      start_timestamp: start,
      end_timestamp: Date.now(),
      duration_min: Math.ceil(seconds / 60),
      subject_name: override?.subject || subjectRef.current || course.subject,
      study_content: override?.content || contentRef.current || `${course.title} · ${lesson.title}`,
      record_date: formatDate(new Date(start)),
      course_id: course.id,
      lesson_id: lesson.id,
    });
    savedRef.current = true;
    setSaved(true);
    onSaved?.();
    return true;
  };

  const persistRef = useRef(persist);
  persistRef.current = persist;

  useEffect(() => {
    const saveIfPossible = () => {
      if (!savedRef.current) persistRef.current();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') saveIfPossible();
    };
    window.addEventListener('pagehide', saveIfPossible);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', saveIfPossible);
      document.removeEventListener('visibilitychange', onVisibility);
      saveIfPossible();
    };
  }, []);

  const handleClose = () => {
    if (!savedRef.current) persist();
    onClose();
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const current = video.currentTime || 0;
    const delta = current - lastTimeRef.current;
    if (delta > 0 && delta < 15) {
      if (watchedRef.current === 0) startRef.current = Date.now() - Math.round(delta * 1000);
      watchedRef.current += delta;
      setWatchedSec(Math.floor(watchedRef.current));
    }
    lastTimeRef.current = current;
  };

  const openSave = () => {
    if (Math.floor(watchedRef.current) < 60) {
      window.alert('学习时长不足 1 分钟，本次不保存');
      return;
    }
    setShowSave(true);
  };

  const handleSave = () => {
    if (persist({ content: content.trim(), subject })) {
      setShowSave(false);
      window.alert(`已记录 ${Math.ceil(watchedRef.current / 60)} 分钟 · ${subject}`);
    }
  };

  return createPortal(
    <div
      style={{ 
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: '#0b101a',
          color: '#e6f2ff',
          borderBottom: '1px solid #223045',
        }}
      >
        <button
          onClick={handleClose}
          style={{ background: 'transparent', color: '#e6f2ff', padding: 4, flexShrink: 0 }}
          aria-label="返回课程"
        >
          <ArrowLeft size={22} />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {lesson.title}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#8599b2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {course.title}
          </div>
        </div>
        {saved && (
          <span style={{ fontSize: '0.75rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <Check size={14} /> 已保存
          </span>
        )}
      </header>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', background: '#000' }}>
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          onTimeUpdate={handleTimeUpdate}
          onSeeking={() => {
            lastTimeRef.current = videoRef.current?.currentTime || 0;
          }}
          onPlay={() => {
            lastTimeRef.current = videoRef.current?.currentTime || 0;
          }}
          onEnded={() => persist()}
          style={{ width: '100%', maxHeight: '62vh', background: '#000' }}
        />
      </div>

      {error && (
        <div style={{ padding: '10px 16px', background: '#451a1a', color: '#fca5a5', fontSize: '0.8rem' }}>{error}</div>
      )}

      <footer style={{ padding: 16, background: 'var(--bg-card)', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--text-sub)' }}>
            <Clock size={16} color="var(--primary-blue)" />
            本节学习
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', color: 'var(--primary-blue)', fontWeight: 700 }}>
              {formatClock(watchedSec)}
            </span>
          </div>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={saved}
            style={{ width: 'auto', flex: 1, minWidth: 110, padding: '7px 10px', fontSize: '0.8rem' }}
            aria-label="本次学习科目"
          >
            {subjectOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button className="btn-primary" onClick={openSave} disabled={saved} style={{ padding: '9px 14px', fontSize: '0.85rem' }}>
            {saved ? '已保存' : '结束并保存'}
          </button>
        </div>
        <p style={{ marginTop: 8, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          播放时自动累计 · 不足 1 分钟不记录 · 离开页面自动保存
        </p>
      </footer>

      {showSave && (
        <div className="modal-overlay" style={{ zIndex: 1400 }} onClick={() => setShowSave(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>保存本次学习</h3>
              <button onClick={() => setShowSave(false)} style={{ background: 'transparent', padding: 4 }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-sub)', marginBottom: 12 }}>
              本次学习 <b style={{ color: 'var(--primary-blue)' }}>{Math.ceil(watchedRef.current / 60)} 分钟</b>，按 1 分钟向上取整记录。
            </p>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-sub)', display: 'block', marginBottom: 4 }}>科目</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={{ marginBottom: 12, fontSize: '0.88rem' }}
            >
              {subjectOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-sub)', display: 'block', marginBottom: 4 }}>学习内容</label>
            <textarea
              rows="3"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="本次网课学到了什么？"
              style={{ marginBottom: 12, fontSize: '0.88rem' }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-outline" onClick={() => setShowSave(false)} style={{ flex: 1, padding: 10 }}>
                取消
              </button>
              <button className="btn-primary" onClick={handleSave} style={{ flex: 1.4, padding: 10 }}>
                保存记录
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}