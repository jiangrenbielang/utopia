'use client';

import { api } from './client-api';
import { normalizeSubscriptionUrl } from './source-list';
import { useAppStore, type SourceSubscription } from './store';
import type { SubscriptionParseStats } from './types';

/**
 * 数据源订阅同步核心逻辑，供两处复用：
 * - source-manager：用户在设置抽屉中手动添加/重新同步（UI 层加 toast 反馈）；
 * - providers：打开站点时对设了刷新周期的用户订阅做一次静默自动刷新。
 *
 * 订阅内容由服务端自动识别格式（LibreTV-SourceList JSON、TVBOX 配置 JSON 或接口目录 JSON），
 * applySubscriptionSources / applySubscriptionLive 均按订阅前缀整体替换且保留
 * 用户勾选状态，同步失败时不调用即无副作用——旧数据自动保留。
 */
export interface SubscriptionSyncResult {
  name?: string;
  vodCount: number;
  liveCount: number;
  /** 解析统计（识别格式、跳过与截断条目），用于导入结果提示 */
  stats?: SubscriptionParseStats;
}

export async function syncSourceSubscription(rawUrl: string): Promise<SubscriptionSyncResult> {
  // 统一归一化（trim + 去尾斜杠）：避免同一订阅地址因尾斜杠差异被存成两条订阅
  const url = normalizeSubscriptionUrl(rawUrl);
  try {
    const { name, sources, liveSources, stats, tvbox } = await api.fetchSourceList(url);
    if (sources.length === 0 && liveSources.length === 0) {
      throw new Error('订阅内容为空');
    }
    const store = useAppStore.getState();
    const vodCount = store.applySubscriptionSources(url, sources);
    const liveCount = store.applySubscriptionLive(url, liveSources);
    // 仅对本订阅引用的直播源记录同步时间（多归属：共享源也会被标记为新鲜，
    // 但名称/EPG 由 store 的「首次导入为准、缺失补齐」语义保护，不会被本订阅覆盖）
    const importedLiveUrls = new Set(
      useAppStore.getState().liveSubscriptions
        .filter((s) => s.fromSubscriptions.includes(url))
        .map((s) => s.url)
    );
    for (const s of liveSources) {
      if (importedLiveUrls.has(s.url)) store.markLiveSynced(s.url, s.name, s.epg);
    }
    store.addSubscription(url, name);
    store.markSubscriptionSynced(url, name, { vod: vodCount, live: liveCount });
    /**
     * TVBOX 配置额外带完整配置视图（解析线路、平台白名单、壁纸、站点形态统计）：
     * 源列表已由上面两步写进 customAPIs / liveSubscriptions，这里只补「源之外」的部分，
     * 供 TVBox 面板与壁纸长期使用；非 TVBOX 格式的订阅不带该字段，行为不变。
     * 首次拿到 TVBOX 配置时顺带把它设为生效配置，之后由用户在面板里改指别的配置。
     */
    if (tvbox) {
      store.setTvboxExtras(url, tvbox);
      if (!useAppStore.getState().tvboxActiveUrl) store.setTvboxActiveUrl(url);
    }
    return { name, vodCount, liveCount, stats };
  } catch (err) {
    // 记录失败状态供订阅列表展示（首次添加未成功时不产生条目）；已导入的旧数据保持不动
    const message = err instanceof Error ? err.message : '订阅同步失败';
    useAppStore.getState().markSubscriptionFailed(url, message);
    throw err instanceof Error ? err : new Error(message);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 自动刷新：同时最多 2 个、单次启动最多 5 个，避免打开站点时向上游打出一串请求 */
const AUTO_REFRESH_CONCURRENCY = 2;
const AUTO_REFRESH_MAX_PER_RUN = 5;
/** 连续失败达到该次数后暂停自动刷新（手动同步成功一次即恢复） */
export const AUTO_REFRESH_MAX_FAIL_STREAK = 3;

/** 周期（天）→ 毫秒；未设置或非法值返回 undefined（调用方据此判定「不自动刷新」） */
export function refreshIntervalMs(days: number | undefined): number | undefined {
  if (!days || !Number.isFinite(days) || days <= 0) return undefined;
  return days * DAY_MS;
}

/**
 * 距上次同步是否已满周期（满即刷新，与旧版 24h 的边界语义一致）。
 * 从未同步过视为该刷新：设了周期却一直没同步过的订阅，没有理由继续等。
 */
export function isRefreshDue(
  lastSync: number | undefined,
  days: number | undefined,
  now = Date.now()
): boolean {
  const interval = refreshIntervalMs(days);
  if (!interval) return false;
  if (!lastSync) return true;
  return now - lastSync >= interval;
}

/** 该订阅此刻是否该自动刷新：未设周期、或连续失败已触顶的一律不刷 */
export function canAutoRefresh(sub: SourceSubscription, now = Date.now()): boolean {
  if (!sub.refreshDays) return false;
  if ((sub.failStreak ?? 0) >= AUTO_REFRESH_MAX_FAIL_STREAK) return false;
  return isRefreshDue(sub.lastSync, sub.refreshDays, now);
}

/** 同一时刻只允许一轮自动刷新（Providers 挂载与页面重入可能撞在一起） */
let autoRefreshRunning = false;

/**
 * 用户订阅的自动刷新：**打开站点时执行一次**，不是定时器。
 *
 * 只处理显式设了 `refreshDays` 的订阅——默认（undefined）仍是纯手动，
 * 因此这个功能对存量用户完全无感，不会因为升级就凭空多出一堆上游请求。
 *
 * 护栏：
 * - 离线、后台标签页（document.hidden）直接跳过；
 * - 单次最多 AUTO_REFRESH_MAX_PER_RUN 个、并发 AUTO_REFRESH_CONCURRENCY；
 * - 连续失败 AUTO_REFRESH_MAX_FAIL_STREAK 次暂停，手动同步成功后自动恢复；
 * - 全程静默：失败只更新订阅行状态，不弹 toast（用户没主动操作，弹窗是打扰）。
 */
export async function autoRefreshSubscriptions(now = Date.now()): Promise<void> {
  if (autoRefreshRunning) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (typeof document !== 'undefined' && document.hidden) return;

  const due = useAppStore
    .getState()
    .subscriptions.filter((s) => canAutoRefresh(s, now))
    .slice(0, AUTO_REFRESH_MAX_PER_RUN);
  if (due.length === 0) return;

  autoRefreshRunning = true;
  try {
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < due.length) {
        const sub = due[cursor++];
        try {
          await syncSourceSubscription(sub.url);
        } catch {
          // 失败已由 syncSourceSubscription 写入订阅状态（含连续失败计数）
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(AUTO_REFRESH_CONCURRENCY, due.length) }, () => worker())
    );
  } finally {
    autoRefreshRunning = false;
  }
}