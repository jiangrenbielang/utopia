'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/study/page-shell';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { api, netdiskStreamUrl, type NetdiskEntry, type NetdiskStatus } from '@/lib/client-api';
import { saveCourse, useCourses } from '@/lib/study/store';

/**
 * 网盘：平台自带的百度网盘浏览与播放。
 *
 * 这里不出现任何「AList / OpenList 地址」——授权完成后，服务端持有 refresh_token，
 * 播放地址是本平台同源的 `/api/netdisk/stream?fsid=…`，由服务端向百度索取直链并带
 * `User-Agent: pan.baidu.com` 转发（百度对 >20MB 文件的要求），Range 请求原样透传，
 * 因此进度条拖动、跳到结尾都可用。
 */

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** 目录 → 面包屑（根目录用「我的网盘」表示） */
function crumbs(dir: string): { name: string; path: string }[] {
  const parts = dir.split('/').filter(Boolean);
  const items = [{ name: '我的网盘', path: '/' }];
  let acc = '';
  for (const part of parts) {
    acc += `/${part}`;
    items.push({ name: part, path: acc });
  }
  return items;
}

function watchHref(entry: NetdiskEntry): string {
  const sp = new URLSearchParams({
    source: 'course',
    url: netdiskStreamUrl(entry.fsId, entry.name),
    title: entry.name.replace(/\.[^.]+$/, ''),
  });
  return `/watch?${sp.toString()}`;
}

/** 文件名 → 章节标题：去扩展名、去【…】这类装饰后缀、压多余空格 */
function cleanLessonTitle(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/【[^】]*】/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 目录名 → 科目（课程库的固定科目集合，认不出就归「其他」） */
function guessSubject(title: string): string {
  if (/数学|高数|线代|概率/.test(title)) return '数学';
  if (/英语/.test(title)) return '英语';
  if (/数据结构/.test(title)) return '408数据结构';
  if (/计算机网络|计网/.test(title)) return '408计算机网络';
  if (/操作系统/.test(title)) return '408操作系统';
  if (/计算机组成/.test(title)) return '408计算机组成原理';
  return '其他';
}

export default function NetdiskPage() {
  const { toast } = useToast();
  const router = useRouter();
  const courses = useCourses();
  const [status, setStatus] = useState<NetdiskStatus | null>(null);
  const [dir, setDir] = useState('/考研2028');
  const [entries, setEntries] = useState<NetdiskEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [authUrl, setAuthUrl] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api.netdiskStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取绑定状态失败');
    }
  }, []);

  const loadDir = useCallback(async (path: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.netdiskList(path);
      setEntries(res.entries);
      setDir(res.dir);
    } catch (err) {
      setEntries([]);
      setError(err instanceof Error ? err.message : '读取目录失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (status?.configured) void loadDir(dir);
    // 只在「刚变成已绑定」时自动加载当前目录，避免每次 dir 变化重复触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.configured]);

  const startAuth = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.netdiskAuthUrl();
      setAuthUrl(res.url);
      window.open(res.url, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取授权链接失败');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.netdiskSubmitCode(code.trim(), status?.redirectUri);
      setCode('');
      setAuthUrl('');
      toast('百度网盘已绑定', 'success');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '授权失败');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await api.netdiskLogout();
      setStatus({ configured: false });
      setEntries([]);
      toast('已解绑百度网盘', 'info');
    } catch (err) {
      setError(err instanceof Error ? err.message : '解绑失败');
    } finally {
      setBusy(false);
    }
  };

  /**
   * 令牌失效时一键重新授权：先清掉本地令牌（百度续期会轮换 refresh_token，
   * 旧的即便还在文件里也已经不可用），再直接打开授权页。
   */
  const reauthorize = async () => {
    setBusy(true);
    setError('');
    try {
      await api.netdiskLogout();
      setStatus({ configured: false });
      setEntries([]);
      await startAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新授权失败');
      setBusy(false);
    }
  };

  const copy = async (entry: NetdiskEntry) => {
    const url = `${window.location.origin}${netdiskStreamUrl(entry.fsId, entry.name)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('播放地址已复制，可粘贴到课程章节', 'success');
    } catch {
      toast(url, 'info');
    }
  };

  /**
   * 「当前目录 → 课程」：服务端递归扫描并自然序排序，前端按返回顺序生成章节，
   * 每章绑定 `/api/netdisk/stream?fsid=…`，生成后直接跳到课程详情。
   */
  const importAsCourse = async () => {
    if (scanning) return;
    setScanning(true);
    setError('');
    try {
      const res = await api.netdiskScan(dir);
      if (res.count === 0) {
        toast('这个目录里没有可播放的视频（mp4 / m3u8 / ts）', 'info');
        return;
      }
      const baseTitle = dir.split('/').filter(Boolean).pop() || '百度网盘';
      const sameName = courses.filter((c) => c.title === baseTitle || c.title.startsWith(`${baseTitle} (`));
      const title = sameName.length > 0 ? `${baseTitle} (${sameName.length + 1})` : baseTitle;
      const course = saveCourse({
        title,
        subject: guessSubject(title),
        description: `由百度网盘目录 ${dir} 导入，共 ${res.count} 个视频${res.truncated ? '（已达上限，未全部导入）' : ''}`,
        lessons: res.videos.map((v) => ({
          title: cleanLessonTitle(v.name),
          url: netdiskStreamUrl(v.fsId, v.name),
        })),
      });
      toast(`已生成课程「${title}」，含 ${res.count} 个章节`, 'success');
      router.push(`/courses/detail?id=${course.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成课程失败');
    } finally {
      setScanning(false);
    }
  };

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-content">网盘</h1>
          <p className="text-sm text-muted mt-1.5">
            直接浏览并播放百度网盘里的课程视频，令牌只保存在本机服务端
          </p>
        </div>
        {status?.configured && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-primary btn-sm"
              onClick={() => void importAsCourse()}
              disabled={busy || scanning || loading}
              title="递归扫描当前目录下的视频，按文件名顺序生成课程章节"
            >
              <Icon name="book" className="w-3.5 h-3.5" />
              {scanning ? '扫描中…' : '把当前目录生成课程'}
            </button>
            <button className="btn-ghost btn-sm" onClick={() => void reauthorize()} disabled={busy}>
              重新授权
            </button>
            <button className="btn-ghost btn-sm" onClick={() => void logout()} disabled={busy}>
              解绑账号
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="card border-danger/40 p-3 mb-4 text-xs text-danger leading-relaxed">{error}</div>
      )}

      {!status ? (
        <p className="text-sm text-faint">正在读取绑定状态…</p>
      ) : !status.configured ? (
        <div className="card p-4">
          <h2 className="text-sm font-medium text-content">绑定百度网盘</h2>
          <p className="text-xs text-muted mt-2 leading-relaxed">
            点下面的按钮打开百度授权页（用你自己的账号登录并同意）。百度会显示一串
            <span className="text-content"> 授权码</span>，粘贴到下方即可完成绑定——之后平台的播放器就能直接播放网盘视频。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="btn-primary btn-sm" onClick={() => void startAuth()} disabled={busy}>
              <Icon name="play" className="w-3.5 h-3.5" />
              打开授权页
            </button>
            {authUrl && (
              <a className="text-xs text-accent break-all" href={authUrl} target="_blank" rel="noreferrer">
                页面没弹出？点这里
              </a>
            )}
          </div>
          <label className="block text-xs text-muted mt-4" htmlFor="code">
            授权码
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              id="code"
              className="flex-1 min-w-[220px] rounded-md border border-line bg-surface px-3 py-2 text-xs font-mono text-content outline-none focus:border-accent"
              placeholder="把百度页面显示的授权码粘到这里"
              value={code}
              onChange={(evt) => setCode(evt.target.value)}
              onKeyDown={(evt) => {
                if (evt.key === 'Enter') void submitCode();
              }}
            />
            <button className="btn-primary btn-sm" onClick={() => void submitCode()} disabled={busy || !code.trim()}>
              完成绑定
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-faint mb-3">
            {crumbs(dir).map((crumb, index) => (
              <span key={crumb.path} className="flex items-center gap-1.5">
                {index > 0 && <span className="text-line">/</span>}
                <button
                  className="hover:text-accent transition-colors"
                  onClick={() => void loadDir(crumb.path)}
                  disabled={loading}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
            {loading && <span className="ml-auto text-faint">加载中…</span>}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry) => (
              <div key={`${entry.fsId}-${entry.name}`} className="card flex items-center gap-3 p-3">
                <span className="shrink-0 text-faint">
                  <Icon name={entry.isDir ? 'book' : 'play'} className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-content truncate" title={entry.name}>
                    {entry.name}
                  </p>
                  <p className="text-[10px] text-faint">
                    {entry.isDir ? '目录' : formatSize(entry.size)}
                    {!entry.isDir && !entry.playable && ' · 浏览器不支持该格式'}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  {entry.isDir ? (
                    <button className="btn-ghost btn-sm" onClick={() => void loadDir(entry.path)}>
                      打开
                    </button>
                  ) : entry.playable ? (
                    <>
                      <Link href={watchHref(entry)} className="btn-primary btn-sm">
                        播放
                      </Link>
                      <button className="btn-ghost btn-sm" title="复制播放地址，可粘贴到课程章节" onClick={() => void copy(entry)}>
                        复制地址
                      </button>
                    </>
                  ) : (
                    <span className="text-[10px] text-faint">需转码</span>
                  )}
                </div>
              </div>
            ))}
            {!loading && entries.length === 0 && (
              <p className="text-xs text-faint">这个目录里没有文件。</p>
            )}
          </div>
        </>
      )}
    </PageShell>
  );
}