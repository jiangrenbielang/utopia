'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { useAppStore } from '@/lib/store';
import { syncSourceSubscription } from '@/lib/subscription-sync';
import { describeParseStats } from '@/lib/tvbox-parser';
import type { TvboxConfigExtras } from '@/lib/tvbox-config';

/**
 * TVBox「配置地址」面板。
 *
 * 一份 TVBox 接口 JSON 就是本客户端的数据入口：填入地址后交给既有的订阅同步链路
 * （`syncSourceSubscription`）拉取解析，可导入的站点与直播源会自动进入源列表；
 * 这里额外把**配置本身**的其余信息展示出来，让用户看懂「为什么有些站点不能用」——
 * 真实配置里 Spider 类站点往往占绝大多数（例如常见的 jar 全集），纯 JS 客户端
 * 一个都跑不了，不解释清楚会让人以为是解析失败。
 */

const KIND_LABELS: Record<string, string> = {
  json: 'JSON 采集站（可用）',
  xml: 'XML 接口（不支持）',
  spider: 'Spider 引擎（不支持）',
  external: '外链站点（不支持）',
  unknown: '无法识别',
};

const LIVE_KIND_LABELS: Record<string, string> = {
  playlist: '播放列表（可用）',
  'single-file': '单仓 JSON（不支持）',
  unknown: '无法识别',
};

/** 站点形态计数的展示顺序：可用的排前面 */
const KIND_ORDER = ['json', 'xml', 'spider', 'external', 'unknown'] as const;
const LIVE_KIND_ORDER = ['playlist', 'single-file', 'unknown'] as const;

export default function TvboxConfigPanel() {
  const tvboxByUrl = useAppStore((s) => s.tvboxByUrl);
  const tvboxActiveUrl = useAppStore((s) => s.tvboxActiveUrl);
  const setTvboxActiveUrl = useAppStore((s) => s.setTvboxActiveUrl);
  const removeTvboxExtras = useAppStore((s) => s.removeTvboxExtras);
  const subscriptions = useAppStore((s) => s.subscriptions);
  const { toast } = useToast();

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const entries = useMemo(() => Object.entries(tvboxByUrl ?? {}), [tvboxByUrl]);
  // 生效配置：优先用显式指定的，其次退回第一条（用户只填过一份时最自然）
  const activeUrl = tvboxActiveUrl && tvboxByUrl[tvboxActiveUrl] ? tvboxActiveUrl : entries[0]?.[0];
  const extras: TvboxConfigExtras | undefined = activeUrl ? tvboxByUrl[activeUrl] : undefined;
  const subscription = subscriptions.find((s) => s.url === activeUrl);
  /** 配置里声明的站点总数（可用 + 各类不可用） */
  const siteTotal = useMemo(
    () => Object.values(extras?.siteKinds ?? {}).reduce((sum, count) => sum + count, 0),
    [extras]
  );

  async function handleImport(): Promise<void> {
    const raw = input.trim();
    if (!raw) {
      toast('请先填写 TVBox 配置地址', 'warning');
      return;
    }
    setBusy(true);
    try {
      const result = await syncSourceSubscription(raw);
      const parts = [`点播源 ${result.vodCount}`, `直播源 ${result.liveCount}`];
      const detail = describeParseStats(result.stats, { includeSamples: true });
      if (detail) parts.push(detail);
      toast(`已导入「${result.name || 'TVBox 配置'}」：${parts.join(' · ')}`, 'success');
      setInput('');
    } catch (error) {
      toast(error instanceof Error ? error.message : '导入失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleRefresh(url: string): Promise<void> {
    setBusy(true);
    try {
      const result = await syncSourceSubscription(url);
      toast(`已刷新：点播源 ${result.vodCount} · 直播源 ${result.liveCount}`, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '刷新失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-content">TVBox 配置地址</h2>
        <p className="mt-1 text-xs text-muted leading-relaxed">
          填入一份 TVBox 接口（JSON）地址即可带出点播站点与直播源，支持带注释的配置；点播源与直播源会进入上方的数据源列表。
          <br />
          <span className="text-faint">
            注意：依赖 Spider 引擎的站点（jar / <code>csp_</code> / js / py）需要 Android TVBOX 客户端才能运行，本客户端会跳过并在下方说明数量。
          </span>
        </p>
      </header>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          className="input flex-1"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !busy) void handleImport();
          }}
          placeholder="https://example.com/tvbox.json"
          spellCheck={false}
          aria-label="TVBox 配置地址"
        />
        <button className="btn-primary shrink-0" onClick={() => void handleImport()} disabled={busy}>
          {busy ? '处理中…' : '导入 / 刷新'}
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="mt-3 text-xs text-faint">尚未导入任何 TVBox 配置。</p>
      ) : (
        <div className="mt-4 space-y-3">
          {/* 多份配置时允许切换生效项：壁纸、解析线路都以生效配置为准 */}
          {entries.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {entries.map(([url, item]) => (
                <button
                  key={url}
                  className={`chip ${url === activeUrl ? 'bg-accent text-on-accent' : 'bg-chip text-muted hover:bg-hover'}`}
                  onClick={() => setTvboxActiveUrl(url)}
                  title={url}
                >
                  {item.name || url}
                </button>
              ))}
            </div>
          )}

          {extras?.msg && (
            <p className="flex items-start gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-2.5 py-2 text-xs text-danger">
              <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>该配置声明已失效：{extras.msg}</span>
            </p>
          )}

          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-chip px-2.5 py-2">
              <dt className="text-faint">点播源</dt>
              <dd className="mt-0.5 text-content">
                {extras?.siteKinds?.json ?? 0} 可用 / {siteTotal} 站点
              </dd>
            </div>
            <div className="rounded-md bg-chip px-2.5 py-2">
              <dt className="text-faint">直播源</dt>
              <dd className="mt-0.5 text-content">{subscription?.lastCounts?.live ?? 0} 已导入</dd>
            </div>
          </dl>

          {/* 站点形态明细：把「跳过了什么、为什么」摊开讲清楚 */}
          <div className="space-y-1 text-xs">
            <p className="text-muted">站点构成</p>
            {KIND_ORDER.filter((kind) => (extras?.siteKinds?.[kind] ?? 0) > 0).map((kind) => (
              <p key={kind} className="flex items-center justify-between gap-2 text-faint">
                <span>{KIND_LABELS[kind]}</span>
                <span className="text-content">{extras?.siteKinds?.[kind]}</span>
              </p>
            ))}
            {LIVE_KIND_ORDER.filter((kind) => (extras?.liveKinds?.[kind] ?? 0) > 0).map((kind) => (
              <p key={kind} className="flex items-center justify-between gap-2 text-faint">
                <span>{LIVE_KIND_LABELS[kind]}</span>
                <span className="text-content">{extras?.liveKinds?.[kind]}</span>
              </p>
            ))}
          </div>

          {extras?.spider && (
            <p className="text-xs text-faint break-all">
              配置声明了 Spider 包 <code>{extras.spider}</code>：本客户端不运行 jar（Android dex），相关站点不可用。
            </p>
          )}

          {extras && extras.parses.length > 0 && (
            <div className="space-y-1 text-xs">
              <p className="text-muted">解析线路（{extras.parses.length}）</p>
              <ul className="flex flex-wrap gap-1.5">
                {extras.parses.slice(0, 12).map((parse, index) => (
                  <li
                    key={`${parse.name}-${index}`}
                    className="chip bg-chip text-muted"
                    title={parse.builtin ? 'TVBOX 客户端内置的聚合解析，本站无法调用' : parse.url}
                  >
                    {parse.name}
                    {parse.builtin && <span className="text-warning">·内置</span>}
                    {parse.type === 4 && <span className="text-faint">·超级解析</span>}
                  </li>
                ))}
              </ul>
              {extras.platforms.length > 0 && (
                <p className="text-faint">
                  该配置的解析线路白名单：{extras.platforms.join('、')}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button className="btn-ghost btn-sm" onClick={() => activeUrl && void handleRefresh(activeUrl)} disabled={busy}>
              <Icon name="refresh" className="h-3.5 w-3.5" />
              刷新
            </button>
            <button
              className="btn-ghost btn-sm"
              onClick={() => {
                if (!input && activeUrl) setInput(activeUrl);
              }}
              disabled={!activeUrl}
            >
              填入地址
            </button>
            <button
              className="btn-ghost btn-sm text-danger hover:text-danger"
              onClick={() => activeUrl && removeTvboxExtras(activeUrl)}
              disabled={!activeUrl}
              title="仅移除本地缓存的配置信息；如需一并删除点播源，请在上方数据源列表里删除该订阅"
            >
              <Icon name="trash" className="h-3.5 w-3.5" />
              仅清除缓存
            </button>
          </div>
        </div>
      )}
    </section>
  );
}