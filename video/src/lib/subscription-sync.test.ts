import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// store.ts 运行时引用 db.ts（IndexedDB），node 测试环境下 mock 掉
vi.mock('./db', () => ({
  db: {},
  clearLiveProbeResultsDb: vi.fn(async () => {}),
  loadLiveProbeResults: vi.fn(async () => ({})),
  saveLiveProbeResults: vi.fn(async () => {}),
}));

// 订阅内容由服务端代理拉取，测试中直接 mock
vi.mock('./client-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client-api')>();
  return { ...actual, api: { fetchSourceList: vi.fn() } };
});

import { api } from './client-api';
import {
  autoRefreshSubscriptions,
  canAutoRefresh,
  isRefreshDue,
} from './subscription-sync';
import { useAppStore, type SourceSubscription } from './store';
import type { SourceListPayload } from './types';

/**
 * 订阅同步单测：
 * - 自动刷新周期判定（纯函数，边界与旧版 24h 语义一致）；
 * - autoRefreshSubscriptions 的护栏：只刷到期的、失败计入连续次数、触顶暂停。
 */

const SUB_URL = 'https://paste.rs/JsI9D';

const payload: SourceListPayload = {
  name: 'LibreTV-List',
  sources: [
    { name: '非凡影视', url: 'https://cj.ffzyapi.com/api.php/provide/vod/from/ffm3u8' },
    { name: '如意资源', url: 'https://cj.rycjapi.com/api.php/provide/vod' },
  ],
  liveSources: [],
};

const fetchSourceList = vi.mocked(api.fetchSourceList);

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({
    customAPIs: [],
    selectedKeys: [],
    subscriptions: [],
    liveSubscriptions: [],
    liveSelectedUrls: [],
    yellowFilter: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('自动刷新周期判定', () => {
  const base: SourceSubscription = { url: SUB_URL };
  const DAY = 86_400_000;

  it('未设周期一律不自动刷新（默认仍是纯手动）', () => {
    expect(canAutoRefresh({ ...base, lastSync: 0 })).toBe(false);
    expect(isRefreshDue(0, undefined)).toBe(false);
  });

  it('从未同步过视为该刷新', () => {
    expect(isRefreshDue(undefined, 1)).toBe(true);
    expect(canAutoRefresh({ ...base, refreshDays: 1 })).toBe(true);
  });

  it('满周期才刷新，边界与旧版 24h 语义一致', () => {
    const now = 1_700_000_000_000;
    expect(isRefreshDue(now - DAY + 1, 1, now)).toBe(false);
    expect(isRefreshDue(now - DAY, 1, now)).toBe(true);
    expect(isRefreshDue(now - 7 * DAY, 7, now)).toBe(true);
  });

  it('连续失败触顶后暂停，未触顶仍刷新', () => {
    const stale = { ...base, refreshDays: 1, lastSync: 0 };
    expect(canAutoRefresh({ ...stale, failStreak: 2 })).toBe(true);
    expect(canAutoRefresh({ ...stale, failStreak: 3 })).toBe(false);
  });
});

describe('autoRefreshSubscriptions', () => {
  const now = Date.now();
  const DAY = 86_400_000;

  it('只刷新「设了周期且已到期」的订阅', async () => {
    useAppStore.setState({
      subscriptions: [
        { url: 'https://a.example.com/due.json', refreshDays: 1, lastSync: now - 2 * DAY },
        { url: 'https://b.example.com/fresh.json', refreshDays: 1, lastSync: now - 1000 },
        { url: 'https://c.example.com/manual.json', lastSync: now - 30 * DAY },
      ],
    });
    fetchSourceList.mockResolvedValue(payload);

    await autoRefreshSubscriptions(now);

    expect(fetchSourceList).toHaveBeenCalledTimes(1);
    expect(fetchSourceList).toHaveBeenCalledWith('https://a.example.com/due.json');
  });

  it('失败计入连续失败次数，成功清零', async () => {
    useAppStore.setState({
      subscriptions: [{ url: 'https://a.example.com/x.json', refreshDays: 1, lastSync: 0, failStreak: 1 }],
    });
    fetchSourceList.mockRejectedValue(new Error('boom'));

    await autoRefreshSubscriptions(now);
    expect(useAppStore.getState().subscriptions[0].failStreak).toBe(2);

    fetchSourceList.mockResolvedValue(payload);
    await autoRefreshSubscriptions(now);
    expect(useAppStore.getState().subscriptions[0].failStreak).toBe(0);
  });

  it('触顶的订阅不会再被自动刷新', async () => {
    useAppStore.setState({
      subscriptions: [{ url: 'https://a.example.com/x.json', refreshDays: 1, lastSync: 0, failStreak: 3 }],
    });

    await autoRefreshSubscriptions(now);

    expect(fetchSourceList).not.toHaveBeenCalled();
  });
});