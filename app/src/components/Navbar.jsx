import React from 'react';
import { Home, Timer, BarChart3, BookOpen, FileText } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, timerState }) {
  const isTimerRunning = timerState && timerState.status !== 'IDLE';

  const tabs = [
    { id: 'home', label: '首页', icon: Home },
    { id: 'courses', label: '课程', icon: BookOpen },
    { id: 'timer', label: '计时', icon: Timer, badge: isTimerRunning },
    { id: 'stats', label: '统计', icon: BarChart3 },
    { id: 'log', label: '日志', icon: FileText }
  ];

  return (
    <div style={{
      position: 'sticky',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'var(--bg-card)',
      borderTop: '1px solid var(--border-color)',
      padding: '8px 8px 12px 8px',
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'center',
      zIndex: 100,
      boxShadow: 'var(--shadow-lg)'
    }}>
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = activeTab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              flex: 1,
              flexDirection: 'column',
              gap: '4px',
              padding: '6px 0',
              background: 'transparent',
              border: 'none',
              color: isActive ? 'var(--primary-blue)' : 'var(--text-sub)',
              fontWeight: isActive ? 700 : 500,
              fontSize: '0.72rem',
              position: 'relative'
            }}
          >
            <div style={{ position: 'relative' }}>
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              {t.badge && (
                <span style={{
                  position: 'absolute',
                  top: -2,
                  right: -6,
                  width: 8,
                  height: 8,
                  backgroundColor: '#EF4444',
                  borderRadius: '50%',
                  boxShadow: '0 0 0 2px var(--bg-card)'
                }} />
              )}
            </div>
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
