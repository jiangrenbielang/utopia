'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { QualityEntry, SourceConfig, LiveSourceConfig, SourceSearchOutcome } from './types';
import { migrateSkipMarks, type SkipMark, type SkipSegment } from './skip-marks';
import { isQualityEntryFresh, mergeQualityEntries, qualityKey } from './quality';
import { PERSIST_KEY, createThrottledStorage } from './persist-storage';
import type { TvboxConfigExtras } from './tvbox-config';

/**
 * 全局设置（zustand + localStorage 持久化）。
 * 旧版把 10+ 个零散 localStorage key 当作跨页面状态总线，这里统一为单一 store。
 */

export interface AppSettings {
  customAPIs: SourceConfig[];
  selectedKeys: string[];
  yellowFilter: boolean;
  adFilter: boolean;
  doubanEnabled: boolean;
  /** 首页推荐数据源：豆瓣热门 / Bangumi 每日放送（免 key）/ 影视热榜（60s API） */
  recommendSource: 'douban' | 'bangumi' | 'hot-list';
  autoplayNext: boolean;
  /** 跳过片段：按归一化剧名持久化，详见 lib/skip-marks.ts */
  skipMarks: Record<string, SkipMark>;
  /**
   * 自动跳过标记的片段：片头/中段跳到片段末尾，片尾则直接结束本集。
   * 三类都是「标记区间 → 不播」，所以共用同一个开关；是否连播下一集仍由 autoplayNext 决定。
   */
  autoSkipSegments: boolean;
  imageProxyMode: 'direct' | 'proxy' | 'custom';
  customImageProxy: string;
  /**
   * 页面背景壁纸：
   * - `off`   ：不显示（只有页面底色）
   * - `tvbox` ：跟随当前生效的 TVBOX 配置里的 `wallpaper`（默认，行为与升级前一致）
   * - `local` ：使用用户导入的本地图片（存 IndexedDB，见 lib/wallpapers.ts）
   */
  wallpaperMode: 'off' | 'tvbox' | 'local';
  /** 本地壁纸在 IndexedDB 里的 id（`wallpaperMode === 'local'` 时生效） */
  wallpaperLocalId?: string;
  /** 背景压暗程度 0–95（越大越暗，文字越易读） */
  wallpaperDim: number;
  /**
   * 壁纸填充方式：
   * - `cover`   ：铺满整个页面（按需裁切），默认
   * - `contain` ：完整显示整张图（可能留出页面底色）
   */
  wallpaperFit: 'cover' | 'contain';
}

/** 一次订阅同步导入的数量（点播 / 直播），用于列表内展示同步结果 */
export interface SubscriptionSyncCounts {
  vod: number;
  live: number;
}

/**
 * 数据源订阅：远程源列表（LibreTV-SourceList JSON 或 TVBOX 配置 JSON，由服务端自动识别），可一键同步更新。
 * 一份订阅同时下发点播源与直播源；老订阅只有点播源。订阅内容一律归一化为本站源结构，故存储层与格式无关。
 */
export interface SourceSubscription {
  url: string;
  /** 订阅列表自带名称 */
  name?: string;
  /** 上次同步成功时间 */
  lastSync?: number;
  /** 上次同步结果；undefined 表示尚未同步过 */
  lastStatus?: 'ok' | 'error';
  /** 上次同步的失败原因（lastStatus 为 error 时展示，保留到下次同步） */
  lastError?: string;
  /** 上次成功同步导入的数量统计 */
  lastCounts?: SubscriptionSyncCounts;
  /**
   * 整体开关：false 表示该订阅下的源暂不参与搜索。
   * 不改动各源自身的勾选状态、也不删除已导入的数据，因此随时可无损恢复。
   */
  enabled?: boolean;
  /**
   * 自动刷新周期（天）。undefined = 只手动同步（默认，与历史行为一致）；
   * 1-365 表示打开站点时按该周期静默刷新（详见 lib/subscription-sync.ts）。
   */
  refreshDays?: number;
  /** 连续同步失败次数：达到阈值后暂停自动刷新，成功一次清零 */
  failStreak?: number;
}

/** 删除点播源后的撤销快照 */
export interface RemovedSourceSnapshot {
  entry: SourceConfig;
  selected: boolean;
}

/** 删除直播源后的撤销快照 */
export interface RemovedLiveSnapshot {
  entry: LiveSubscription;
  selected: boolean;
}

/** 直播源：远程 M3U 播放列表；可来自用户手动添加，也可来自统一订阅 */
export interface LiveSubscription {
  url: string;
  name?: string;
  /** 该订阅关联的 XMLTV 节目单地址 */
  epg?: string;
  /** 上次同步成功时间 */
  lastSync?: number;
  /**
   * 引用该直播源的订阅 URL 列表（多归属：同一 M3U 可被多个订阅共享引用）。
   * 空数组表示用户手动添加的源；删除某个订阅时只移除自己的归属，
   * 只要列表非空该源就保留。名称/EPG 以首次导入为准，缺失时由后续同步补齐，
   * 避免多个订阅互相覆盖。
   */
  fromSubscriptions: string[];
}






/** 订阅导入的源 key 前缀：sub_<hash36(url)>，实际 key 为 `${prefix}_${i}`，同步时按前缀整体替换 */
export function subKeyPrefix(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) >>> 0;
  return `sub_${h.toString(36)}`;
}

/**
 * 判断源 key 是否属于指定订阅。
 * 不能直接 startsWith(prefix)：两个不同订阅的 hash36 可能恰好互为前缀
 * （如 sub_1a 与 sub_1a2b），此时会误删/误替换另一个订阅的源。
 * key 的完整形态是 `${prefix}_${i}`，因此要求前缀后紧跟分隔符。
 */
export function keyBelongsToSubscription(key: string, prefix: string): boolean {
  return key === prefix || key.startsWith(`${prefix}_`);
}

/** 点播源自动停用阈值：连续失败/超时达到该次数即暂停该源参与搜索 */
export const SOURCE_DISABLE_THRESHOLD = 2;
/**
 * 自动停用阶梯（毫秒），按「第几次被自动停用」逐级加重：
 * 固定时长的问题是，彻底挂掉的源会每隔 30 分钟被重新试一次、每次都要白等一轮超时；
 * 而偶发的网络抖动又不该被长期惩罚，所以第 1 级保持得很轻。
 * 下标 i 对应第 i+1 次停用；超出数组长度则进入长期停用（permanent）。
 */
export const SOURCE_DISABLE_LADDER = [30 * 60 * 1000, 24 * 60 * 60 * 1000];

/** 一次「源被自动停用」的事件，供调用方按级别提示 */
export interface SourceDisableEvent {
  key: string;
  /** 本次是第几次被自动停用（从 1 起） */
  level: number;
  /** 是否已进入长期停用（阶梯用尽，需手动恢复） */
  permanent: boolean;
  /** 本次停用时长（毫秒）；长期停用时为 undefined */
  ttlMs?: number;
}

/** 点播源健康度条目（按 sourceKey），随搜索结果滚动更新 */
export interface SourceHealthEntry {
  ok: boolean;
  ms?: number;
  error?: string;
  timedOut?: boolean;
  /** 连续失败/超时次数；成功时归零 */
  failStreak: number;
  /** 命中阈值后的停用截止时间（epoch ms）；恢复成功后清除 */
  disabledUntil?: number;
  /** 累计的自动停用等级（决定惩罚时长）；每成功一次降一级 */
  disableCount?: number;
  /** 阶梯用尽后的长期停用：不设到期时间，只能由用户手动恢复 */
  permanent?: boolean;
  timestamp: number;
}

interface AppState extends AppSettings {
  /** 部署者通过 DEFAULT_SOURCES 环境变量预置的源（服务端下发，不持久化） */
  envSources: SourceConfig[];
  /** 已向用户展示过并自动勾选过的预置源 key（持久化：用户取消勾选后不再反复勾上） */
  envKeysSeen: string[];
  subscriptions: SourceSubscription[];
  /** —— 直播模块（订阅管理；播放页已下线，仅保留源列表的增删与订阅同步） —— */
  /** 部署者通过 DEFAULT_LIVE_SOURCES 预置的直播源（服务端下发，不持久化） */
  liveEnvSources: LiveSourceConfig[];
  /** 已出现过的预置直播源 key（持久化：用于「首次自动可见」去重） */
  liveEnvKeysSeen: string[];
  /** 用户直播源：手动添加的 M3U + 订阅导入的 M3U（后者带 fromSubscription） */
  liveSubscriptions: LiveSubscription[];
  /** 已启用的直播源（按订阅 URL 唯一标识，首次出现自动勾选） */
  liveSelectedUrls: string[];
  /** 点播源健康度（随搜索滚动更新，跨会话持久化） */
  sourceHealth: Record<string, SourceHealthEntry>;
  /** 画质缓存（按 `sourceKey:vodId`）：播放实测与搜索时懒探测共用一份 */
  qualityMap: Record<string, QualityEntry>;
  /** 已出现过的 env 预置订阅 URL（持久化：用户删除后不再被自动加回） */
  envSubsSeen: string[];
  /**
   * TVBOX 配置附加信息（key = 配置地址）。
   * 只存「源列表之外」的部分：解析线路、平台白名单、壁纸、站点形态统计；
   * 可导入的源本身由订阅机制写进 customAPIs / liveSubscriptions，两处不重复。
   */
  tvboxByUrl: Record<string, TvboxConfigExtras>;
  /** 当前生效的 TVBOX 配置地址（决定壁纸等展示项取哪一份配置）；未选定则为空 */
  tvboxActiveUrl?: string;
  addCustomApi: (api: Omit<SourceConfig, 'key'> & { key?: string }) => void;
  updateCustomApi: (key: string, patch: Partial<SourceConfig>) => void;
  /** 删除点播源；返回被删快照供撤销，key 不存在时返回 null */
  removeCustomApi: (key: string) => RemovedSourceSnapshot | null;
  /** 撤销删除；原 key 已被占用（如订阅重新同步占用）时放弃并返回 false */
  restoreCustomApi: (snapshot: RemovedSourceSnapshot) => boolean;
  toggleSourceSelected: (key: string) => void;
  setSelectedKeys: (keys: string[]) => void;
  setEnvSources: (list: SourceConfig[]) => void;
  addSubscription: (url: string, name?: string) => void;
  removeSubscription: (url: string) => void;
  /** 整体启用/停用某个订阅（停用只影响搜索时是否采用，不动各源的勾选状态） */
  setSubscriptionEnabled: (url: string, enabled: boolean) => void;
  /** 设置自动刷新周期；传 undefined 表示改为纯手动同步 */
  setSubscriptionRefreshDays: (url: string, days: number | undefined) => void;
  markSubscriptionSynced: (url: string, name?: string, counts?: SubscriptionSyncCounts) => void;
  /**
   * 记录一次同步失败（保留该订阅与已导入的源，仅更新状态供列表展示）。
   * `countFailure: false` 用于鉴权失败（401/503）——那是会话问题不是源的问题，
   * 计入连续失败会让自动刷新被误暂停。
   */
  markSubscriptionFailed: (url: string, error: string, options?: { countFailure?: boolean }) => void;
  /** 用订阅内容整体替换该订阅名下的点播源，返回新增数量 */
  applySubscriptionSources: (subUrl: string, list: Omit<SourceConfig, 'key'>[]) => number;
  /** 用订阅内容整体替换该订阅名下的直播源，返回新增数量 */
  applySubscriptionLive: (subUrl: string, list: Omit<LiveSourceConfig, 'key'>[]) => number;
  setLiveEnvSources: (list: LiveSourceConfig[]) => void;
  addLiveSubscription: (url: string, name?: string, epg?: string) => void;
  /** 删除直播源；返回被删快照供撤销，不存在时返回 null */
  removeLiveSubscription: (url: string) => RemovedLiveSnapshot | null;
  /** 撤销删除直播源（恢复条目与其启用状态） */
  restoreLiveSubscription: (snapshot: RemovedLiveSnapshot) => void;
  /** 更新直播源的名称/EPG（地址不可改：换地址等于换源，会影响启用状态与最近观看关联） */
  updateLiveSubscription: (url: string, patch: { name?: string; epg?: string }) => void;
  markLiveSynced: (url: string, name?: string, epg?: string) => void;
  toggleLiveSelected: (url: string) => void;
  /** 批量启停直播源：一次 set 完成，避免逐条 toggle 的 O(n) 次持久化 */
  toggleLiveSelectedMany: (urls: string[]) => void;
  /**
   * 记录一次搜索的逐源健康度；连续失败/超时达到阈值即暂停该源参与搜索。
   * 停用时长按阶梯逐级加重（30 分钟 → 24 小时 → 长期停用），且每成功一次降一级：
   * 偶发抽风的源会自行回落，从未成功过的死源才会升到长期停用。
   * 不直接改 selectedKeys（用户勾选意图保留，且避免变更引用触发搜索重发），
   * 参与搜索与否由调用方经 isSourceDisabled 过滤。
   * 返回本次「新进入停用」的事件列表（供调用方按级别 toast 提示）。
   */
  recordSourceHealth: (outcomes: SourceSearchOutcome[]) => SourceDisableEvent[];
  /** 清除单个源的健康度记录（手动恢复入口） */
  clearSourceHealth: (key: string) => void;
  /**
   * 写入画质记录（播放实测与懒探测共用同一份缓存）。
   * 实测值优先级高于探测值：解析 m3u8 得到的只是源站声明的档位，
   * 播放时的 videoHeight 才是真实分辨率，实测一旦拿到就覆盖探测结果。
   */
  setQuality: (entries: Record<string, QualityEntry>) => void;
  /** 写入/更新某份 TVBOX 配置的附加信息（同一地址再次同步即覆盖为最新） */
  setTvboxExtras: (url: string, extras: TvboxConfigExtras) => void;
  /** 指定当前生效的 TVBOX 配置；传 undefined 表示取消选定（壁纸等展示项随之消失） */
  setTvboxActiveUrl: (url: string | undefined) => void;
  /** 删除某份配置的附加信息；若它正生效，同时清空 tvboxActiveUrl */
  removeTvboxExtras: (url: string) => void;
  /** 写入/更新一部剧的跳过片段（整体替换 segments，空数组表示清除） */
  setSkipMark: (key: string, segments: SkipSegment[]) => void;
  /** 本剧跳过总开关：关闭后保留标记但不生效 */
  setSkipMarkEnabled: (key: string, enabled: boolean) => void;
  /** 清除单部剧的跳过片段 */
  clearSkipMark: (key: string) => void;
  /** 清除全部跳过片段（设置面板的「清除全部」入口） */
  clearAllSkipMarks: () => void;
  markEnvSubsSeen: (urls: string[]) => void;
  updateSettings: (patch: Partial<Omit<AppSettings, 'customAPIs' | 'selectedKeys'>>) => void;
}

/** 全部可用直播源（预置 + 用户订阅）合并视图 */
export function allLiveSources(state: Pick<AppState, 'liveEnvSources' | 'liveSubscriptions'>): LiveSourceConfig[] {
  return [...state.liveEnvSources, ...state.liveSubscriptions.map((s) => ({ key: `sub_${s.url}`, name: s.name || s.url, url: s.url, epg: s.epg }))];
}

function nextCustomKey(apiList: SourceConfig[]): string {
  let i = 0;
  const used = new Set(apiList.map((a) => a.key));
  while (used.has(`custom_${i}`)) i++;
  return `custom_${i}`;
}

/**
 * 节流写入的 localStorage 包装已抽至 persist-storage.ts（db.ts 的 importConfig
 * 需要在直接写盘前 flush 缓冲，而运行时依赖方向是 store → db，不能反向引用）。
 */

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      customAPIs: [],
      envSources: [],
      envKeysSeen: [],
      subscriptions: [],
      liveEnvSources: [],
      liveEnvKeysSeen: [],
      liveSubscriptions: [],
      liveSelectedUrls: [],
      sourceHealth: {},
      qualityMap: {},
      envSubsSeen: [],
      tvboxByUrl: {},
      selectedKeys: [],
      yellowFilter: true,
      adFilter: true,
      doubanEnabled: true,
      recommendSource: 'hot-list',
      autoplayNext: true,
      skipMarks: {},
      // 自动跳过默认开启，但只有用户真正标记过片段才生效
      autoSkipSegments: true,
      // 直连优先：豆瓣封面有公共镜像 + 内置代理两级兜底（见 buildImageCandidates），
      // 默认省服务器流量；老用户保持已持久化的选择不受影响。
      imageProxyMode: 'direct',
      customImageProxy: '',
      // 壁纸默认跟随 TVBOX 配置（升级前就是「有配置才显示」），本地图片默认没有
      wallpaperMode: 'tvbox',
      wallpaperLocalId: undefined,
      wallpaperDim: 78,
      // 默认铺满：多数人期望「整屏都是壁纸」；想完整看整张图可在设置里切成「完整」
      wallpaperFit: 'cover',

      addCustomApi: (api) => {
        const list = get().customAPIs;
        const entry: SourceConfig = { ...api, key: api.key || nextCustomKey(list) };
        // 成人内容过滤开启时，成人源默认不勾选（用户可在关闭过滤后手动勾选）
        const selectable = !(entry.isAdult && get().yellowFilter);
        set({
          customAPIs: [...list, entry],
          selectedKeys: selectable ? [...get().selectedKeys, entry.key] : get().selectedKeys,
        });
      },

      updateCustomApi: (key, patch) => {
        // 源被标记为成人内容且过滤开启时，同步取消勾选
        const drop = patch.isAdult === true && get().yellowFilter;
        set({
          customAPIs: get().customAPIs.map((a) => (a.key === key ? { ...a, ...patch } : a)),
          selectedKeys: drop ? get().selectedKeys.filter((k) => k !== key) : get().selectedKeys,
        });
      },

      removeCustomApi: (key) => {
        const entry = get().customAPIs.find((a) => a.key === key);
        if (!entry) return null;
        const selected = get().selectedKeys.includes(key);
        set({
          customAPIs: get().customAPIs.filter((a) => a.key !== key),
          selectedKeys: get().selectedKeys.filter((k) => k !== key),
        });
        return { entry, selected };
      },

      restoreCustomApi: ({ entry, selected }) => {
        // key 已被重新占用（如订阅重新同步生成了同 key 的源）时放弃撤销，避免出现重复条目
        if (get().customAPIs.some((a) => a.key === entry.key)) return false;
        set({
          customAPIs: [...get().customAPIs, entry],
          selectedKeys: selected ? [...get().selectedKeys, entry.key] : get().selectedKeys,
        });
        return true;
      },

      toggleSourceSelected: (key) => {
        const cur = get().selectedKeys;
        if (cur.includes(key)) {
          set({ selectedKeys: cur.filter((k) => k !== key) });
          return;
        }
        // 成人内容过滤开启时不允许勾选成人源
        const src = get().customAPIs.find((a) => a.key === key);
        if (src?.isAdult && get().yellowFilter) return;
        set({ selectedKeys: [...cur, key] });
      },

      setSelectedKeys: (keys) => set({ selectedKeys: keys }),

      setEnvSources: (list) => {
        // 预置源首次出现时自动勾选（开箱即搜）；用户此后取消勾选不会被反复勾回
        const seen = new Set(get().envKeysSeen);
        const freshKeys = list.map((s) => s.key).filter((k) => !seen.has(k));
        // 成人内容过滤开启时，成人预置源不自动勾选
        const toSelect = freshKeys.filter((k) => {
          const src = list.find((s) => s.key === k);
          return !src?.isAdult || !get().yellowFilter;
        });
        set({
          envSources: list,
          envKeysSeen: [...get().envKeysSeen, ...freshKeys],
          selectedKeys: [...get().selectedKeys, ...toSelect],
        });
      },

      addSubscription: (url, name) => {
        if (get().subscriptions.some((s) => s.url === url)) return;
        set({ subscriptions: [...get().subscriptions, { url, name }] });
      },

      removeSubscription: (url) => {
        const prefix = subKeyPrefix(url);
        // 多归属：删除订阅只移除自己的引用；仍被其他订阅共享的直播源保留，
        // 仅当没有任何订阅再引用时才移除条目（连同启用状态与最近观看，收藏始终保留）
        const removedLive = get().liveSubscriptions
          .filter((s) => s.fromSubscriptions.includes(url))
          .map((s) => {
            const rest = s.fromSubscriptions.filter((u) => u !== url);
            return { entry: s, orphan: rest.length === 0, rest };
          });
        const orphanUrls = new Set(removedLive.filter((r) => r.orphan).map((r) => r.entry.url));
        // TVBOX 附加信息与订阅一一对应（key 就是配置地址）：订阅没了，它对应的配置视图
        // 也不该留着——否则壁纸/解析线路会继续生效于一个已经被删掉的订阅。
        const tvboxByUrl = { ...get().tvboxByUrl };
        delete tvboxByUrl[url];
        const tvboxActiveUrl = get().tvboxActiveUrl === url ? undefined : get().tvboxActiveUrl;
        set({
          subscriptions: get().subscriptions.filter((s) => s.url !== url),
          customAPIs: get().customAPIs.filter((a) => !keyBelongsToSubscription(a.key, prefix)),
          selectedKeys: get().selectedKeys.filter((k) => !keyBelongsToSubscription(k, prefix)),
          liveSubscriptions: removedLive
            .filter((r) => !r.orphan)
            .map((r) => ({ ...r.entry, fromSubscriptions: r.rest })),
          liveSelectedUrls: get().liveSelectedUrls.filter((u) => !orphanUrls.has(u)),
          tvboxByUrl,
          tvboxActiveUrl,
        });
      },

      markSubscriptionSynced: (url, name, counts) => {
        set({
          subscriptions: get().subscriptions.map((s) =>
            s.url === url
              ? {
                  ...s,
                  lastSync: Date.now(),
                  name: name ?? s.name,
                  lastStatus: 'ok',
                  lastError: undefined,
                  lastCounts: counts ?? s.lastCounts,
                  // 成功即清零：自动刷新被暂停的订阅会随之恢复
                  failStreak: 0,
                }
              : s
          ),
        });
      },

      setSubscriptionEnabled: (url, enabled) => {
        set({
          subscriptions: get().subscriptions.map((s) => (s.url === url ? { ...s, enabled } : s)),
        });
      },

      setSubscriptionRefreshDays: (url, days) => {
        set({
          subscriptions: get().subscriptions.map((s) =>
            s.url === url ? { ...s, refreshDays: days } : s
          ),
        });
      },

      markSubscriptionFailed: (url, error, options) => {
        // 失败不清空已导入的源（旧数据保留），仅记录状态供列表展示
        const countFailure = options?.countFailure !== false;
        set({
          subscriptions: get().subscriptions.map((s) =>
            s.url === url
              ? {
                  ...s,
                  lastStatus: 'error',
                  lastError: error,
                  failStreak: countFailure ? (s.failStreak ?? 0) + 1 : s.failStreak,
                }
              : s
          ),
        });
      },

      applySubscriptionSources: (subUrl, list) => {
        const prefix = subKeyPrefix(subUrl);
        // 与订阅源 URL 相同的手动添加源视为重复，避免同步后出现双份
        const subUrls = new Set(list.map((s) => s.url.replace(/\/+$/, '')));
        const keptCustom = get().customAPIs.filter(
          (a) => !keyBelongsToSubscription(a.key, prefix) && !subUrls.has(a.url.replace(/\/+$/, ''))
        );
        const prevOwned = get().customAPIs.filter((a) => keyBelongsToSubscription(a.key, prefix));
        // key 按序号重生成，勾选状态需按 url 对齐保留；用户停用的源不会被同步反复勾回
        const prevSelectedUrls = new Set(
          prevOwned
            .filter((a) => get().selectedKeys.includes(a.key))
            .map((a) => a.url.replace(/\/+$/, ''))
        );
        const prevUrlSet = new Set(prevOwned.map((a) => a.url.replace(/\/+$/, '')));
        const incoming: SourceConfig[] = list.map((s, i) => ({
          ...s,
          key: `${prefix}_${i}`,
        }));
        // 新源自动勾选（成人过滤开启时跳过成人源），已有源维持原勾选状态
        const toSelect = incoming
          .filter((s) => {
            const u = s.url.replace(/\/+$/, '');
            return prevUrlSet.has(u) ? prevSelectedUrls.has(u) : !s.isAdult || !get().yellowFilter;
          })
          .map((s) => s.key);
        set({
          customAPIs: [...keptCustom, ...incoming],
          selectedKeys: [...get().selectedKeys.filter((k) => !keyBelongsToSubscription(k, prefix)), ...toSelect],
        });
        return incoming.length;
      },

      applySubscriptionLive: (subUrl, list) => {
        const existing = get().liveSubscriptions;
        const byUrl = new Map(existing.map((s) => [s.url, s]));
        const nextByUrl = new Map<string, LiveSubscription>();
        const orphanUrls = new Set<string>();

        // 多归属：同一 M3U 可被多个订阅共享引用，仅追加归属而不重复导入条目；
        // 手动添加的源（无订阅归属）由用户完全掌控，订阅不接管。
        // 名称/EPG 以首次导入为准，缺失字段由后续同步补齐，避免多个订阅互相覆盖。
        for (const s of list) {
          const current = byUrl.get(s.url);
          if (!current) {
            nextByUrl.set(s.url, { url: s.url, name: s.name, epg: s.epg, fromSubscriptions: [subUrl] });
          } else if (current.fromSubscriptions.length === 0 || current.fromSubscriptions.includes(subUrl)) {
            nextByUrl.set(s.url, current);
          } else {
            nextByUrl.set(s.url, { ...current, fromSubscriptions: [...current.fromSubscriptions, subUrl] });
          }
        }
        // 不在本次列表中的条目：摘除本订阅的归属引用（远端已删即不再持有）——
        // 摘除后仍被其他订阅引用的降级为其引用；不再被任何订阅引用的订阅源随本次同步移除；
        // 手动添加的源（无订阅归属）由用户完全掌控，不受同步影响
        for (const s of existing) {
          if (nextByUrl.has(s.url)) continue;
          if (!s.fromSubscriptions.includes(subUrl)) {
            nextByUrl.set(s.url, s);
            continue;
          }
          const rest = s.fromSubscriptions.filter((u) => u !== subUrl);
          if (rest.length > 0) {
            nextByUrl.set(s.url, { ...s, fromSubscriptions: rest });
          } else {
            orphanUrls.add(s.url);
          }
        }

        // 仅首次出现的源自动启用；已存在的维持用户勾选（停用不会被同步反复勾回）
        const freshUrls = [...nextByUrl.values()].filter((s) => !byUrl.has(s.url)).map((s) => s.url);

        set({
          liveSubscriptions: [...nextByUrl.values()],
          liveSelectedUrls: [
            ...new Set([
              ...get().liveSelectedUrls.filter((u) => !orphanUrls.has(u)),
              ...freshUrls,
            ]),
          ],
        });
        // 返回本订阅实际持有的引用数（与订阅条目的「直播 N」计数口径一致）
        return [...nextByUrl.values()].filter((s) => s.fromSubscriptions.includes(subUrl)).length;
      },

      setLiveEnvSources: (list) => {
        // 预置直播源首次出现时自动启用；用户此后停用不会被反复勾回
        const seen = new Set(get().liveEnvKeysSeen);
        const freshUrls = list.filter((s) => !seen.has(s.key)).map((s) => s.url);
        set({
          liveEnvSources: list,
          liveEnvKeysSeen: [...get().liveEnvKeysSeen, ...list.map((s) => s.key)],
          liveSelectedUrls: [...get().liveSelectedUrls, ...freshUrls],
        });
      },

      addLiveSubscription: (url, name, epg) => {
        const trimmed = url.trim();
        if (!trimmed || get().liveSubscriptions.some((s) => s.url === trimmed)) return;
        set({
          // 手动添加的源无订阅归属（fromSubscriptions 为空），订阅同步不会接管
          liveSubscriptions: [
            ...get().liveSubscriptions,
            { url: trimmed, name, epg, fromSubscriptions: [] },
          ],
          // 新添加的订阅默认启用
          liveSelectedUrls: [...new Set([...get().liveSelectedUrls, trimmed])],
        });
      },

      removeLiveSubscription: (url) => {
        const entry = get().liveSubscriptions.find((s) => s.url === url);
        if (!entry) return null;
        const selected = get().liveSelectedUrls.includes(url);
        set({
          liveSubscriptions: get().liveSubscriptions.filter((s) => s.url !== url),
          liveSelectedUrls: get().liveSelectedUrls.filter((u) => u !== url),
        });
        return { entry, selected };
      },

      restoreLiveSubscription: ({ entry, selected }) => {
        if (get().liveSubscriptions.some((s) => s.url === entry.url)) return;
        set({
          liveSubscriptions: [...get().liveSubscriptions, entry],
          liveSelectedUrls: selected
            ? [...new Set([...get().liveSelectedUrls, entry.url])]
            : get().liveSelectedUrls,
        });
      },

      updateLiveSubscription: (url, patch) => {
        set({
          liveSubscriptions: get().liveSubscriptions.map((s) => (s.url === url ? { ...s, ...patch } : s)),
        });
      },

      toggleLiveSelected: (url) => {
        const cur = get().liveSelectedUrls;
        set({
          liveSelectedUrls: cur.includes(url)
            ? cur.filter((u) => u !== url)
            : [...cur, url],
        });
      },

      // 批量启停：一次 set 替代 N 次逐条 toggle（每条都会触发一次完整 persist 序列化）
      toggleLiveSelectedMany: (urls) => {
        const cur = get().liveSelectedUrls;
        let next = cur;
        for (const url of urls) {
          next = next.includes(url) ? next.filter((u) => u !== url) : [...next, url];
        }
        set({ liveSelectedUrls: next });
      },

      markLiveSynced: (url, name, epg) => {
        set({
          liveSubscriptions: get().liveSubscriptions.map((s) =>
            s.url === url
              ? // 共享源可能被多个订阅先后同步：名称/EPG 以首次导入为准，仅缺失时补齐
                { ...s, lastSync: Date.now(), name: s.name ?? name, epg: s.epg ?? epg }
              : s
          ),
        });
      },

      recordSourceHealth: (outcomes) => {
        if (outcomes.length === 0) return [];
        const now = Date.now();
        const health: Record<string, SourceHealthEntry> = {};
        // 顺带清理陈旧条目：超过 7 天没再参与过搜索的源，其惩罚等级一并作废
        for (const [key, e] of Object.entries(get().sourceHealth)) {
          if (now - e.timestamp < 7 * 24 * 60 * 60 * 1000) health[key] = e;
        }
        const events: SourceDisableEvent[] = [];
        for (const o of outcomes) {
          const prev = health[o.sourceKey];
          // 停用期已过 → 上一次的连续失败已被「停用 + 恢复」打断，重新从 1 开始累计
          const interrupted = !!prev?.disabledUntil && prev.disabledUntil <= now;
          const failStreak = o.ok ? 0 : interrupted ? 1 : (prev?.failStreak ?? 0) + 1;
          // 成功一次即降一级（而非清零）：偶发抽风的源会自己降回来，
          // 从未成功过的死源才会一路升到长期停用
          const disableCount = o.ok
            ? Math.max(0, (prev?.disableCount ?? 0) - 1)
            : (prev?.disableCount ?? 0);
          // entry 覆盖旧记录：成功时停用标记随之消失（立即恢复）
          const entry: SourceHealthEntry = {
            ok: o.ok,
            ms: o.ms,
            error: o.error,
            timedOut: o.timedOut,
            failStreak,
            disableCount,
            timestamp: now,
          };
          if (!o.ok && failStreak >= SOURCE_DISABLE_THRESHOLD) {
            const alreadyDisabled = prev?.permanent === true || (prev?.disabledUntil ?? 0) > now;
            if (alreadyDisabled) {
              // 已在停用期内（正常不会参与搜索，此处仅作防御）：保持原等级与截止时间
              entry.disableCount = prev?.disableCount ?? disableCount;
              entry.disabledUntil = prev?.disabledUntil;
              entry.permanent = prev?.permanent;
            } else {
              // 第 N 次被停用 → 取阶梯第 N 级；阶梯用尽则进入长期停用
              const nextLevel = disableCount + 1;
              const ttlMs: number | undefined = SOURCE_DISABLE_LADDER[nextLevel - 1];
              entry.disableCount = nextLevel;
              if (ttlMs === undefined) {
                entry.permanent = true;
              } else {
                entry.disabledUntil = now + ttlMs;
              }
              events.push({ key: o.sourceKey, level: nextLevel, permanent: ttlMs === undefined, ttlMs });
            }
          }
          health[o.sourceKey] = entry;
        }
        set({ sourceHealth: health });
        return events;
      },

      clearSourceHealth: (key) => {
        const next = { ...get().sourceHealth };
        delete next[key];
        set({ sourceHealth: next });
      },

      setQuality: (entries) => {
        // 合并与淘汰规则见 mergeQualityEntries（纯函数，单独覆盖了优先级与 TTL 的单测）
        set({ qualityMap: mergeQualityEntries(get().qualityMap, entries) });
      },

      setTvboxExtras: (url, extras) => {
        if (!url) return;
        set({ tvboxByUrl: { ...get().tvboxByUrl, [url]: extras } });
      },

      setTvboxActiveUrl: (url) => {
        if (get().tvboxActiveUrl === url) return;
        set({ tvboxActiveUrl: url });
      },

      removeTvboxExtras: (url) => {
        const active = get().tvboxActiveUrl === url;
        const rest = { ...get().tvboxByUrl };
        if (!(url in rest)) {
          // 条目本就不存在：仍要保证「生效指向已删配置」的残留被清掉
          if (active) set({ tvboxActiveUrl: undefined });
          return;
        }
        delete rest[url];
        set({ tvboxByUrl: rest, tvboxActiveUrl: active ? undefined : get().tvboxActiveUrl });
      },

      setSkipMark: (key, segments) => {
        const marks = get().skipMarks;
        // 空片段列表整条删除，持久化快照里不留空壳条目
        if (!segments || segments.length === 0) {
          if (!marks[key]) return;
          const rest = { ...marks };
          delete rest[key];
          set({ skipMarks: rest });
          return;
        }
        set({
          skipMarks: {
            ...marks,
            [key]: {
              segments,
              // 改片段不重置本剧总开关：用户可能只是修一条标错的边界
              enabled: marks[key]?.enabled ?? true,
              updatedAt: Date.now(),
            },
          },
        });
      },

      setSkipMarkEnabled: (key, enabled) => {
        const marks = get().skipMarks;
        const mark = marks[key];
        if (!mark || mark.enabled === enabled) return;
        set({ skipMarks: { ...marks, [key]: { ...mark, enabled, updatedAt: Date.now() } } });
      },

      clearSkipMark: (key) => {
        if (!get().skipMarks[key]) return;
        const rest = { ...get().skipMarks };
        delete rest[key];
        set({ skipMarks: rest });
      },

      clearAllSkipMarks: () => set({ skipMarks: {} }),

      markEnvSubsSeen: (urls) => {
        const seen = new Set(get().envSubsSeen);
        for (const u of urls) seen.add(u);
        set({ envSubsSeen: [...seen] });
      },

      updateSettings: (patch) => {
        // 打开成人内容过滤时，同步取消勾选所有成人源，避免两者并存
        if (patch.yellowFilter === true) {
          const adultKeys = new Set(
            get().customAPIs
              .filter((s) => s.isAdult)
              .map((s) => s.key)
          );
          set({
            ...patch,
            selectedKeys: get().selectedKeys.filter((k) => !adultKeys.has(k)),
          });
          return;
        }
        set({ ...patch });
      },
    }),
    {
      name: PERSIST_KEY,
      // 节流写入：搜索 / 测活等高频 set 不再每次都整份序列化写盘
      storage: createJSONStorage(createThrottledStorage),
      // v1：直播源新增归属字段、最近观看新增 sourceUrl。
      // v2：直播源归属改为多引用（fromSubscription 单值 → fromSubscriptions 数组）。
      // v3：新增片头片尾标记与自动跳过开关（旧快照缺字段时补默认值）。
      // v4：片头/片尾双标记泛化为跳过片段 segments（opening/middle/ending）。
      // v5：标记新增本剧总开关 enabled。
      // v6：自动跳过由「片头 / 中段」合并为单一开关。
      // v7：片尾结束也并入同一开关（不再单独提供 autoSkipOutro）。
      // v8：订阅新增 refreshDays / failStreak——两者都缺省即「纯手动 + 无失败记录」，
      //     与旧行为完全一致，因此无需改写存量数据，仅借版本号让 migrate 跑一遍。
      // v9：新增 TVBOX 配置附加信息 tvboxByUrl 与生效地址 tvboxActiveUrl——缺省即
      //     「没有任何 TVBOX 配置」，壁纸与解析线路都不展示，与升级前行为一致，仅补默认值。
      // 此前未声明 version 的存量数据会被视为 v0 并走 migrate 补齐。
      version: 10,
      migrate: (persisted, version) => {
        const state = { ...((persisted ?? {}) as Partial<AppState>) };
        if (!Array.isArray(state.liveSubscriptions)) state.liveSubscriptions = [];

        // v3 的片头/片尾双标记 → v4 的 segments（纯函数，脏数据在内部丢弃）
        state.skipMarks = migrateSkipMarks(
          (state as unknown as { skipMarks?: unknown }).skipMarks
        );

        // 「自动跳过」只有一个开关，覆盖片头/中段/片尾（都是「标记区间 → 不播」）。
        // v3 autoSkipIntro / v4 autoSkipSegments / v5 autoSkipOpening / v5-v6 autoSkipOutro 统一归一：
        // 以「跳过」开关为准，其次才看旧的分项开关，都没有时按默认开启。
        const legacy = state as unknown as {
          autoSkipIntro?: unknown;
          autoSkipSegments?: unknown;
          autoSkipOpening?: unknown;
          autoSkipMiddle?: unknown;
          autoSkipOutro?: unknown;
        };
        if (typeof legacy.autoSkipSegments !== 'boolean') {
          state.autoSkipSegments =
            typeof legacy.autoSkipOpening === 'boolean'
              ? legacy.autoSkipOpening
              : typeof legacy.autoSkipIntro === 'boolean'
                ? legacy.autoSkipIntro
                : typeof legacy.autoSkipOutro === 'boolean'
                  ? legacy.autoSkipOutro
                  : true;
        }

        // 迁移完成后清掉旧字段，避免内存里同时存在两套语义
        for (const stale of ['autoSkipIntro', 'autoSkipOpening', 'autoSkipMiddle', 'autoSkipOutro']) {
          delete (state as unknown as Record<string, unknown>)[stale];
        }

        if (version < 2) {
          state.liveSubscriptions = state.liveSubscriptions.map((s) => {
            const legacy = s as LiveSubscription & { fromSubscription?: unknown };
            const fromSubscriptions = Array.isArray(legacy.fromSubscriptions)
              ? legacy.fromSubscriptions
              : typeof legacy.fromSubscription === 'string' && legacy.fromSubscription
                ? [legacy.fromSubscription]
                : [];
            // 显式构造以剔除旧的单值字段，避免新旧字段并存
            return {
              url: legacy.url,
              name: legacy.name,
              epg: legacy.epg,
              lastSync: legacy.lastSync,
              fromSubscriptions,
            };
          });
        }

        // v9：TVBOX 配置附加信息与生效地址。
        // 两者都是「可缺失」的新增字段：旧快照里没有 → 补成「没有配置 + 未选定」，
        // 存量数据一条都不动（不覆盖 customAPIs / subscriptions 等已有字段）。
        if (version < 9) {
          if (!state.tvboxByUrl || typeof state.tvboxByUrl !== 'object' || Array.isArray(state.tvboxByUrl)) {
            state.tvboxByUrl = {};
          }
          if (typeof state.tvboxActiveUrl !== 'string') state.tvboxActiveUrl = undefined;
        }
        // v10：页面背景壁纸（off / tvbox / local）+ 本地图片 id + 压暗程度。
        // 缺省按 `tvbox` 处理：升级前就是「配置里有 wallpaper 才显示」，行为不变。
        if (version < 10) {
          if (state.wallpaperMode !== 'off' && state.wallpaperMode !== 'tvbox' && state.wallpaperMode !== 'local') {
            state.wallpaperMode = 'tvbox';
          }
          if (typeof state.wallpaperLocalId !== 'string') state.wallpaperLocalId = undefined;
          const dim = Number(state.wallpaperDim);
          state.wallpaperDim = Number.isFinite(dim) ? Math.min(95, Math.max(0, Math.round(dim))) : 78;
        }
        return state as AppState;
      },
      partialize: (s) => ({
        customAPIs: s.customAPIs,
        selectedKeys: s.selectedKeys,
        subscriptions: s.subscriptions,
        liveSubscriptions: s.liveSubscriptions,
        liveSelectedUrls: s.liveSelectedUrls,
        sourceHealth: s.sourceHealth,
        qualityMap: s.qualityMap,
        tvboxByUrl: s.tvboxByUrl,
        tvboxActiveUrl: s.tvboxActiveUrl,
        yellowFilter: s.yellowFilter,
        adFilter: s.adFilter,
        doubanEnabled: s.doubanEnabled,
        recommendSource: s.recommendSource,
        autoplayNext: s.autoplayNext,
        skipMarks: s.skipMarks,
        autoSkipSegments: s.autoSkipSegments,
        imageProxyMode: s.imageProxyMode,
        customImageProxy: s.customImageProxy,
        wallpaperMode: s.wallpaperMode,
        wallpaperLocalId: s.wallpaperLocalId,
        wallpaperDim: s.wallpaperDim,
        wallpaperFit: s.wallpaperFit,
      }),
      // 同步 storage 会在模块加载时立即 rehydrate（早于 React hydration），
      // 一旦首屏渲染依赖持久化状态就会与 SSR 输出不一致。
      // 改为由 Providers 在挂载后手动 rehydrate。
      skipHydration: true,
    }
  )
);

/** 获取指定 key 的源配置；找不到时支持从 URL 参数兜底构造 */
export function resolveSource(
  store: Pick<AppState, 'customAPIs' | 'envSources'>,
  key: string,
  fallback?: { url?: string; detail?: string; name?: string }
): SourceConfig | undefined {
  const found = store.customAPIs.find((a) => a.key === key) ?? store.envSources.find((a) => a.key === key);
  if (found) return found;
  if (fallback?.url) {
    return {
      key,
      name: fallback.name || '自定义源',
      url: fallback.url,
      detail: fallback.detail,
    };
  }
  return undefined;
}

/**
 * 源当前是否处于自动停用期（连续超时/失败触发）。
 * 临时停用到期后此判断自然翻转为 false，即「到期自动恢复参与搜索」的懒实现；
 * 长期停用（阶梯用尽）没有到期时间，只有手动恢复（clearSourceHealth）才能解除。
 */
export function isSourceDisabled(
  state: Pick<AppState, 'sourceHealth'>,
  key: string,
  now = Date.now()
): boolean {
  const e = state.sourceHealth[key];
  if (!e) return false;
  return e.permanent === true || (!!e.disabledUntil && e.disabledUntil > now);
}

/**
 * 读取某「源 + 影片」的画质记录（直接查内存态，不订阅 store）。
 * 结果列表一次可能有十几张卡片 × 十几个来源，订阅整个 map 会让每次探测
 * 结果都触发所有卡片重渲染，因此只在展开面板 / 探测回调时用 getState 读。
 */
export function readQuality(sourceKey: string, vodId: string): QualityEntry | undefined {
  const entry = useAppStore.getState().qualityMap[qualityKey(sourceKey, vodId)];
  // 过期条目按「没有结论」处理：持久化回来后 TTL 只在写入时清理过，
  // 直接返回会让旧画质一直显示，且因为被认为已有结论而永远不重探
  return entry && isQualityEntryFresh(entry) ? entry : undefined;
}

/** 批量读取：一次拿多个「源 + 影片」的画质，避免逐个 getState */
export function readQualities(pairs: Array<{ sourceKey: string; vodId: string }>): Record<string, QualityEntry> {
  const map = useAppStore.getState().qualityMap;
  const out: Record<string, QualityEntry> = {};
  for (const p of pairs) {
    const key = qualityKey(p.sourceKey, p.vodId);
    const entry = map[key];
    if (entry && isQualityEntryFresh(entry)) out[key] = entry;
  }
  return out;
}

/**
 * 源是否来自一个被用户整体停用的订阅。
 * 与 isSourceDisabled 分开判断：一个是用户主动关的、一个是系统按连续失败关的，
 * 提示文案与恢复方式都不同，混在一起用户就看不懂源为什么不生效了。
 */
export function isInDisabledSubscription(
  state: Pick<AppState, 'subscriptions'>,
  key: string
): boolean {
  return state.subscriptions.some(
    (s) => s.enabled === false && keyBelongsToSubscription(key, subKeyPrefix(s.url))
  );
}
