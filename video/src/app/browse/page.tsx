'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PageShell } from '@/components/study/page-shell';
import { VideoCard } from '@/components/video-card';
import { DetailModal } from '@/components/detail-modal';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Icon } from '@/components/icon';
import { api } from '@/lib/client-api';
import { useAppStore } from '@/lib/store';
import { cn, validateSourceUrl } from '@/lib/utils';
import type { SearchResultItem, SourceConfig } from '@/lib/types';
import type { CategoryListResponse, CmsFilterGroup } from '@/lib/cms-category';

/**
 * 分类浏览页：TVBox 的浏览范式（站点 → 分类 → 筛选 → 分页）。
 *
 * 与资源库（关键词聚合搜索）的分工：那边是你知道要看什么、直接搜；
 * 这里是不知道看什么、顺着采集站的分类目录往下翻。
 *
 * 路由名选 `/browse`（「分类」）：`/category` 容易和「课程分类」混淆，
 * `/browse` 表达的就是「按目录浏览」这个动作。
 */

/** 取某分类的筛选组：优先用列表响应带回的那份，取不到再退回 class=1 的结果 */
function pickFilterGroups(
  list: CategoryListResponse | undefined,
  classesFilters: Record<string, CmsFilterGroup[]> | undefined,
  classId: string | undefined
): CmsFilterGroup[] {
  if (!classId) return [];
  return list?.filters[classId] ?? classesFilters?.[classId] ?? [];
}

/** 筛选条件 → 稳定的查询串片段（对象键顺序不同也不该触发重复请求） */
function filterKeyOf(filters: Record<string, string>): string {
  return Object.keys(filters)
    .filter((k) => filters[k])
    .sort()
    .map((k) => `${k}=${filters[k]}`)
    .join('&');
}

export default function BrowsePage() {
  const customAPIs = useAppStore((s) => s.customAPIs);
  const selectedKeys = useAppStore((s) => s.selectedKeys);
  const yellowFilter = useAppStore((s) => s.yellowFilter);

  const [siteKey, setSiteKey] = useState<string | undefined>(undefined);
  const [classId, setClassId] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [detailItem, setDetailItem] = useState<SearchResultItem | null>(null);

  /**
   * 可选站点：已导入且地址合法的点播源；已勾选的排前面（用户真正在用的源）。
   * 成人源在「成人内容过滤」开启时不出现——与搜索链路的口径一致（过滤开启时成人源不参与）。
   */
  const sites = useMemo(() => {
    const usable = customAPIs.filter((s) => validateSourceUrl(s.url) && (!s.isAdult || !yellowFilter));
    const selected = new Set(selectedKeys);
    return [...usable].sort((a, b) => {
      const sa = selected.has(a.key) ? 0 : 1;
      const sb = selected.has(b.key) ? 0 : 1;
      return sa - sb || a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
  }, [customAPIs, selectedKeys, yellowFilter]);

  // 未显式选择时落到列表第一个，避免「必须点一下站点才出内容」的多余一步
  const activeSite: SourceConfig | undefined = useMemo(
    () => sites.find((s) => s.key === siteKey) ?? sites[0],
    [sites, siteKey]
  );

  const classesQuery = useQuery({
    queryKey: ['category-classes', activeSite?.url],
    queryFn: ({ signal }) => {
      if (!activeSite) throw new Error('未选择站点');
      return api.categoryClasses(activeSite.url, signal);
    },
    enabled: Boolean(activeSite),
    // 分类与筛选定义基本不变：一次会话内不必反复拉
    staleTime: 30 * 60 * 1000,
    retry: 0,
  });

  const classes = useMemo(() => classesQuery.data?.classes ?? [], [classesQuery.data]);
  const activeClass = useMemo(
    () => classes.find((c) => c.id === classId) ?? classes[0],
    [classes, classId]
  );

  const filterSignature = filterKeyOf(filters);
  const listQuery = useQuery({
    queryKey: ['category-list', activeSite?.url, activeClass?.id, page, filterSignature, yellowFilter],
    queryFn: ({ signal }) => {
      if (!activeSite) throw new Error('未选择站点');
      return api.category(
        activeSite.url,
        { classId: activeClass?.id, page, filters, adult: !yellowFilter },
        signal
      );
    },
    enabled: Boolean(activeSite) && Boolean(activeClass),
    // 翻页时保留上一页内容，避免整页闪成骨架（配合 isFetching 提示「加载中」）
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: 0,
  });

  /** 结果里的源信息换成用户真正选中的那份：详情 / 播放链路要按 key 解析源配置 */
  const items = useMemo<SearchResultItem[]>(() => {
    const list = listQuery.data?.list ?? [];
    if (!activeSite) return list;
    return list.map((item) => ({
      ...item,
      sourceKey: activeSite.key,
      sourceName: activeSite.name,
      sourceUrl: activeSite.url,
    }));
  }, [listQuery.data, activeSite]);

  const filterGroups = useMemo(
    () => pickFilterGroups(listQuery.data, classesQuery.data?.filters, activeClass?.id),
    [listQuery.data, classesQuery.data, activeClass?.id]
  );

  const pagecount = listQuery.data?.pagecount ?? 1;

  const chooseSite = (key: string) => {
    setSiteKey(key);
    setClassId(undefined);
    setPage(1);
    setFilters({});
  };

  const chooseClass = (id: string) => {
    setClassId(id);
    setPage(1);
    // 筛选定义是按分类给的，换分类必须清空，否则会把上一个分类的 f 带过去
    setFilters({});
  };

  const chooseFilter = (group: CmsFilterGroup, value: string) => {
    setPage(1);
    setFilters((prev) => {
      const next = { ...prev };
      // v 为空串是上游的「全部 / 不限」项：清掉该字段而不是提交一个空值
      if (!value) delete next[group.key];
      else next[group.key] = value;
      return next;
    });
  };

  const noSite = !activeSite;
  const hasSources = customAPIs.length > 0;

  return (
    <PageShell>
      <header className="mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-content">分类浏览</h1>
        <p className="text-sm text-muted mt-1.5">
          按采集站的分类目录翻片：选站点 → 选分类 → 筛选 → 翻页，点海报直接看详情
        </p>
      </header>

      {noSite ? (
        <EmptyState
          icon="link"
          title={hasSources ? '当前没有可浏览的点播源' : '还没有点播源'}
          description={
            hasSources
              ? '已导入的源地址都不合法，或全是成人源且开启了成人内容过滤；请到设置里检查源配置。'
              : '先到「设置」导入 TVBOX 订阅或手动添加一个采集站地址，导入后即可按分类浏览。'
          }
          action={
            <Link href="/settings" className="btn-primary btn-sm">
              去设置
            </Link>
          }
        />
      ) : (
        <>
          {/* 站点选择：横向可滑的胶囊条（TVBox 顶部栏观感） */}
          <section aria-label="选择站点" className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="list" className="w-4 h-4 text-faint" />
              <h2 className="text-xs text-faint">站点（{sites.length}）</h2>
            </div>
            <div className="nav-strip gap-1.5 pb-1">
              {sites.map((site) => (
                <button
                  key={site.key}
                  onClick={() => chooseSite(site.key)}
                  className={cn(
                    'chip-lg shrink-0',
                    'focus-ring',
                    site.key === activeSite.key
                      ? 'bg-accent font-medium text-on-accent hover:bg-accent-hover'
                      : 'bg-chip text-muted hover:bg-hover hover:text-content'
                  )}
                  aria-pressed={site.key === activeSite.key}
                >
                  {site.name}
                </button>
              ))}
            </div>
          </section>

          {/* 分类 tab：同样横向可滑 */}
          {classesQuery.isPending ? (
            <LoadingState label="正在读取站点分类…" className="!py-8" />
          ) : classesQuery.isError ? (
            <ErrorState
              message={classesQuery.error instanceof Error ? classesQuery.error.message : '读取分类失败'}
              onRetry={() => void classesQuery.refetch()}
            />
          ) : classes.length === 0 ? (
            <EmptyState
              icon="alert"
              title="该站点没有返回分类"
              description="换一个点播源试试；部分采集站只提供搜索，不提供分类目录。"
            />
          ) : (
            <>
              <div className="nav-strip gap-0.5 mb-3 -mx-1 px-1">
                {classes.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => chooseClass(c.id)}
                    className={cn('nav-tab', c.id === activeClass?.id && 'nav-tab-active')}
                    aria-current={c.id === activeClass?.id ? 'true' : undefined}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              {/* 筛选行：只有上游给了 filters 才渲染 */}
              {filterGroups.length > 0 && (
                <section aria-label="筛选" className="mb-4 space-y-2">
                  {filterGroups.map((group) => (
                    <div key={group.key} className="flex items-start gap-2 min-w-0">
                      <span className="w-10 shrink-0 pt-1 text-xs text-faint">{group.name}</span>
                      <div className="nav-strip gap-1.5 min-w-0 pb-1">
                        <button
                          onClick={() => chooseFilter(group, '')}
                          className={cn(
                            'chip shrink-0 focus-ring',
                            !filters[group.key]
                              ? 'bg-accent/15 text-accent font-medium'
                              : 'bg-chip text-muted hover:bg-hover hover:text-content'
                          )}
                        >
                          全部
                        </button>
                        {group.value.map((v) => (
                          <button
                            key={`${group.key}-${v.v}-${v.n}`}
                            onClick={() => chooseFilter(group, v.v)}
                            className={cn(
                              'chip shrink-0 focus-ring',
                              filters[group.key] === v.v && v.v
                                ? 'bg-accent/15 text-accent font-medium'
                                : 'bg-chip text-muted hover:bg-hover hover:text-content'
                            )}
                          >
                            {v.n}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {/* 结果区 */}
              <section aria-label="分类结果">
                {listQuery.isPending ? (
                  <ResultsSkeleton />
                ) : listQuery.isError ? (
                  <ErrorState
                    message={listQuery.error instanceof Error ? listQuery.error.message : '获取列表失败'}
                    onRetry={() => void listQuery.refetch()}
                  />
                ) : items.length === 0 ? (
                  <EmptyState
                    icon="search"
                    title="该条件下没有内容"
                    description="换一个分类或清空筛选再试。"
                    className="!py-16"
                  />
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h2 className="text-xs text-faint">
                        {activeClass?.name}
                        {Object.keys(filters).length > 0 && '（已筛选）'}
                        {typeof listQuery.data?.total === 'number' && listQuery.data.total > 0 && (
                          <span> · 共 {listQuery.data.total} 条</span>
                        )}
                      </h2>
                      {listQuery.isFetching && (
                        <span className="text-xs text-faint">加载中…</span>
                      )}
                    </div>

                    {/* 2:3 竖版海报网格，列数随屏宽增长（与资源库同一套观感） */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {items.map((item) => (
                        <VideoCard
                          key={`${item.sourceKey}_${item.vodId}`}
                          item={item}
                          onClick={() => setDetailItem(item)}
                        />
                      ))}
                    </div>

                    {/* 分页：上一页 / 下一页 + 当前页与总页数（总页数已由服务端限幅） */}
                    <div className="flex items-center justify-center gap-3 mt-6">
                      <button
                        className="btn-ghost btn-sm"
                        disabled={page <= 1 || listQuery.isFetching}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        上一页
                      </button>
                      <span className="text-xs text-muted tabular-nums">
                        第 {page} / {pagecount} 页
                      </span>
                      <button
                        className="btn-ghost btn-sm"
                        disabled={page >= pagecount || listQuery.isFetching}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        下一页
                      </button>
                    </div>
                  </>
                )}
              </section>
            </>
          )}
        </>
      )}

      <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
    </PageShell>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="card overflow-hidden">
          <div className="poster animate-pulse" />
          <div className="space-y-2 p-2">
            <div className="h-3.5 w-4/5 rounded bg-chip animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-chip animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}