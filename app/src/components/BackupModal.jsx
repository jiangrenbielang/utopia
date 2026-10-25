import React, { useState } from 'react';
import { X, Download, Upload, ShieldCheck, AlertCircle } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { exportBackupJSON, importBackupJSON } from '../services/storage';

export default function BackupModal({ onRefreshData, onClose }) {
  const [importMode, setImportMode] = useState('merge'); // merge or overwrite
  const [statusMsg, setStatusMsg] = useState(null);

  // 导出 JSON 文件
  const handleExport = async () => {
    try {
      const jsonStr = exportBackupJSON();
      const nowStr = new Date().toISOString().slice(0, 10);
      const fileName = `Utopia_数据备份_${nowStr}.json`;

      // 原生 App (Capacitor WebView)：a.download 无法触发系统下载，
      // 改为「写入应用文档目录 + 唤起系统分享面板」，由用户选择保存位置。
      if (Capacitor.isNativePlatform()) {
        const result = await Filesystem.writeFile({
          path: fileName,
          data: jsonStr,
          directory: Directory.Data,
          encoding: Encoding.UTF8
        });
        try {
          await Share.share({
            title: 'Utopia 数据备份',
            text: 'Utopia 学习数据备份，请选择「保存到文件」或发送到微信/网盘。',
            files: [result.uri],
            dialogTitle: '保存或发送备份文件'
          });
          setStatusMsg({ type: 'success', text: `备份已生成：${fileName}。请在面板中选择「保存到文件」存放，或发送给微信/网盘。` });
        } catch (shareErr) {
          // 用户取消了分享面板，文件仍已写入应用文档目录
          setStatusMsg({ type: 'success', text: `备份文件已生成：${fileName}（未弹出分享面板，文件已保存在应用文档目录）。` });
        }
        return;
      }

      // Web 浏览器：保留原有下载逻辑
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatusMsg({ type: 'success', text: '备份文件导出成功！已开始下载。' });
    } catch (e) {
      setStatusMsg({ type: 'error', text: '导出失败：' + e.message });
    }
  };

  // 从文件选择器导入
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target.result;
      const res = importBackupJSON(content, importMode);
      if (res.success) {
        setStatusMsg({ type: 'success', text: `导入成功 (${res.mode})！共导入 ${res.count} 条学习记录。` });
        onRefreshData();
      } else {
        setStatusMsg({ type: 'error', text: res.message });
      }
    };
    reader.onerror = () => {
      setStatusMsg({ type: 'error', text: '无法读取所选 JSON 文件！' });
    };
    reader.readAsText(file);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>数据备份与恢复</h3>
          <button onClick={onClose} style={{ background: 'transparent', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        {statusMsg && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.85rem',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: statusMsg.type === 'success' ? '#ECFDF5' : '#FEF2F2',
            color: statusMsg.type === 'success' ? '#059669' : '#EF4444',
            border: `1px solid ${statusMsg.type === 'success' ? '#A7F3D0' : '#FECACA'}`
          }}>
            {statusMsg.type === 'success' ? <ShieldCheck size={18} /> : <AlertCircle size={18} />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* 导出卡片 */}
        <div className="card" style={{ marginBottom: '16px', padding: '16px', background: 'var(--bg-main)' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '6px' }}>
            📤 导出备份文件 (JSON)
          </h4>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-sub)', marginBottom: '12px' }}>
            将你所有的考研倒计时、学习耗时日志与复盘导出为标准 JSON 文件，离线妥善保存。
          </p>
          <button onClick={handleExport} className="btn-primary" style={{ width: '100%', padding: '10px' }}>
            <Download size={18} />
            一键导出备份
          </button>
        </div>

        {/* 导入卡片 */}
        <div className="card" style={{ padding: '16px', background: 'var(--bg-main)' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '6px' }}>
            📥 从备份恢复 (JSON)
          </h4>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-sub)', display: 'block', marginBottom: '6px' }}>
              导入模式：
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="importMode"
                  value="merge"
                  checked={importMode === 'merge'}
                  onChange={() => setImportMode('merge')}
                />
                合并模式 (追加新记录)
              </label>
              <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="importMode"
                  value="overwrite"
                  checked={importMode === 'overwrite'}
                  onChange={() => setImportMode('overwrite')}
                />
                覆盖模式 (清空后导入)
              </label>
            </div>
          </div>

          <label className="btn-secondary" style={{ width: '100%', padding: '10px', cursor: 'pointer', textAlign: 'center', display: 'flex', justifyContent: 'center' }}>
            <Upload size={18} />
            <span>选择 JSON 备份文件并导入</span>
            <input type="file" accept=".json" onChange={handleFileChange} style={{ display: 'none' }} />
          </label>
        </div>

        <button onClick={onClose} className="btn-outline" style={{ width: '100%', padding: '12px', marginTop: '16px' }}>
          关闭
        </button>
      </div>
    </div>
  );
}
