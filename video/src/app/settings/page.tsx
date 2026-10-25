'use client';

import { useEffect, useRef, useState } from 'react';
import { PageShell } from '@/components/study/page-shell';
import { SourceManagerDrawer } from '@/components/source-manager';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { useAuth } from '@/components/auth';
import {
  buildBackup,
  clearStudyRecords,
  importBackup,
  updateStudyConfig,
  useCourses,
  useStudyConfig,
  useStudyRecords,
} from '@/lib/study/store';
import { dateKey, formatDateShort } from '@/lib/study/date';
import { formatMinutes } from '@/lib/study/format';
import { cn } from '@/lib/utils';

/** 学习设置：考试日期、每日目标、备份恢复、数据清理、资源数据源 */
export default function SettingsPage() {
  const config = useStudyConfig();
  const records = useStudyRecords();
  const courses = useCourses();
  const { version } = useAuth();
  const { toast } = useToast();

  const [examDate, setExamDate] = useState(config.examTargetDate);
  const [dailyTarget, setDailyTarget] = useState(config.dailyTargetMin);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [pendingImport, setPendingImport] = useState<{ name: string; content: string } | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearText, setClearText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setExamDate(config.examTargetDate);
    setDailyTarget(config.dailyTargetMin);
  }, [config.examTargetDate, config.dailyTargetMin]);

  const saveConfig = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
      toast('请选择有效的考试日期', 'error');
      return;
    }
    updateStudyConfig({ examTargetDate: examDate, dailyTargetMin: Math.max(0, Math.round(dailyTarget) || 0) });
    toast('设置已保存', 'success');
  };

  const exportBackup = () => {
    const payload = buildBackup();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Utopia-备份-${dateKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(`已导出 ${payload.records.length} 条记录与 ${payload.courses?.length ?? 0} 门课程`, 'success');
  };

  const readImportFile = async (file: File) => {
    try {
      const content = await file.text();
      if (importMode === 'overwrite') {
        setPendingImport({ name: file.name, content });
      } else {
        runImport(file.name, content, 'merge');
      }
    } catch {
      toast('读取文件失败，请重试', 'error');
    }
  };

  const runImport = (name: string, content: string, mode: 'merge' | 'overwrite') => {
    try {
      const result = importBackup(content, mode);
      toast(
        `${mode === 'overwrite' ? '已覆盖导入' : '已合并导入'}：${result.records} 条记录${
          result.courses > 0 ? `、${result.courses} 门课程` : ''
        }`,
        'success'
      );
    } catch (err) {
      toast(`导入失败：${err instanceof Error ? err.message : '文件格式不正确'}`, 'error');
    } finally {
      setPendingImport(null);
      if (fileRef.current) fileRef.current.value = '';
      void name;
    }
  };

  const totalMinutes = records.reduce((sum, r) => sum + r.durationMin, 0);
  const estimatedBytes = JSON.stringify(records).length + JSON.stringify(courses).length;

  return (
    <PageShell>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-content">学习设置</h1>
        <p className="text-sm text-muted mt-1.5">考试日期、每日目标、数据备份与资源数据源都在这里管理。</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 目标设置 */}
        <section className="card p-5">
          <h2 className="text-sm font-medium text-content flex items-center gap-2">
            <Icon name="flag" className="w-4 h-4 text-accent" />
            考试目标
          </h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs text-muted mb-1.5" htmlFor="settings-exam-date">
                考研目标日期
              </label>
              <input
                id="settings-exam-date"
                type="date"
                className="input w-full"
                value={examDate}
                min="2000-01-01"
                max="2100-12-31"
                onChange={(e) => setExamDate(e.target.value)}
              />
              <p className="text-[11px] text-faint mt-1.5">首页倒计时按该日期实时计算，过期后显示「已考完」。</p>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5" htmlFor="settings-daily-target">
                每日学习目标（分钟，0 表示不设目标）
              </label>
              <input
                id="settings-daily-target"
                type="number"
                min={0}
                max={1440}
                step={30}
                className="input w-full"
                value={dailyTarget}
                onChange={(e) => setDailyTarget(Number(e.target.value))}
              />
            </div>
            <button className="btn-primary btn-sm" onClick={saveConfig}>
              保存目标设置
            </button>
          </div>
        </section>

        {/* 数据概览 */}
        <section className="card p-5">
          <h2 className="text-sm font-medium text-content flex items-center gap-2">
            <Icon name="chart" className="w-4 h-4 text-accent" />
            数据概览
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-chip p-3">
              <dt className="text-[11px] text-faint">学习记录</dt>
              <dd className="mt-1 text-content font-semibold">{records.length} 条</dd>
            </div>
            <div className="rounded-lg bg-chip p-3">
              <dt className="text-[11px] text-faint">累计时长</dt>
              <dd className="mt-1 text-content font-semibold">{formatMinutes(totalMinutes)}</dd>
            </div>
            <div className="rounded-lg bg-chip p-3">
              <dt className="text-[11px] text-faint">课程数</dt>
              <dd className="mt-1 text-content font-semibold">{courses.length} 门</dd>
            </div>
            <div className="rounded-lg bg-chip p-3">
              <dt className="text-[11px] text-faint">本地占用</dt>
              <dd className="mt-1 text-content font-semibold">约 {Math.max(1, Math.round(estimatedBytes / 1024))} KB</dd>
            </div>
          </dl>
          <p className="text-[11px] text-faint mt-3 leading-relaxed">
            所有学习数据保存在当前浏览器的 localStorage 中，不上传服务器；清除浏览器数据会丢失记录，请定期导出备份。
          </p>
        </section>

        {/* 备份恢复 */}
        <section className="card p-5">
          <h2 className="text-sm font-medium text-content flex items-center gap-2">
            <Icon name="download" className="w-4 h-4 text-accent" />
            备份与恢复
          </h2>
          <p className="text-xs text-muted mt-2 leading-relaxed">
            导出为「Utopia」JSON 备份（含学习记录、课程库与考试日期配置），换设备或清缓存前建议先导出。
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <button className="btn-primary btn-sm" onClick={exportBackup}>
              <Icon name="download" className="w-3.5 h-3.5" />
              导出 JSON
            </button>
            <button className="btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
              导入 JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void readImportFile(file);
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="import-mode"
                className="accent-[#00b8e6]"
                checked={importMode === 'merge'}
                onChange={() => setImportMode('merge')}
              />
              合并导入（按记录 ID 去重）
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="import-mode"
                className="accent-[#d9534f]"
                checked={importMode === 'overwrite'}
                onChange={() => setImportMode('overwrite')}
              />
              覆盖导入（先清空记录）
            </label>
          </div>
        </section>

        {/* 资源数据源 */}
        <section className="card p-5">
          <h2 className="text-sm font-medium text-content flex items-center gap-2">
            <Icon name="link" className="w-4 h-4 text-accent" />
            资源数据源
          </h2>
          <p className="text-xs text-muted mt-2 leading-relaxed">
            「资源库」通过 Apple CMS 点播源聚合搜索网课视频；点播源、直播源、播放偏好与配置导入导出都沿用 LibreTV
            的设置面板。
          </p>
          <button className="btn-ghost btn-sm mt-4" onClick={() => setSourceOpen(true)}>
            <Icon name="gear" className="w-3.5 h-3.5" />
            打开数据源设置
          </button>
        </section>

        {/* 清空数据 */}
        <section className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-medium text-content flex items-center gap-2">
            <Icon name="trash" className="w-4 h-4 text-danger" />
            清空学习数据
          </h2>
          <p className="text-xs text-muted mt-2">
            清空全部学习记录（保留考试日期、每日目标与课程库）。此操作不可恢复，建议先导出备份。
          </p>
          <button className="btn-ghost btn-sm !text-danger mt-4" onClick={() => setClearOpen(true)}>
            清空全部学习记录
          </button>
        </section>

        <section className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-medium text-content">关于 Utopia</h2>
          <p className="text-xs text-muted mt-2 leading-relaxed">
            Utopia v1.0 · 基于 LibreTV v{version || '2.x'} 构建 · AGPL-3.0 License。
            纯本地工具，无账号、无云同步；网课资源来自你自行配置的第三方点播源。
          </p>
          <p className="text-[11px] text-faint mt-1">当前日期：{formatDateShort(new Date())}</p>
        </section>
      </div>

      <SourceManagerDrawer open={sourceOpen} onClose={() => setSourceOpen(false)} />

      {/* 覆盖导入确认 */}
      <ConfirmDialog
        open={Boolean(pendingImport)}
        danger
        title="覆盖导入会先清空现有记录"
        message={
          pendingImport
            ? `将使用「${pendingImport.name}」覆盖当前 ${records.length} 条学习记录（考试日期与目标会按备份更新）。确定继续吗？`
            : ''
        }
        confirmLabel="覆盖导入"
        onCancel={() => {
          setPendingImport(null);
          if (fileRef.current) fileRef.current.value = '';
        }}
        onConfirm={() => {
          if (pendingImport) runImport(pendingImport.name, pendingImport.content, 'overwrite');
        }}
      />

      {/* 清空二次确认：输入「清空」 */}
      {clearOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setClearOpen(false);
              setClearText('');
            }
          }}
        >
          <div className="bg-surface-raised rounded-xl w-full max-w-sm p-5 shadow-2xl animate-slide-up" role="alertdialog" aria-modal>
            <h2 className="text-base font-semibold text-content mb-2">清空学习数据</h2>
            <p className="text-sm text-muted leading-relaxed">
              这会删除全部 {records.length} 条学习记录，且无法恢复。请输入「清空」确认操作。
            </p>
            <input
              className="input w-full mt-3"
              value={clearText}
              onChange={(e) => setClearText(e.target.value)}
              placeholder="清空"
              aria-label="输入清空以确认"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="btn-ghost text-sm"
                onClick={() => {
                  setClearOpen(false);
                  setClearText('');
                }}
              >
                取消
              </button>
              <button
                className={cn(
                  'btn text-sm text-white',
                  clearText === '清空' ? 'bg-danger hover:bg-danger-hover' : 'bg-danger/40 cursor-not-allowed'
                )}
                disabled={clearText !== '清空'}
                onClick={() => {
                  clearStudyRecords();
                  setClearOpen(false);
                  setClearText('');
                  toast('学习记录已清空', 'info');
                }}
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
