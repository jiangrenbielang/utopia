'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/icon';
import { formatClock } from '@/lib/study/format';
import { addStudyRecord, getRecords } from '@/lib/study/store';
import { SUBJECTS } from '@/lib/study/types';

const DEFAULT_BASE = 'http://127.0.0.1:8765';
const KEY_BASE = 'utopia:companion:base';
const KEY_TOKEN = 'utopia:companion:token';

interface Health {
  ok: boolean;
  version?: string;
  mpv?: boolean;
  sessdata?: boolean;
  tokenRequired?: boolean;
}

interface CompanionRecord {
  startTimestamp: number;
  endTimestamp: number;
  durationMin: number;
  subjectName: string;
  studyContent: string;
  recordDate: string;
  courseId?: string;
  lessonId?: string;
}

interface CompanionSession {
  id: string;
  bvid?: string;
  page?: number;
  title?: string;
  subject?: string;
  quality?: string;
  duration_sec?: number;
  watched_sec?: number;
  status: string;
  record?: CompanionRecord | null;
  error?: string;
}

interface StateResponse {
  ok: boolean;
  current?: CompanionSession | null;
  pending?: CompanionSession[];
}

const STATUS_LABELS: Record<string, string> = {
  starting: '正在启动 mpv',
  playing: '播放中',
  paused: '已暂停',
  stopping: '正在停止',
  completed: '已结束',
  too_short: '不足 1 分钟',
  interrupted: '上次异常中断',
  error: '播放错误',
};

function normalizeBase(value: string): string {
  return (value.trim() || DEFAULT_BASE).replace(/\/+$/, '');
}

export function LocalPlayer() {
  const params = useSearchParams();
  const bvid = params.get('bvid') || '';
  const initialPage = params.get('p') || '1';
  const initialTitle = params.get('title') || '';
  const initialSubject = params.get('subject') || SUBJECTS[0];
  const courseId = params.get('courseId') || '';
  const lessonId = params.get('lessonId') || '';
  const courseTitle = params.get('courseTitle') || '';
  const initialUrl = params.get('url') || (bvid ? `https://www.bilibili.com/video/${bvid}?p=${initialPage}` : '');

  const [base, setBase] = useState(DEFAULT_BASE);
  const [token, setToken] = useState('');
  const [input, setInput] = useState(initialUrl);
  const [pageNo, setPageNo] = useState(initialPage);
  const [title, setTitle] = useState(initialTitle);
  const [subject, setSubject] = useState(initialSubject);
  const [health, setHealth] = useState<Health | null>(null);
  const [current, setCurrent] = useState<CompanionSession | null>(null);
  const [pending, setPending] = useState<CompanionSession[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const syncingRef = useRef(false);

  useEffect(() => {
    try {
      setBase(localStorage.getItem(KEY_BASE) || DEFAULT_BASE);
      setToken(localStorage.getItem(KEY_TOKEN) || '');
    } catch {
      /* 隐私模式 */
    }
  }, []);

  const remember = useCallback((nextBase: string, nextToken: string) => {
    try {
      localStorage.setItem(KEY_BASE, normalizeBase(nextBase));
      localStorage.setItem(KEY_TOKEN, nextToken.trim());
    } catch {
      /* 忽略 */
    }
  }, []);

  const call = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Record<string, unknown>> => {
      if (!token.trim()) throw new Error('请先填写配对令牌（见伴生程序终端或 token.txt）');
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), path === '/api/play' ? 30_000 : 8_000);
      try {
        const response = await fetch(`${normalizeBase(base)}${path}`, {
          ...init,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'X-Utopia-Token': token.trim(),
            ...(init.headers || {}),
          },
        });
        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok || data.ok === false) {
          throw new Error(String(data.message || `伴生程序返回 HTTP ${response.status}`));
        }
        return data;
      } finally {
        window.clearTimeout(timer);
      }
    },
    [base, token]
  );

  const check = useCallback(async () => {
    setBusy(true);
    setError('');
    setMessage('');
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(`${normalizeBase(base)}/api/health`, { signal: controller.signal });
      const data = (await response.json()) as Health;
      if (!response.ok || !data.ok) throw new Error('伴生程序未返回健康状态');
      setHealth(data);
      remember(base, token);
      setMessage(
        data.mpv
          ? '已连接伴生程序，可以开始播放'
          : '已连接，但没有找到 mpv.exe；请把 mpv.exe 放到 companion/mpv/ 或设置 MPV_PATH'
      );
      if (token.trim()) {
        const state = (await call('/api/state')) as unknown as StateResponse;
        setCurrent(state.current ?? null);
        setPending(state.pending ?? []);
      }
    } catch (err) {
      setHealth(null);
      setError(`无法连接伴生程序：${err instanceof Error ? err.message : String(err)}。请先运行 companion\\start-utopia-companion.bat`);
    } finally {
      window.clearTimeout(timer);
      setBusy(false);
    }
  }, [base, token, call, remember]);

  const syncPending = useCallback(
    async (items: CompanionSession[]) => {
      if (!items.length || syncingRef.current) return;
      syncingRef.current = true;
      let added = 0;
      try {
        for (const item of items) {
          if (item.record) {
            const exists = getRecords().some(
              (record) =>
                record.startTimestamp === item.record!.startTimestamp &&
                record.endTimestamp === item.record!.endTimestamp &&
                record.studyContent === item.record!.studyContent
            );
            if (!exists) {
              addStudyRecord(item.record);
              added += 1;
            }
          }
          await call('/api/ack', { method: 'POST', body: JSON.stringify({ ids: [item.id] }) });
        }
        if (added > 0) {
          setMessage(`已同步 ${added} 条本地 mpv 学习记录到 Utopia`);
        }
        setPending((prev) => prev.filter((item) => !items.some((done) => done.id === item.id)));
      } catch (err) {
        setError(`记录同步失败：${err instanceof Error ? err.message : String(err)}`);
      } finally {
        syncingRef.current = false;
      }
    },
    [call]
  );

  useEffect(() => {
    if (!health?.ok || !token.trim()) return;
    let active = true;
    const tick = async () => {
      try {
        const data = (await call('/api/state')) as unknown as StateResponse;
        if (!active) return;
        setCurrent(data.current ?? null);
        setPending(data.pending ?? []);
        if (data.pending?.length) await syncPending(data.pending);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 2_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [health?.ok, token, call, syncPending]);

  const start = async () => {
    if (!input.trim()) {
      setError('请填写 B 站视频链接或 BV 号');
      return;
    }
    if (!health?.ok) {
      setError('请先检查并连接本地伴生程序');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = (await call('/api/play', {
        method: 'POST',
        body: JSON.stringify({
          url: input.trim(),
          page: Number(pageNo) || 1,
          title: title.trim(),
          subject,
          courseId,
          lessonId,
        }),
      })) as { session?: CompanionSession };
      setCurrent(data.session ?? null);
      setMessage('已启动 mpv，请在弹出的播放器窗口观看；关闭 mpv 后会同步学习记录');
      remember(base, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    setError('');
    try {
      const data = (await call('/api/stop', { method: 'POST', body: '{}' })) as { current?: CompanionSession };
      setCurrent(data.current ?? null);
      setMessage('已请求停止 mpv，学习记录会在同步后写入');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const status = current ? STATUS_LABELS[current.status] || current.status : '';

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur border-b border-line">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href={courseId ? `/courses/${courseId}` : '/courses'} className="btn-ghost btn-sm">
            <Icon name="play" className="w-4 h-4 rotate-180" />
            课程库
          </Link>
          <div className="min-w-0">
            <h1 className="text-sm font-medium text-content">本地高清播放</h1>
            <p className="text-xs text-faint truncate">B 站 API + mpv + mpv IPC 计时</p>
          </div>
          <Link href="/" className="btn-ghost btn-sm ml-auto">
            首页
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="card p-4 border-accent/30 bg-accent/5">
          <div className="flex items-start gap-3">
            <Icon name="alert" className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div className="text-sm text-muted leading-relaxed">
              <p className="text-content font-medium mb-1">这是可选的 Windows 本地增强（伴生程序不随仓库分发）</p>
              <p>
                如果你本地保留了 <code className="text-accent">companion</code> 文件夹，先运行{' '}
                <code className="text-accent">companion\start-utopia-companion.bat</code>，并安装 mpv。
                它使用你自己的 B 站登录态在本机解析高清流；SESSDATA 只保存在本地 <code>companion/.env</code>，不会上传。
              </p>
            </div>
          </div>
        </div>

        <section className="card p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-base font-semibold text-content">1. 连接伴生程序</h2>
            <span className={`text-xs ${health?.ok ? 'text-success' : 'text-faint'}`}>
              {health?.ok ? `已连接${health.version ? ` · v${health.version}` : ''}` : '未连接'}
            </span>
          </div>
          <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3">
            <label className="block">
              <span className="text-xs text-muted mb-1 block">地址</span>
              <input className="input w-full" value={base} onChange={(event) => setBase(event.target.value)} placeholder={DEFAULT_BASE} />
            </label>
            <label className="block">
              <span className="text-xs text-muted mb-1 block">配对令牌</span>
              <input
                className="input w-full"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="见伴生程序终端 / token.txt"
              />
            </label>
            <button className="btn-primary self-end" onClick={() => void check()} disabled={busy}>
              <Icon name="refresh" className="w-4 h-4" />
              检查连接
            </button>
          </div>
          {health?.ok && !health.mpv && (
            <p className="text-xs text-danger mt-3">已连接，但没有找到 mpv.exe；请把 mpv.exe 放到 companion/mpv/ 或设置 MPV_PATH。</p>
          )}
          <p className="text-xs text-faint mt-3">
            默认地址 <code>http://127.0.0.1:8765</code>。手机不能直接连接 Windows 的 127.0.0.1；本页请在运行伴生程序的电脑浏览器中使用。
          </p>
        </section>

        <section className="card p-5">
          <h2 className="text-base font-semibold text-content mb-4">2. 开始播放</h2>
          <label className="block mb-3">
            <span className="text-xs text-muted mb-1 block">B 站视频链接 / BV 号</span>
            <input
              className="input w-full"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="https://www.bilibili.com/video/BV...?p=1"
            />
          </label>
          <div className="grid sm:grid-cols-[100px_1fr_160px] gap-3 mb-3">
            <label className="block">
              <span className="text-xs text-muted mb-1 block">P 数</span>
              <input className="input w-full" type="number" min={1} value={pageNo} onChange={(event) => setPageNo(event.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs text-muted mb-1 block">学习内容（可留空）</span>
              <input
                className="input w-full"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="留空则使用 B 站标题"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted mb-1 block">科目</span>
              <select className="input w-full" value={subject} onChange={(event) => setSubject(event.target.value)}>
                {SUBJECTS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {(courseId || lessonId) && (
            <p className="text-xs text-faint mb-3">
              关联课程：{courseTitle || courseId}
              {lessonId ? ` · 章节 ${lessonId}` : ''}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" onClick={() => void start()} disabled={busy || !health?.ok}>
              <Icon name="play" className="w-4 h-4" />
              开始本地播放
            </button>
            <button className="btn-ghost" onClick={() => void stop()} disabled={busy || !current}>
              <Icon name="close" className="w-4 h-4" />
              停止
            </button>
            <span className="text-xs text-faint">会启动一个独立的 mpv 窗口；关闭 mpv 后自动结算。</span>
          </div>
        </section>

        {current && (
          <section className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-faint mb-1">{current.bvid || 'B 站视频'} · P{current.page || 1}</p>
                <h2 className="text-base font-semibold text-content truncate">{current.title || '本地播放会话'}</h2>
                <p className="text-sm text-muted mt-1">
                  {status}
                  {current.quality ? ` · ${current.quality}` : ''}
                  {current.error ? ` · ${current.error}` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono text-2xl text-accent tabular-nums">{formatClock(current.watched_sec || 0)}</p>
                <p className="text-xs text-faint">实际播放</p>
              </div>
            </div>
            {current.record && (
              <p className="text-xs text-success mt-3">
                本次将记录 {current.record.durationMin} 分钟 · {current.record.recordDate}
              </p>
            )}
          </section>
        )}

        {pending.length > 0 && (
          <div className="card p-4 border-accent/40 bg-accent/5">
            <p className="text-sm text-content">
              有 {pending.length} 条本地 mpv 学习记录待同步，页面会自动写入 Utopia。
            </p>
          </div>
        )}

        {message && <p className="text-sm text-success">{message}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}

        <p className="text-xs text-faint leading-relaxed">
          SESSDATA 是本机敏感登录凭证。不要把 <code>companion/.env</code> 或 <code>token.txt</code> 提交到 Git；
          不要把这个页面暴露到公网。B 站非公开接口可能随时变化，4K/HDR/杜比仍取决于账号权益。
        </p>
      </main>
    </div>
  );
}
