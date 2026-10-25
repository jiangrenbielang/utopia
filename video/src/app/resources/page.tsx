'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PageShell } from '@/components/study/page-shell';
import { DetailModal } from '@/components/detail-modal';
import { AggregatedCard, aggregateResults } from '@/components/video-card';
import { useAppStore, resolveSource, isInDisabledSubscription, isSourceDisabled } from '@/lib/store';
import { api } from '@/lib/client-api';
import type { SearchResultItem, SourceSearchOutcome } from '@/lib/types';
import { SearchHistoryDropdown, useSearchHistory } from '@/components/search-history';
import { cn, formatDisableTtl, validateSourceUrl } from '@/lib/utils';
import { useToast } from '@/components/toast';
import { EmptyState } from '@/components/states';
import { Icon } from '@/components/icon';

/**
 * 资源库：沿用 LibreTV 的多源聚合搜索能力，用来检索网课 / 课程视频。
 * 搜索状态由 URL ?s= 驱动（可后退、可分享），结果按来源聚合。
 */
const RESULT_PAGE_SIZE = 60;

export default function ResourcesPage() {
  return (
    <Suspense>
      <ResourcesContent />
    </Suspense>
  );
}

function ResourcesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const urlQuery = searchParams.get('s') || '';
  const customAPIs = useAppStore((s) => s.customAPIs);
  const envSources = useAppStore((s) => s.envSources);
  const selectedKeys = useAppStore((s) => s.selectedKeys);
  const yellowFilter = useAppStore((s) => s.yellowFilter);
  const sourceHealth = useAppStore((s) => s.sourceHealth);
  const subscriptions = useAppStore((s) => s.subscriptions);
  const [input, setInput] = useState(urlQuery);
  const [detailItem, setDetailItem] = useState<SearchResultItem | null>(null);
  const [streamedOutcomes, setStreamedOutcomes] = useState<SourceSearchOutcome[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (urlQuery) setInput(urlQuery);
  }, [urlQuery]);

  const sourceName = (key: string) =>
    customAPIs.find((a) => a.key === key)?.name ?? envSources.find((a) => a.key === key)?.name ?? key;

  const selectedSources = useMemo(() => {
    const seen = new Set<string>();
    return selectedKeys
      .map((key) => resolveSource({ customAPIs, envSources }, key))
      .filter((s): s is NonNullable<typeof s> => {
        if (!s || !validateSourceUrl(s.url) || seen.has(s.key)) return false;
        seen.add(s.key);
        return true;
      })
      .filter((s) => !isSourceDisabled({ sourceHealth }, s.key))
      .filter((s) => !isInDisabledSubscription({ subscriptions }, s.key));
  }, [customAPIs, envSources, selectedKeys, sourceHealth, subscriptions]);

  const disabledSources = useMemo(
    () => selectedKeys.filter((key) => isSourceDisabled({ sourceHealth }, key)),
    [selectedKeys, sourceHealth]
  );
  const offSubscriptionSources = useMemo(
    () =>
      selectedKeys.filter(
        (key) => !isSourceDisabled({ sourceHealth }, key) && isInDisabledSubscription({ subscriptions }, key)
      ),
    [selectedKeys, sourceHealth, subscriptions]
  );

  const searchQuery = useQuery({
    queryKey: ['search', urlQuery, selectedKeys, yellowFilter],
    queryFn: ({ signal }) => {
      setStreamedOutcomes([]);
      return api.search(urlQuery.slice(0, 100), selectedSources, yellowFilter, {
        signal,
        onSource: (outcome) => {
          setStreamedOutcomes((prev) => [...prev, outcome]);
          for (const ev of useAppStore.getState().recordSourceHealth([outcome])) {
            toast(
              ev.permanent
                ? `「${sourceName(ev.key)}」多次失败，已停止参与搜索，可在设置中恢复`
                : `「${sourceName(ev.key)}」连续超时/失败，已停用 ${formatDisableTtl(ev.ttlMs ?? 0)}`,
              'warning'
            );
          }
        },
      });
    },
    enabled: Boolean(urlQuery) && selectedSources.length > 0,
    staleTime: 300_000,
  });

  const searchHistory = useSearchHistory(input);
  const [recentQueries] = useState<string[]>(['考研数学', '408 数据结构', '考研英语阅读', '计算机网络']);

  const runSearch = (q: string) => {
    const query = q.trim().slice(0, 100);
    if (!query) {
      toast('请输入搜索内容', 'info');
      inputRef.current?.focus();
      return;
    }
    if (selectedSources.length === 0) {
      toast('请先在设置中添加并勾选点播源', 'warning');
      return;
    }
    router.push(`/resources?s=${encodeURIComponent(query)}`, { scroll: false });
    searchHistory.record(query);
  };

  const pickHistory = (text: string) => {
    setInput(text);
    searchHistory.close();
    runSearch(text);
  };

  const isSearching = Boolean(urlQuery) && searchQuery.isFetching && !searchQuery.data;
  const streamedList = useMemo(() => streamedOutcomes.flatMap((o) => o.list), [streamedOutcomes]);
  const list = useMemo(
    () => searchQuery.data?.list ?? (isSearching ? streamedList : []),
    [searchQuery.data, isSearching, streamedList]
  );
  const failures =
    searchQuery.data?.failures ??
    streamedOutcomes
      .filter((o) => !o.ok)
      .map((o) => ({ sourceKey: o.sourceKey, error: o.error || '请求失败', timedOut: o.timedOut }));
  const groups = useMemo(() => aggregateResults(list), [list]);

  const [visibleCount, setVisibleCount] = useState(RESULT_PAGE_SIZE);
  const visibleGroups = useMemo(() => groups.slice(0, visibleCount), [groups, visibleCount]);
  useEffect(() => setVisibleCount(RESULT_PAGE_SIZE), [groups]);

  return (
    <PageShell>
      <section className={cn('flex flex-col items-center', urlQuery ? 'mb-6' : 'mt-4 mb-8')}>
        {!urlQuery && (
          <header className="text-center mb-5">
            <h1 className="text-3xl sm:text-4xl font-bold brand-gradient">资源库</h1>
            <p className="text-sm text-muted mt-2">聚合多个点播源搜索网课视频，选中后即可在站内播放并记录学习时长</p>
          </header>
        )}
        {urlQuery && <h1 className="sr-only">网课资源搜索</h1>}

        <div ref={searchHistory.containerRef} className="relative w-full max-w-2xl">
          <form
            className="w-full"
            onSubmit={(e) => {
              e.preventDefault();
              runSearch(input);
            }}
          >
            <div
              className={cn(
                'flex items-stretch min-h-12 pl-4 border',
                'transition-[background-color,border-color,border-radius] duration-200',
                searchHistory.visible
                  ? 'rounded-t-xl rounded-b-none border-accent border-b-line bg-surface-raised'
                  : 'rounded-xl border-line bg-chip focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/40'
              )}
            >
              <input
                ref={inputRef}
                className="flex-1 min-w-0 pr-2 bg-transparent text-sm text-content placeholder:text-faint focus:outline-none"
                placeholder="搜索网课 / 课程关键词…"
                value={input}
                maxLength={100}
                onChange={(e) => {
                  setInput(e.target.value);
                  searchHistory.resetActive();
                }}
                onFocus={searchHistory.onFocus}
                onKeyDown={(e) => searchHistory.onKeyDown(e, pickHistory)}
                role="combobox"
                aria-label="搜索网课资源"
                aria-expanded={searchHistory.visible}
                aria-controls="resources-search-history"
                aria-autocomplete="list"
              />
              {input && (
                <button
                  type="button"
                  className="shrink-0 self-center mr-1 p-1.5 rounded-full text-faint hover:text-content hover:bg-hover transition-colors"
                  onClick={() => {
                    setInput('');
                    searchHistory.resetActive();
                    inputRef.current?.focus();
                  }}
                  aria-label="清空"
                >
                  <Icon name="close" className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                className={cn(
                  'btn-primary shrink-0 px-4 font-medium transition-[background-color,filter] active:brightness-90',
                  '!rounded-l-none',
                  searchHistory.visible ? '!rounded-tr-xl !rounded-br-none' : '!rounded-r-xl'
                )}
              >
                <Icon name="search" className="w-4 h-4" />
                搜索
              </button>
            </div>
          </form>

          {searchHistory.visible && (
            <SearchHistoryDropdown
              id="resources-search-history"
              matches={searchHistory.matches}
              activeIndex={searchHistory.activeIndex}
              onPick={pickHistory}
              onRemove={searchHistory.remove}
              onClearAll={searchHistory.clearAll}
            />
          )}
        </div>

        {!urlQuery && (
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
            <span className="text-xs text-faint">试试：</span>
            {recentQueries.map((q) => (
              <button key={q} className="chip bg-chip text-muted hover:text-content hover:bg-hover" onClick={() => runSearch(q)}>
                {q}
              </button>
            ))}
          </div>
        )}
      </section>

      {urlQuery && (
        <section aria-label="搜索结果" className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm text-muted">
              “<span className="text-content">{urlQuery}</span>” 的搜索结果
              {isSearching ? (
                <span className="text-faint">
                  （已就绪 {streamedOutcomes.length}/{selectedSources.length} 个源…）
                </span>
              ) : (
                searchQuery.data && (
                  <span className="text-faint">
                    （{groups.length} 个资源 · {list.length} 条结果
                    {failures.length > 0 && `，${failures.length} 个源失败`}）
                  </span>
                )
              )}
            </h2>
          </div>

          {failures.length > 0 && (
            <div className="mb-3 text-xs bg-chip rounded-lg px-3 py-2 flex flex-wrap gap-x-3 gap-y-1">
              <span className="text-faint">{isSearching ? '以下源暂时无响应：' : '部分点播源请求失败：'}</span>
              {failures.map((f) => (
                <span key={f.sourceKey} className={f.timedOut ? 'text-warning' : 'text-faint'}>
                  {f.timedOut ? '⏱' : '✗'} {sourceName(f.sourceKey)}
                  {f.timedOut ? ' 超时' : ''}
                </span>
              ))}
            </div>
          )}

          {disabledSources.length > 0 && (
            <div className="mb-3 text-xs text-faint bg-chip rounded-lg px-3 py-2">
              {disabledSources.length} 个源因连续超时/失败已暂停参与搜索：
              {disabledSources.map((key) => sourceName(key)).join('、')}
            </div>
          )}

          {offSubscriptionSources.length > 0 && (
            <div className="mb-3 text-xs text-faint bg-chip rounded-lg px-3 py-2">
              {offSubscriptionSources.length} 个源所属的订阅已停用，未参与本次搜索：
              {offSubscriptionSources.map((key) => sourceName(key)).join('、')}
            </div>
          )}

          {selectedSources.length === 0 ? (
            <NoSourceGuide hasSources={customAPIs.length > 0 || envSources.length > 0} />
          ) : list.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
                {visibleGroups.map((group) => (
                  <AggregatedCard
                    key={group.key}
                    group={group}
                    sources={selectedSources}
                    onOpen={(item) => setDetailItem(item)}
                  />
                ))}
              </div>
              {groups.length > visibleCount && (
                <div className="flex justify-center mt-4">
                  <button className="btn-ghost btn-sm" onClick={() => setVisibleCount((v) => v + RESULT_PAGE_SIZE)}>
                    加载更多（还有 {groups.length - visibleCount} 个）
                  </button>
                </div>
              )}
            </>
          ) : isSearching ? (
            <ResultsSkeleton />
          ) : (
            <EmptyState
              icon="search"
              title="没有找到匹配的资源"
              description="请尝试其他关键词，或在设置中添加更多点播源"
              className="!py-16"
            />
          )}
        </section>
      )}

      {!urlQuery && (
        <div className="card p-5 max-w-2xl mx-auto">
          <h2 className="text-sm font-medium text-content mb-2">怎么把资源变成课程？</h2>
          <ol className="text-xs text-muted leading-relaxed list-decimal pl-4 space-y-1">
            <li>在右上角「设置」里添加点播源（Apple CMS 采集站地址），勾选后回到这里搜索。</li>
            <li>搜索到网课视频后，可直接播放 —— 播放期间会自动记录学习时长。</li>
            <li>也可以把视频直链整理成课程：课程库 → 添加课程，按章节填入 m3u8 / mp4 地址。</li>
          </ol>
        </div>
      )}

      <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
    </PageShell>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card flex h-28 overflow-hidden">
          <div className="w-[105px] sm:w-[120px] shrink-0 bg-chip animate-pulse" />
          <div className="flex-1 p-2.5 space-y-2">
            <div className="h-4 w-3/4 rounded bg-chip animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-chip animate-pulse" />
            <div className="h-3 w-full rounded bg-chip animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NoSourceGuide({ hasSources = false }: { hasSources?: boolean }) {
  return (
    <div className="border border-dashed border-line rounded-xl p-10 text-center max-w-lg mx-auto">
      <h3 className="text-content font-medium mb-2">{hasSources ? '尚未勾选点播源' : '先添加一个点播源'}</h3>
      <p className="text-sm text-muted leading-relaxed">
        {hasSources ? (
          <>点击右上角「设置」，勾选要参与搜索的点播源后重新搜索。</>
        ) : (
          <>
            资源库不内置采集站。点击右上角「设置 → 添加 API」，填入一个 Apple CMS 采集站地址（如{' '}
            <code className="text-accent text-xs">https://example.com/api.php/provide/vod</code>），勾选后即可搜索网课资源。
          </>
        )}
      </p>
    </div>
  );
}
