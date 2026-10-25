import React from 'react';
import { Play, Sparkles, BookOpen, Clock, Target, ChevronRight } from 'lucide-react';
import CountdownCard from '../components/CountdownCard';
import TimerWidget from '../components/TimerWidget';
import { getRandomQuote } from '../services/quotes';
import { formatDate } from '../services/storage';

export default function HomePage({ 
  config, 
  records, 
  timerState, 
  courses = [],
  onStartTimer, 
  onJumpToTimer, 
  onOpenCourses,
  onOpenEditDate 
}) {
  const quote = getRandomQuote();
  const todayStr = formatDate(new Date());

  // 过滤今日记录
  const todayRecords = records.filter(r => r.record_date === todayStr);
  const todayTotalMin = todayRecords.reduce((sum, r) => sum + (r.duration_min || 0), 0);

  // 今日按科目统计
  const todaySubjectMap = {};
  todayRecords.forEach(r => {
    todaySubjectMap[r.subject_name] = (todaySubjectMap[r.subject_name] || 0) + r.duration_min;
  });

  const dailyTargetMin = config.daily_target_min || 300;
  const targetPercent = Math.min(100, Math.round((todayTotalMin / dailyTargetMin) * 100));

  // 科目颜色映射
  const subjectColorMap = {};
  (config.subjects || []).forEach(s => {
    subjectColorMap[s.name] = s.color;
  });

  return (
    <div className="animate-fade-in" style={{ padding: '16px', paddingBottom: '32px' }}>
      {/* 迷你悬浮常驻计时条 */}
      <TimerWidget timerState={timerState} onClick={onJumpToTimer} />

      {/* 考研目标倒计时卡片 */}
      <CountdownCard 
        examTargetDate={config.exam_target_date} 
        onOpenEditDate={onOpenEditDate} 
      />

      {/* 快捷按钮：开始计时 */}
      <button 
        onClick={onStartTimer}
        className="btn-primary"
        style={{
          width: '100%',
          padding: '16px',
          fontSize: '1.1rem',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px'
        }}
      >
        <Play size={22} fill="white" />
        <span>开始学习计时</span>
      </button>

      {/* 今日学习汇总卡片 */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={18} color="var(--primary-blue)" />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>今日学习汇总</h3>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-sub)' }}>{todayStr}</span>
        </div>

        {/* 今日专注总时长 */}
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '6px',
          marginBottom: '14px'
        }}>
          <span style={{ fontSize: '2.4rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--primary-blue)' }}>
            {Math.floor(todayTotalMin / 60)}
          </span>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-sub)' }}>小时</span>
          <span style={{ fontSize: '2.4rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--primary-blue)' }}>
            {todayTotalMin % 60}
          </span>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-sub)' }}>分钟</span>
        </div>

        {/* 每日目标进度条 */}
        {dailyTargetMin > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-sub)', marginBottom: '4px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Target size={14} /> 每日目标 ({Math.floor(dailyTargetMin / 60)}h)
              </span>
              <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{targetPercent}%</span>
            </div>
            <div style={{ height: '8px', width: '100%', backgroundColor: 'var(--bg-main)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${targetPercent}%`,
                background: 'linear-gradient(90deg, var(--primary-blue), var(--accent-gold))',
                borderRadius: '4px',
                transition: 'width 0.4s ease'
              }} />
            </div>
          </div>
        )}

        {/* 科目明细分布 */}
        {Object.keys(todaySubjectMap).length > 0 ? (
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-sub)', marginBottom: '8px', fontWeight: 600 }}>
              今日各科投入：
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Object.entries(todaySubjectMap).map(([sub, mins]) => {
                const subColor = subjectColorMap[sub] || '#9AA5B1';
                const subPercent = Math.round((mins / todayTotalMin) * 100);
                return (
                  <div key={sub} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: subColor }} />
                      <span style={{ fontWeight: 500 }}>{sub}</span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-sub)' }}>
                      {Math.floor(mins / 60) > 0 ? `${Math.floor(mins / 60)}h ` : ''}{mins % 60}m ({subPercent}%)
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            今日尚未开始计时，去专注一下吧！
          </div>
        )}
      </div>


      {/* 课程推荐：与 Web 端课程库打通 */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <BookOpen size={17} color="var(--primary-blue)" />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>课程推荐</h3>
          </div>
          <button onClick={onOpenCourses} style={{ background: 'transparent', color: 'var(--text-sub)', fontSize: '0.78rem', padding: 0 }}>
            全部课程 <ChevronRight size={14} />
          </button>
        </div>

        {courses.length === 0 ? (
          <div className="card" style={{ padding: 16, textAlign: 'center', marginBottom: 0 }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-sub)', marginBottom: 8 }}>还没有课程，去课程库添加一门网课</p>
            <button className="btn-primary" onClick={onOpenCourses} style={{ padding: '8px 12px', fontSize: '0.8rem' }}>
              打开课程库
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {courses.slice(0, 2).map((course) => {
              const byLesson = new Map();
              let learnedMin = 0;
              records.forEach((r) => {
                if (r.course_id !== course.id || !r.lesson_id) return;
                byLesson.set(r.lesson_id, (byLesson.get(r.lesson_id) || 0) + (r.duration_min || 0));
                learnedMin += r.duration_min || 0;
              });
              const done = (course.lessons || []).filter((l) => byLesson.has(l.id)).length;
              const color = subjectColorMap[course.subject] || '#9AA5B1';
              return (
                <div
                  key={course.id}
                  className="card"
                  role="button"
                  tabIndex={0}
                  onClick={onOpenCourses}
                  onKeyDown={(e) => e.key === 'Enter' && onOpenCourses()}
                  style={{ padding: 12, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}20`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <BookOpen size={19} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{course.title}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-sub)', marginTop: 2 }}>
                      {course.subject} · {course.lessons?.length || 0} 讲 · 已学 {learnedMin >= 60 ? `${Math.floor(learnedMin / 60)}h${learnedMin % 60 ? `${learnedMin % 60}m` : ''}` : `${learnedMin}m`}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{done}/{course.lessons?.length || 0}</span>
                  <ChevronRight size={16} color="var(--text-muted)" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 每日金句 · 备考励志金句卡片 */}
      <div className="card card-wood">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <Sparkles size={16} color="var(--accent-gold)" />
          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent-gold)' }}>
            每日金句 · 每日灵感
          </span>
        </div>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.6, fontStyle: 'italic', marginBottom: '6px' }}>
          “{quote.text}”
        </p>
        <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-sub)', fontWeight: 600 }}>
          —— {quote.author}
        </div>
      </div>
    </div>
  );
}
