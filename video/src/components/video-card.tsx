'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SearchResultItem, SourceConfig } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { qualityKey } from '@/lib/quality';
import { compactRemarks, formatRemarks, inferGroupRemarks } from '@/lib/remarks';
import { cn } from '@/lib/utils';
import { SmartImage } from './smart-image';
import { QualityBadge } from './quality-badge';
import { useQualityProbe } from './use-quality-probe';
import { useInView } from './use-in-view';

// —— 跨源同名聚合 ——

export interface AggregatedGroup {
  key: string;
  name: string;
  year?: string;
  typeName?: string;
  pic?: string;
  remarks?: string;
  items: SearchResultItem[];
}

function buildGroup(name: string, year: string | undefined, items: SearchResultItem[]): AggregatedGroup {
  return {
    key: `${name}|${year ?? ''}|${items.map((i) => `${i.sourceKey}_${i.vodId}`).join(',')}`,
    name,
    year,
    typeName: items.find((i) => i.typeName)?.typeName,
    pic: items.find((i) => i.pic)?.pic,
    // 同一部剧各源文案详略不同（「全34集」/「完结」/「更新至34集」），推到统一结论，
    // 否则同一部剧的来源列表会看起来状态各异
    remarks: inferGroupRemarks(items.map((i) => i.remarks)),
    items,
  };
}

/**
 * 把扁平的跨源搜索结果按「同名影片」聚合：
 * - 以名称分桶；桶内年份不一致时（同名翻拍）按年份拆分，无年份的条目并入年份桶；
 * - 保持传入顺序（搜索结果已按名称排序）。
 */
export function aggregateResults(list: SearchResultItem[]): AggregatedGroup[] {
  const byName = new Map<string, SearchResultItem[]>();
  for (const item of list) {
    const k = (item.name || '').trim();
    if (!k) continue;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k)!.push(item);
  }
  const groups: AggregatedGroup[] = [];
  for (const [name, items] of byName) {
    const years = [...new Set(items.map((i) => i.year).filter(Boolean))] as string[];
    if (years.length > 1) {
      for (const y of years) {
        groups.push(buildGroup(name, y, items.filter((i) => i.year === y)));
      }
      const noYear = items.filter((i) => !i.year);
      if (noYear.length) groups.push(buildGroup(name, undefined, noYear));
    } else {
      groups.push(buildGroup(name, years[0], items));
    }
  }
  return groups;
}

/**
 * 聚合影片卡片：
 * - 单源：点击直接打开该源详情（与旧体验一致）；
 * - 多源：显示「N 个来源」徽章，点击展开各源列表，选择具体源后打开详情。
 */
export function AggregatedCard({
  group,
  onOpen,
  sources,
}: {
  group: AggregatedGroup;
  onOpen: (item: SearchResultItem) => void;
  /** 完整源配置：探测画质需要 source.url / source.detail，搜索结果里只带 sourceUrl */
  sources?: SourceConfig[];
}) {
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const [imgFailed, setImgFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const showImg = !!group.pic && !imgFailed;

  const multi = group.items.length > 1;
  const adult = useMemo(() => group.items.some((i) => i.isAdult), [group.items]);

  const { qualities, probing, progress, prime, probe, probeQueued, retry } = useQualityProbe(sources);

  // 收起态就要有结论：先读缓存（展开时才真正探测）。
  // 依赖 group.key 而不是 items 数组——搜索页每次重渲染都会重建分组对象，
  // 用数组做依赖会让这个 effect 每帧触发，进而 setState 死循环。
  useEffect(() => {
    prime(group.items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.key]);

  // 单源卡片没有「展开」这一步：进入视口 500ms 后交给全局队列（并发 2），
  // 首屏能先亮，又不会把一屏十几张卡同时打向源站
  const { ref: inViewRef, inView } = useInView<HTMLDivElement>(!multi);
  useEffect(() => {
    if (!multi && inView) probeQueued(group.items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multi, inView, group.key]);

  const activate = () => {
    if (multi) {
      const next = !expanded;
      setExpanded(next);
      if (next) probe(group.items);
    } else {
      onOpen(group.items[0]);
    }
  };

  const singleItem = multi ? undefined : group.items[0];
  const singleKey = singleItem ? qualityKey(singleItem.sourceKey, singleItem.vodId) : undefined;

  // 展开面板按画质降序（同级保持原有源顺序）：探到一个更好的就往上走，
  // 用户不必自己横向比较三行灰字。没探到 / 未探到的排在最后。
  const heightOf = (item: SearchResultItem) => qualities[qualityKey(item.sourceKey, item.vodId)]?.height ?? 0;
  const sortedItems = useMemo(() => {
    const height = (item: SearchResultItem) => qualities[qualityKey(item.sourceKey, item.vodId)]?.height ?? 0;
    return group.items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => height(b.item) - height(a.item) || a.index - b.index)
      .map((entry) => entry.item);
  }, [group.items, qualities]);
  const bestHeight = sortedItems.reduce((max, item) => Math.max(max, heightOf(item)), 0);
  // 并列最高时只强调排在第一的那一行：三个源里框两个等于没有推荐
  const firstBest = sortedItems.find((item) => bestHeight > 0 && heightOf(item) === bestHeight);
  const bestKey = firstBest ? qualityKey(firstBest.sourceKey, firstBest.vodId) : undefined;
  // 各源集数一致时（常见：同剧多源同步更新）只在表头说一次，逐行不再重复
  const remarksList = sortedItems.map((item) => compactRemarks(item.remarks));
  const sharedRemarks =
    remarksList.length > 0 && remarksList.every((label) => label && label === remarksList[0])
      ? remarksList[0]
      : undefined;

  return (
    <div ref={inViewRef} className={cn('poster-card-hover h-full', multi && expanded && 'relative z-10')}>
      {/* TVBox 风竖版海报卡：海报主导，标题与来源信息贴在海报下方；多源时向下展开来源列表 */}
      <div className={cn('card flex h-full flex-col overflow-hidden', multi && expanded && 'ring-1 ring-accent/60')}>
        <div
          className="flex flex-1 cursor-pointer flex-col focus-ring"
          role="button"
          tabIndex={0}
          aria-expanded={multi ? expanded : undefined}
          onClick={activate}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              activate();
            }
          }}
        >
          {showImg ? (
            <div className="poster">
              <SmartImage
                url={group.pic}
                mode={imageProxyMode}
                customProxy={customImageProxy}
                alt={group.name}
                className="absolute inset-0 h-full w-full object-cover"
                onExhausted={() => setImgFailed(true)}
              />
              {/* 备注压在图上：底部黑→透明遮罩保证文字可读 */}
              <div className="poster-scrim absolute inset-x-0 bottom-0 h-14" />
              {(group.remarks || (multi && !expanded)) && (
                <p className="absolute inset-x-0 bottom-0 px-2 pb-1 text-[11px] font-medium text-white/90 line-clamp-1">
                  {group.remarks}
                </p>
              )}
              {/* 角标：右上角画质 / 来源数，左上角 18+ */}
              <div className="absolute right-1.5 top-1.5 flex flex-col items-end gap-1">
                {singleKey && (
                  <QualityBadge
                    entry={qualities[singleKey]}
                    loading={probing[singleKey]}
                    onRetry={singleItem ? () => retry([singleItem]) : undefined}
                  />
                )}
                {multi && (
                  <span className="tag bg-black/75 font-medium text-white">{group.items.length} 源</span>
                )}
              </div>
              {adult && <span className="tag absolute left-1.5 top-1.5 bg-black/75 text-danger">(18+)</span>}
            </div>
          ) : (
            <div className="poster flex items-center justify-center">
              <svg className="w-8 h-8 text-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16m10-16v16M3 6a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6zm4 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6zm8 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6zm4 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6z" />
              </svg>
              <div className="absolute right-1.5 top-1.5 flex flex-col items-end gap-1">
                {singleKey && (
                  <QualityBadge
                    entry={qualities[singleKey]}
                    loading={probing[singleKey]}
                    onRetry={singleItem ? () => retry([singleItem]) : undefined}
                  />
                )}
                {multi && (
                  <span className="tag bg-black/75 font-medium text-white">{group.items.length} 源</span>
                )}
              </div>
              {adult && <span className="tag absolute left-1.5 top-1.5 bg-black/75 text-danger">(18+)</span>}
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col p-2">
            <h3 className="text-[13px] font-medium leading-snug text-content line-clamp-2" title={group.name}>
              {group.name}
            </h3>
            <div className="mt-auto flex items-center gap-1.5 pt-1.5 text-[11px] text-faint">
              {group.typeName && <span className="shrink-0 truncate max-w-[45%]">{group.typeName}</span>}
              {group.year && <span className="shrink-0">{group.year}</span>}
              <span className="ml-auto truncate" title={multi ? undefined : group.items[0].sourceName}>
                {multi ? `${group.items.length} 个来源` : group.items[0].sourceName}
              </span>
            </div>
            {/* 无封面时备注只能放在正文里 */}
            {!showImg && group.remarks && (
              <p className="mt-1 text-[11px] text-muted line-clamp-2">{group.remarks}</p>
            )}
            {multi && (
              <div className="mt-1.5 flex items-center gap-1.5">
                {/* 收起态先给结论：最高画质比「N 个来源」更影响要不要点开 */}
                {progress.best && (
                  <span
                    className="tag bg-accent/15 font-medium text-accent"
                    title={
                      progress.known < progress.total
                        ? `已探到 / 实测的最高画质（${progress.known}/${progress.total} 个来源已有结论）`
                        : '已探到 / 实测的最高画质'
                    }
                  >
                    {progress.best}
                  </span>
                )}
                <span className="ml-auto text-[10px] text-faint">
                  {expanded ? '收起来源' : '选择来源'}
                </span>
                <svg
                  className={cn('w-4 h-4 text-faint transition-transform', expanded && 'rotate-180')}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            )}
          </div>
        </div>

        {multi && expanded && (
          <div className="border-t border-line p-2 animate-fade-in">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <p className="text-[10px] text-faint">
                选择来源
                {sharedRemarks ? ` · 均 ${sharedRemarks}` : ''}
              </p>
              {progress.total > 0 &&
                (progress.done < progress.total ? (
                  <p className="text-[10px] text-faint tabular-nums">
                    探测中 {progress.done}/{progress.total}
                  </p>
                ) : (
                  // 探完后「3/3」已经没有信息量，换成用户真正要的结论
                  <p className="text-[10px] text-accent tabular-nums">
                    {progress.best ? `最高 ${progress.best}` : '未能探到画质'}
                    {progress.failed > 0 ? ` · ${progress.failed} 源未探到` : ''}
                  </p>
                ))}
            </div>
            {/*
              竖版海报卡在网格里只有 150–250px 宽：来源行改成上下两段（源名 / 画质+集数），
              横向四段排开在此宽度下必然全部截断。
            */}
            <div className="flex flex-col gap-1.5">
              {sortedItems.map((item) => {
                const itemKey = qualityKey(item.sourceKey, item.vodId);
                const label = compactRemarks(item.remarks);
                const isBest = itemKey === bestKey;
                return (
                  <div
                    key={`${item.sourceKey}_${item.vodId}`}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      'group flex w-full min-w-0 flex-col gap-1 rounded-md border px-2 py-1.5',
                      'text-xs transition-colors cursor-pointer',
                      'bg-chip hover:border-accent hover:bg-accent/10',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                      isBest ? 'border-accent/50' : 'border-line',
                      item.isAdult && 'border-pink-500/30'
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(item);
                    }}
                    onKeyDown={(e) => {
                      // 不拦冒泡会连带触发整卡的 activate（外层 div 也在监听 Enter/Space）
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      e.stopPropagation();
                      onOpen(item);
                    }}
                    aria-label={`使用 ${item.sourceName} 播放${label && !sharedRemarks ? `，${label}` : ''}`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate font-medium text-content">{item.sourceName}</span>
                      <svg
                        className="w-3.5 h-3.5 shrink-0 text-accent transition-transform group-hover:translate-x-0.5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <QualityBadge
                        entry={qualities[itemKey]}
                        loading={probing[itemKey]}
                        onRetry={() => retry([item])}
                        // 定宽 + 等宽数字：各行的 360P / 540P / 1080P 左缘对齐，不随字符数抖动
                        className="min-w-[3.25rem] justify-center tabular-nums"
                      />
                      {/* 集数一致时已提到表头，逐行不再重复 */}
                      {!sharedRemarks && label && (
                        <span className="shrink-0 text-[10px] text-faint tabular-nums">{label}</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 影片卡片：封面加载失败时逐级降级到占位图（未聚合的单一结果使用） */
export function VideoCard({ item, onClick }: { item: SearchResultItem; onClick: () => void }) {
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !!item.pic && !imgFailed;

  return (
    <div
      className="card poster-card-hover cursor-pointer overflow-hidden focus-ring"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          // 阻止空格触发页面滚动（AggregatedCard 已是此写法，此处对齐）
          e.preventDefault();
          onClick();
        }
      }}
    >
      {showImg ? (
        <div className="poster">
          <SmartImage
            url={item.pic}
            mode={imageProxyMode}
            customProxy={customImageProxy}
            alt={item.name}
            className="absolute inset-0 h-full w-full object-cover"
            onExhausted={() => setImgFailed(true)}
          />
          <div className="poster-scrim absolute inset-x-0 bottom-0 h-14" />
          {item.remarks && (
            <p className="absolute inset-x-0 bottom-0 px-2 pb-1 text-[11px] font-medium text-white/90 line-clamp-1">
              {formatRemarks(item.remarks)}
            </p>
          )}
        </div>
      ) : (
        <div className="poster flex items-center justify-center">
          <svg className="w-8 h-8 text-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16m10-16v16M3 6a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6zm4 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6zm8 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6zm4 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6z" />
          </svg>
        </div>
      )}

      <div className="p-2">
        <h3 className="text-[13px] font-medium leading-snug text-content line-clamp-2" title={item.name}>
          {item.name}
        </h3>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-faint">
          {item.typeName && <span className="shrink-0 truncate max-w-[45%]">{item.typeName}</span>}
          {item.year && <span className="shrink-0">{item.year}</span>}
          <span className="ml-auto truncate" title={item.sourceName}>
            {item.sourceName}
          </span>
        </div>
        {!showImg && item.remarks && (
          <p className="mt-1 text-[11px] text-muted line-clamp-2">{formatRemarks(item.remarks)}</p>
        )}
      </div>
    </div>
  );
}

/** 豆瓣推荐卡片（无来源徽章，点击直接搜索） */
export function DoubanCard({ item, onClick }: { item: { title: string; cover: string; rating?: string }; onClick: () => void }) {
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => setImgFailed(false), [item.cover]);

  return (
    <div
      className="card poster-card-hover cursor-pointer overflow-hidden focus-ring"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          // 阻止空格触发页面滚动（AggregatedCard 已是此写法，此处对齐）
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="poster">
        {item.cover && !imgFailed ? (
          <SmartImage
            url={item.cover}
            mode={imageProxyMode}
            customProxy={customImageProxy}
            alt={item.title}
            className="w-full h-full object-cover"
            onExhausted={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-chip">
            <svg className="w-8 h-8 text-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16m10-16v16M3 6a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6zm4 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6zm8 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6zm4 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6z" />
            </svg>
          </div>
        )}
        {item.rating && (
          <span className={cn('absolute top-1.5 right-1.5 tag bg-black/70 text-rating font-medium')}>
            ★ {item.rating}
          </span>
        )}
      </div>
      <div className="p-2">
        <div className="text-xs font-medium text-content truncate" title={item.title}>
          {item.title}
        </div>
      </div>
    </div>
  );
}
