import React, { useState } from 'react';
import { X, Moon, Sun, Trash2, Plus, Database, Info, ShieldCheck } from 'lucide-react';
import { saveAppConfig, wipeAllRecords } from '../services/storage';

export default function SettingsModal({ config, onUpdateConfig, onOpenBackup, onRefreshData, onClose }) {
  const [dailyTarget, setDailyTarget] = useState(config.daily_target_min || 300);
  const [subjects, setSubjects] = useState(config.subjects || []);
  const [newSubName, setNewSubName] = useState('');
  const [newSubColor, setNewSubColor] = useState('#4A90D9');
  
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [wipeInputText, setWipeInputText] = useState('');
  const [wipeError, setWipeError] = useState('');

  // 切换主题
  const handleToggleTheme = () => {
    const nextTheme = config.theme_mode === 'dark' ? 'light' : 'dark';
    const updated = saveAppConfig({ theme_mode: nextTheme });
    onUpdateConfig(updated);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  // 修改目标时长
  const handleSaveGoal = () => {
    const mins = parseInt(dailyTarget, 10);
    const updated = saveAppConfig({ daily_target_min: isNaN(mins) ? 0 : mins });
    onUpdateConfig(updated);
  };

  // 添加自定义科目
  const handleAddSubject = (e) => {
    e.preventDefault();
    if (!newSubName.trim()) return;
    if (subjects.some(s => s.name === newSubName.trim())) {
      alert('该科目已存在！');
      return;
    }

    const updatedList = [...subjects, { name: newSubName.trim(), color: newSubColor }];
    setSubjects(updatedList);
    setNewSubName('');
    const updatedConfig = saveAppConfig({ subjects: updatedList });
    onUpdateConfig(updatedConfig);
  };

  // 删除科目
  const handleDeleteSubject = (subName) => {
    if (subjects.length <= 1) {
      alert('至少保留一个科目！');
      return;
    }
    const updatedList = subjects.filter(s => s.name !== subName);
    setSubjects(updatedList);
    const updatedConfig = saveAppConfig({ subjects: updatedList });
    onUpdateConfig(updatedConfig);
  };

  // 安全清空数据
  const handleWipeData = () => {
    if (wipeInputText.trim() !== '清空') {
      setWipeError('请输入正确的二次确认文本“清空”！');
      return;
    }

    wipeAllRecords();
    onRefreshData();
    setShowWipeConfirm(false);
    setWipeInputText('');
    alert('全量学习日志数据已清空（考试日期与系统设置已保留）。');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>应用设置与数据管理</h3>
          <button onClick={onClose} style={{ background: 'transparent', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        {/* 1. 外观与主题切换 */}
        <div className="card" style={{ padding: '14px', marginBottom: '12px', background: 'var(--bg-main)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>视觉主题模式</h4>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-sub)' }}>
                当前：{config.theme_mode === 'dark' ? '护眼深色模式 🌙' : '清新浅蓝原木 ☀️'}
              </p>
            </div>
            <button onClick={handleToggleTheme} className="btn-secondary" style={{ padding: '8px 12px' }}>
              {config.theme_mode === 'dark' ? <Sun size={18} color="#F59E0B" /> : <Moon size={18} color="#3B82F6" />}
              <span>切换</span>
            </button>
          </div>
        </div>

        {/* 2. 每日目标学习时长 */}
        <div className="card" style={{ padding: '14px', marginBottom: '12px', background: 'var(--bg-main)' }}>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '6px' }}>
            🎯 每日专注目标时长 (分钟)
          </h4>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="number"
              min="0"
              max="1440"
              step="30"
              value={dailyTarget}
              onChange={(e) => setDailyTarget(e.target.value)}
              onBlur={handleSaveGoal}
            />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-sub)', flexShrink: 0 }}>
              = {Math.floor(dailyTarget / 60)}小时 {dailyTarget % 60}分
            </span>
          </div>
        </div>

        {/* 3. 科目自定义 */}
        <div className="card" style={{ padding: '14px', marginBottom: '12px', background: 'var(--bg-main)' }}>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px' }}>
            📚 科目管理与专属颜色
          </h4>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
            {subjects.map(s => (
              <div 
                key={s.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  backgroundColor: 'var(--bg-card)',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.8rem'
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: s.color }} />
                <span>{s.name}</span>
                <button 
                  onClick={() => handleDeleteSubject(s.name)} 
                  style={{ background: 'none', padding: 0, color: 'var(--text-muted)' }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddSubject} style={{ display: 'flex', gap: '6px' }}>
            <input
              type="text"
              placeholder="新增自定义科目(如: 政治)..."
              value={newSubName}
              onChange={(e) => setNewSubName(e.target.value)}
              style={{ fontSize: '0.85rem', padding: '6px 10px' }}
            />
            <input
              type="color"
              value={newSubColor}
              onChange={(e) => setNewSubColor(e.target.value)}
              style={{ width: '40px', padding: '2px', height: '36px', flexShrink: 0, cursor: 'pointer' }}
            />
            <button type="submit" className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem', flexShrink: 0 }}>
              <Plus size={14} />
              添加
            </button>
          </form>
        </div>

        {/* 4. 数据备份与清空 */}
        <div className="card" style={{ padding: '14px', marginBottom: '12px', background: 'var(--bg-main)' }}>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px' }}>
            💾 存储与安全
          </h4>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onOpenBackup} className="btn-secondary" style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }}>
              <Database size={16} />
              导出/恢复备份
            </button>

            <button onClick={() => setShowWipeConfirm(true)} className="btn-danger" style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }}>
              <Trash2 size={16} />
              一键清空数据
            </button>
          </div>
        </div>

        {/* 5. 关于 Utopia */}
        <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-sub)', fontSize: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '4px' }}>
            <ShieldCheck size={14} color="#10B981" />
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Utopia v1.2.0</span>
          </div>
          <p>单机纯本地存储 · 零广告 · 不联网申请</p>
        </div>

        <button onClick={onClose} className="btn-outline" style={{ width: '100%', padding: '10px' }}>
          关闭设置
        </button>

        {/* 二次确认清空弹窗 */}
        {showWipeConfirm && (
          <div className="modal-overlay" style={{ zIndex: 1100 }}>
            <div className="modal-container" style={{ maxWidth: '380px' }}>
              <h3 style={{ color: '#EF4444', fontSize: '1.1rem', fontWeight: 700, marginBottom: '10px' }}>
                ⚠️ 高危操作：清空全量学习记录
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)', marginBottom: '14px' }}>
                此操作将永久删除你所有的历史学习打卡日志与备考复盘数据。为了防止误触，请输入“<strong style={{ color: 'var(--text-main)' }}>清空</strong>”以确认操作：
              </p>

              {wipeError && (
                <div style={{ color: '#EF4444', fontSize: '0.8rem', marginBottom: '8px' }}>
                  {wipeError}
                </div>
              )}

              <input
                type="text"
                placeholder="请输入：清空"
                value={wipeInputText}
                onChange={(e) => setWipeInputText(e.target.value)}
                style={{ marginBottom: '16px' }}
              />

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setShowWipeConfirm(false)} className="btn-secondary" style={{ flex: 1, padding: '10px' }}>
                  取消
                </button>
                <button onClick={handleWipeData} className="btn-danger" style={{ flex: 1, padding: '10px' }}>
                  确定清空
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
