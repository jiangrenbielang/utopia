import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import TimerPage from './pages/TimerPage';
import StatsPage from './pages/StatsPage';
import LogPage from './pages/LogPage';
import EditExamDateModal from './components/EditExamDateModal';
import SettingsModal from './components/SettingsModal';
import BackupModal from './components/BackupModal';

import { 
  getAppConfig, 
  saveAppConfig, 
  getAllRecords, 
  addRecord, 
  updateRecord, 
  deleteRecord 
} from './services/storage';

import { timerService } from './services/timerService';
import { AlertCircle, Clock, Check } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [config, setConfig] = useState(getAppConfig());
  const [records, setRecords] = useState(getAllRecords());
  const [timerState, setTimerState] = useState(timerService.getState());

  // 弹窗状态控制
  const [showEditDateModal, setShowEditDateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);

  // 心跳断点恢复对话框
  const [recoveryData, setRecoveryData] = useState(null);

  // 初始化主题与心跳检测
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', config.theme_mode || 'light');

    // 订阅计时服务
    const unsubscribe = timerService.subscribe((state) => {
      setTimerState(state);
    });

    // 启动时检测未结束的遗留计时心跳
    const hb = timerService.checkHeartbeatRecovery();
    if (hb) {
      setRecoveryData(hb);
    }

    return unsubscribe;
  }, []);

  // 刷新全量记录
  const refreshRecords = () => {
    setRecords(getAllRecords());
  };

  // 保存一条新打卡记录
  const handleSaveRecord = (recordData) => {
    addRecord(recordData);
    refreshRecords();
  };

  // 修改一条记录
  const handleUpdateRecord = (id, fields) => {
    updateRecord(id, fields);
    refreshRecords();
  };

  // 删除一条记录
  const handleDeleteRecord = (id) => {
    deleteRecord(id);
    refreshRecords();
  };

  // 保存考试目标日期
  const handleSaveExamDate = (newDate) => {
    const updated = saveAppConfig({ exam_target_date: newDate });
    setConfig(updated);
  };

  // 断点心跳：继续计时
  const handleConfirmRecovery = () => {
    if (recoveryData) {
      timerService.recoverFromHeartbeat(recoveryData);
      setRecoveryData(null);
      setActiveTab('timer');
    }
  };

  // 断点心跳：丢弃未完成的计时
  const handleDiscardRecovery = () => {
    timerService.reset();
    setRecoveryData(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      
      {/* 顶部简易 Logo/状态 Header */}
      <header style={{
        backgroundColor: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-color)',
        padding: '12px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 90
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, var(--primary-blue), #2563EB)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '0.85rem'
          }}>
            U
          </div>
          <span style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '0.5px' }}>Utopia</span>
        </div>

        <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)', fontWeight: 500 }}>
          考研专注 · 纯本地
        </div>
      </header>

      {/* 主视图区域 */}
      <main style={{ flex: 1 }}>
        {activeTab === 'home' && (
          <HomePage
            config={config}
            records={records}
            timerState={timerState}
            onStartTimer={() => setActiveTab('timer')}
            onJumpToTimer={() => setActiveTab('timer')}
            onOpenEditDate={() => setShowEditDateModal(true)}
          />
        )}

        {activeTab === 'timer' && (
          <TimerPage
            config={config}
            onSaveRecord={handleSaveRecord}
          />
        )}

        {activeTab === 'stats' && (
          <StatsPage
            config={config}
            records={records}
          />
        )}

        {activeTab === 'log' && (
          <LogPage
            config={config}
            records={records}
            onUpdateRecord={handleUpdateRecord}
            onDeleteRecord={handleDeleteRecord}
            onAddManualRecord={handleSaveRecord}
          />
        )}
      </main>

      {/* 底部导航 Tab */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        timerState={timerState}
        onOpenSettings={() => setShowSettingsModal(true)}
      />

      {/* 弹窗：修改目标考试日期 */}
      {showEditDateModal && (
        <EditExamDateModal
          currentDate={config.exam_target_date}
          onSave={handleSaveExamDate}
          onClose={() => setShowEditDateModal(false)}
        />
      )}

      {/* 弹窗：系统设置 */}
      {showSettingsModal && (
        <SettingsModal
          config={config}
          onUpdateConfig={setConfig}
          onOpenBackup={() => { setShowSettingsModal(false); setShowBackupModal(true); }}
          onRefreshData={refreshRecords}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {/* 弹窗：数据备份与恢复 */}
      {showBackupModal && (
        <BackupModal
          onRefreshData={refreshRecords}
          onClose={() => setShowBackupModal(false)}
        />
      )}

      {/* 弹窗：App被杀/异常关闭后的心跳恢复提示 (遵照规则2.3.4) */}
      {recoveryData && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-container" style={{ maxWidth: '380px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--primary-blue)' }}>
              <Clock size={24} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>检测到未结束的学习计时</h3>
            </div>
            
            <p style={{ fontSize: '0.88rem', color: 'var(--text-sub)', lineHeight: 1.5, marginBottom: '16px' }}>
              系统在上次应用关闭前发现一项未结束的 <strong>{recoveryData.subjectName}</strong> 计时记录（开始于 {new Date(recoveryData.startTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}）。是否继续该计时？
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleDiscardRecovery} className="btn-secondary" style={{ flex: 1, padding: '10px' }}>
                丢弃
              </button>
              <button onClick={handleConfirmRecovery} className="btn-primary" style={{ flex: 1, padding: '10px' }}>
                <Check size={16} />
                继续计时
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
