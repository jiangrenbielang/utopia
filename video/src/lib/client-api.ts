'use client';

import type { SearchResponse, SearchStreamEvent, SourceSearchOutcome, VideoDetail, DoubanResponse, BangumiCalendarResponse, SourceConfig, SearchResultItem, LivePlaylistResponse, SourceListPayload, QualityProbeItem, QualityProbeResult } from './types';
import type { CategoryClassesResponse, CategoryListResponse } from './cms-category';
import type { ParseOutcome } from './parse-url';

/**
 * 客户端 API 封装：统一的 JSON / NDJSON 传输与错误包装。
 */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** /api/status 的 React Query key：供需要读取站点状态的页面共用，避免重复请求 */
export const STATUS_QUERY_KEY = ['app-status'] as const;

/** NDJSON 流读取：按行解析 JSON 并回调，坏行跳过不影响其余结果 */
async function consumeNdjson<T>(res: Response, onEvent: (event: T) => void): Promise<void> {
  if (!res.body) throw new ApiError(`请求失败 (${res.status})`, res.status);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const consume = (line: string) => {
    const text = line.trim();
    if (!text) return;
    try {
      onEvent(JSON.parse(text) as T);
    } catch {
      // 坏行跳过，不影响其余结果
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      consume(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 1);
    }
  }
  buffer += decoder.decode();
  consume(buffer);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError('网络请求失败，请检查网络连接', 0);
  }
  if (!res.ok) {
    let msg = `请求失败 (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) msg = data.error;
    } catch { /* 忽略解析失败 */ }
    throw new ApiError(msg, res.status);
  }
  return (await res.json()) as T;
}

/**
 * `/api/parse` 的响应。
 *
 * 用 `ok` + `kind` 而不是「成功/异常」二分：`needs-browser` 是**可预期的正常结果**
 * （该线路是浏览器嗅探类），把它当错误会让用户以为线路坏了。
 */
export type ParseResponse =
  | { ok: true; kind: 'resolved'; url: string; header?: Record<string, string> }
  | {
      ok: false;
      kind: Exclude<ParseOutcome['kind'], 'resolved'>;
      message: string;
      /** 上游 HTTP 状态，便于区分「线路挂了」与「线路跑不了」 */
      upstreamStatus?: number;
    };

/** 百度网盘绑定状态（服务端只回报是否已绑定，不回报令牌） */
export interface NetdiskStatus {
  configured: boolean;
  redirectUri?: string;
}

/** 网盘目录条目 */
export interface NetdiskEntry {
  fsId: number;
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  /** 容器是 mp4 / m3u8 / ts —— 浏览器可解码 */
  playable: boolean;
  modified?: string;
}

/**
 * 网盘视频的播放地址（本平台同源，服务端带百度要求的 UA 转发并支持 Range）。
 *
 * 额外带上 `name`：播放器据此判断这是 mp4 还是 m3u8（决定走原生播放还是 hls.js），
 * 也方便排查问题时一眼看出是哪一讲。
 */
export function netdiskStreamUrl(fsId: number, name?: string): string {
  const suffix = name ? `&name=${encodeURIComponent(name)}` : '';
  return `/api/netdisk/stream?fsid=${fsId}${suffix}`;
}

export const api = {
  /** 百度网盘绑定状态 */
  netdiskStatus: (signal?: AbortSignal) => request<NetdiskStatus>('/api/netdisk/status', { signal }),

  /** 取授权链接（百度页面直接显示授权码） */
  netdiskAuthUrl: (signal?: AbortSignal) =>
    request<{ url: string; redirectUri: string }>('/api/netdisk/auth-url', { signal }),

  /** 提交授权码，服务端换取并保存 refresh_token */
  netdiskSubmitCode: (code: string, redirectUri?: string) =>
    request<{ configured: boolean }>('/api/netdisk/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirectUri }),
    }),

  /** 列网盘目录 */
  netdiskList: (dir: string, signal?: AbortSignal) =>
    request<{ dir: string; entries: NetdiskEntry[] }>('/api/netdisk/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir }),
      signal,
    }),

  /** 递归扫描目录里的视频（服务端已按自然序排好），用于「目录 → 课程章节」 */
  netdiskScan: (dir: string, signal?: AbortSignal) =>
    request<{ dir: string; count: number; truncated: boolean; scannedDirs: number; videos: NetdiskEntry[] }>(
      '/api/netdisk/scan',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir }),
        signal,
      }
    ),

  /** 解绑 */
  netdiskLogout: () => request<{ configured: boolean }>('/api/netdisk/logout', { method: 'POST' }),

  /**
   * 聚合搜索。传入 onSource 时走 /api/search?stream=1 的 NDJSON 流：
   * 每个源结算立即回调（健康源结果不再等坏源超时），最终以聚合结果 resolve。
   * 未传 onSource 或流不可用时回退为一次性 JSON 请求。
   */
  search: async (
    wd: string,
    sources: SourceConfig[],
    filterAdult: boolean,
    opts?: { signal?: AbortSignal; onSource?: (outcome: SourceSearchOutcome) => void }
  ): Promise<SearchResponse> => {
    const signal = opts?.signal;
    const onSource = opts?.onSource;
    if (!onSource) {
      return request<SearchResponse>('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wd, sources, filterAdult }),
        signal,
      });
    }
    return searchStream(wd, sources, filterAdult, onSource, signal);
  },

  detail: (id: string, source: SourceConfig, signal?: AbortSignal) => {
    const sp = new URLSearchParams({ id, source: JSON.stringify(source) });
    return request<VideoDetail>(`/api/detail?${sp.toString()}`, { signal });
  },

  /**
   * 批量画质探测（NDJSON 流式）：展开来源面板时逐条回调，先到的源先显示画质。
   * 结果里的 height 缺失代表「测不出」（单码率 m3u8 / 直链 / 防盗链），不是失败。
   *
   * 传输层失败（请求没发出去 / 流中途断开）不再原样冒泡：调用方原先只能静默成
   * 「未测到」，线上出问题时无法区分「网关拦了」「容器崩了」「探测本身失败」。
   * 服务端开流即写一行心跳，收到过首字节说明请求确实进了应用，据此给出不同文案。
   */
  qualityProbeStream: async (
    items: QualityProbeItem[],
    onResult: (result: QualityProbeResult) => void,
    signal?: AbortSignal
  ): Promise<void> => {
    let res: Response;
    try {
      res = await fetch('/api/quality?stream=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
        signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      throw new ApiError('探测请求没能送达服务器（网络或反向代理中断）', 0);
    }
    if (!res.ok || !res.body) throw new ApiError(`请求失败 (${res.status})`, res.status);

    let firstByte = false;
    try {
      await consumeNdjson<QualityProbeResult | { ping: true }>(res, (event) => {
        // 心跳行不是结果：收到它就证明请求确实进了 Next，后面的失败才归因于探测本身
        if ('ping' in event) {
          firstByte = true;
          return;
        }
        firstByte = true;
        onResult(event);
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      throw new ApiError(
        firstByte
          ? '探测连接中途被断开（已收到部分结果，多为网关超时）'
          : '探测请求被网关拦截（未收到任何响应）',
        0
      );
    }
  },

  douban: (type: 'movie' | 'tv', tag: string, pageStart: number, pageSize: number, signal?: AbortSignal) => {
    const sp = new URLSearchParams({ type, tag, pageStart: String(pageStart), pageSize: String(pageSize) });
    return request<DoubanResponse>(`/api/douban?${sp.toString()}`, { signal });
  },

  /** Bangumi 每日放送（免 key），首页推荐的另一数据源 */
  bangumiCalendar: (signal?: AbortSignal) => request<BangumiCalendarResponse>('/api/bangumi/calendar', { signal }),

  /** 影视热榜（60s API 免 key）：豆瓣周榜五个类目 + 百度热播剧 */
  hotList: (id: string, signal?: AbortSignal) => {
    const sp = new URLSearchParams({ id });
    return request<DoubanResponse>(`/api/hot-list?${sp.toString()}`, { signal });
  },

  /** 换源：按标题跨源搜索并取详情，附带接口耗时（测速）；支持 signal 以便关闭弹窗时中止在途请求 */
  detailSpeed: async (id: string, source: SourceConfig, signal?: AbortSignal) => {
    const start = performance.now();
    try {
      const detail = await api.detail(id, source, signal);
      return { ok: true, ms: Math.round(performance.now() - start), detail };
    } catch (err) {
      return { ok: false, ms: Math.round(performance.now() - start), detail: undefined as VideoDetail | undefined, error: err instanceof Error ? err.message : '失败' };
    }
  },

  /** 点播源探活：以搜索 "test" 的耗时与结果量衡量可用性 */
  testSource: (url: string) =>
    request<{ ok: boolean; ms: number; count?: number; error?: string }>('/api/source/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }),

  /** 拉取远程数据源订阅（自动识别 LibreTV-SourceList JSON 与 TVBOX 配置 JSON） */
  fetchSourceList: (url: string) => {
    const sp = new URLSearchParams({ url });
    return request<SourceListPayload>(`/api/source-list?${sp.toString()}`);
  },

  /**
   * 分类浏览（TVBox 范式）：站点 → 分类 → 筛选 → 分页。
   * 站点的 api 地址直接来自已导入的点播源（`SourceConfig.url`）。
   */

  /** 分类 tab 数据源（`class=1`）：分类列表 + 该站点的筛选定义 */
  categoryClasses: (url: string, signal?: AbortSignal) => {
    const sp = new URLSearchParams({ url, class: '1' });
    return request<CategoryClassesResponse>(`/api/category?${sp.toString()}`, { signal });
  },

  /** 某分类的分页列表；`filters` 传当前筛选键值对（服务端序列化为 JSON 透传上游） */
  category: (
    url: string,
    opts: {
      classId?: string;
      page?: number;
      filters?: Record<string, string>;
      /** true 表示保留成人内容（默认沿用站内口径：过滤） */
      adult?: boolean;
    } = {},
    signal?: AbortSignal
  ) => {
    const sp = new URLSearchParams({ url });
    if (opts.classId) sp.set('t', opts.classId);
    if (opts.page !== undefined) sp.set('pg', String(opts.page));
    if (opts.filters && Object.keys(opts.filters).length > 0) sp.set('f', JSON.stringify(opts.filters));
    if (opts.adult) sp.set('adult', '1');
    return request<CategoryListResponse>(`/api/category?${sp.toString()}`, { signal });
  },

  /**
   * 用一条 TVBOX 解析线路换真实播放地址。
   *
   * 注意结果用 `ok` + `kind` 区分：`needs-browser` 表示该线路返回的是播放页
   * （需要浏览器执行脚本嗅探媒体请求），本客户端跑不了——这不是请求失败，
   * 调用方应按「该线路不适用」提示，而不是当错误弹。
   */
  parse: (parseUrl: string, target: string, signal?: AbortSignal) =>
    request<ParseResponse>('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parseUrl, target }),
      signal,
    }),

  /** 把源列表发布到公开粘贴板换回订阅链接（走服务端代理：绕开 CORS，且目标域名固定不可控） */
  publishSourceList: (payload: {
    name?: string;
    sources: { name: string; url: string }[];
    liveSources: { name: string; url: string; epg?: string }[];
  }) =>
    request<{ url: string; provider: string; sources: number; liveSources: number }>('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** —— 直播 / IPTV（订阅管理与导出） —— */

  /** 拉取并解析 M3U 订阅；force=1 跳过服务端缓存 */
  livePlaylist: (url: string, force = false, signal?: AbortSignal) => {
    const sp = new URLSearchParams({ url });
    if (force) sp.set('force', '1');
    return request<LivePlaylistResponse>(`/api/live/playlist?${sp.toString()}`, { signal });
  },

  /** 直播订阅探活：以拉取解析耗时与频道数衡量可用性 */
  liveTest: async (url: string) => {
    const start = performance.now();
    try {
      const playlist = await api.livePlaylist(url, true);
      return { ok: true, ms: Math.round(performance.now() - start), count: playlist.channels.length, error: undefined as string | undefined };
    } catch (err) {
      return { ok: false, ms: Math.round(performance.now() - start), count: 0, error: err instanceof Error ? err.message : '失败' };
    }
  },

  /** 订阅导出（.m3u）下载地址 */
  liveExportUrl: (url: string) => {
    const sp = new URLSearchParams({ url, format: 'm3u' });
    return `/api/live/playlist?${sp.toString()}`;
  },
};

export interface SearchFailure {
  sourceKey: string;
  error: string;
  timedOut?: boolean;
}

/** 聚合搜索流式消费：逐源回调 + 最终聚合结果（NDJSON 行协议） */
async function searchStream(
  wd: string,
  sources: SourceConfig[],
  filterAdult: boolean,
  onSource: (outcome: SourceSearchOutcome) => void,
  signal?: AbortSignal
): Promise<SearchResponse> {
  const res = await fetch('/api/search?stream=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wd, sources, filterAdult }),
    signal,
  });
    if (!res.ok || !res.body) throw new ApiError(`请求失败 (${res.status})`, res.status);

    // done 事件缺失（流被截断）时退化为空结果，不让整次搜索报错
    let final: SearchResponse = { list: [], failures: [] };
    await consumeNdjson<SearchStreamEvent>(res, (event) => {
      if (event.type === 'source') {
        onSource(event);
      } else if (event.type === 'done') {
        final = { list: event.list, failures: event.failures };
      }
    });
    return final;
  }

export type { SearchResponse, SearchResultItem };
