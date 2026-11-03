import type { TvboxConfigExtras } from './tvbox-config';

/**
 * 类型层的 TVBOX 依赖走 `import type`：编译后该语句整体消失，
 * 因此 types.ts 不产生对 tvbox-config 的运行时依赖，不存在循环加载
 * （tvbox-config 与 tvbox-parser 在运行时都只依赖各自的纯逻辑模块）。
 */

// 采集站（Apple CMS 资源站）描述
export interface SourceConfig {
  /** 唯一标识，如 "custom_0"；内置源直接用短名 */
  key: string;
  name: string;
  /** API 根地址，如 https://example.com/api.php/provide/vod */
  url: string;
  /** 可选：详情页根地址（部分源需要爬详情页提取 m3u8） */
  detail?: string;
  isAdult?: boolean;
}

export interface SearchResultItem {
  sourceKey: string;
  sourceName: string;
  vodId: string;
  name: string;
  pic?: string;
  typeName?: string;
  year?: string;
  area?: string;
  remarks?: string;
  /** 自定义源的 API 地址，详情请求需要 */
  sourceUrl?: string;
  isAdult?: boolean;
}

export interface VideoInfo {
  title?: string;
  cover?: string;
  desc?: string;
  typeName?: string;
  year?: string;
  area?: string;
  director?: string;
  actor?: string;
  remarks?: string;
  sourceKey: string;
  sourceName: string;
  sourceUrl?: string;
}

export interface VideoDetail {
  episodes: string[];
  videoInfo: VideoInfo;
}

export interface DoubanItem {
  id: string;
  title: string;
  cover: string;
  rating?: string;
  isTv?: boolean;
}

export interface SourceSearchOutcome {
  sourceKey: string;
  ok: boolean;
  list: SearchResultItem[];
  error?: string;
  /** 因超时失败：源可能只是慢，前端以琥珀色区分于真正的失败 */
  timedOut?: boolean;
  /** 该源搜索总耗时（ms），用于健康徽章 */
  ms?: number;
}

// —— 画质（按「源 + 影片」记录） ——

/**
 * 画质记录条目。
 * `height` 为视频高度（像素），undefined 表示探测过但测不出（单码率 m3u8 / 直链）。
 * `from` 区分来源：play 是播放器实测的真实分辨率（权威），probe 是解析 m3u8 推断值。
 */
export interface QualityEntry {
  height?: number;
  from: 'play' | 'probe';
  /**
   * 探测失败原因（如 `HTTP 403`、`请求超时`）。
   * 有值 = 这次压根没探到；无值而 height 也缺失 = 探到了但源站没写画质信息。
   * 两者在 UI 上都显示「未知」，靠这个字段区分出「源站不给」和「我们没够着」。
   */
  error?: string;
  /** 记录时间（epoch ms），用于 LRU 淘汰与失败重试 */
  timestamp: number;
}

/** 画质探测请求条目：源配置 + 影片 ID */
export interface QualityProbeItem {
  source: SourceConfig;
  id: string;
}

/** 画质探测结果；height 缺失代表「测不出」而非失败失败（error 有值时才是失败） */
export interface QualityProbeResult {
  sourceKey: string;
  vodId: string;
  height?: number;
  error?: string;
}

// —— API 响应结构 ——

export interface SearchResponse {
  list: SearchResultItem[];
  failures: { sourceKey: string; error: string; timedOut?: boolean }[];
}

/** /api/search?stream=1 的 NDJSON 事件：逐源推送 + 最终聚合 */
export type SearchStreamEvent =
  | ({ type: 'source' } & SourceSearchOutcome)
  | { type: 'done'; list: SearchResultItem[]; failures: SearchResponse['failures'] };

export interface DoubanResponse {
  items: DoubanItem[];
}

export interface BangumiCalendarDay {
  /** 1=周一 … 7=周日 */
  weekday: number;
  items: DoubanItem[];
}

export interface BangumiCalendarResponse {
  days: BangumiCalendarDay[];
}

/** /api/status 响应：仅保留构建时注入的应用版本 */
export interface AuthStatusResponse {
  version: string;
}

// —— 直播 / IPTV ——

/** 直播源（M3U 订阅）配置 */
export interface LiveSourceConfig {
  key: string;
  name: string;
  /** M3U 订阅地址 */
  url: string;
  /** 可选：XMLTV 节目单地址 */
  epg?: string;
}

/** 单个直播频道（由 M3U 解析得到） */
export interface LiveChannel {
  /** tvg-id 优先，缺失时由 URL 生成的稳定短 id */
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
  tvgId?: string;
  /** M3U 的 tvg-name 属性（原始台名） */
  rawName?: string;
}

export interface LivePlaylistResponse {
  /** 订阅名（M3U 无名时为空） */
  name?: string;
  channels: LiveChannel[];
  groups: string[];
}

// —— 数据源订阅 ——

/** 订阅条目未被导入（跳过）的原因分类 */
export type SubscriptionSkipReason =
  /** Spider 类站点（csp_* / jar / js / py），需 TVBOX 引擎才能运行 */
  | 'spider'
  /** 仅提供 XML 接口或不支持的类型 */
  | 'xml'
  /** 站点自身标记为不可搜索（本站只有搜索入口，导入后无法使用） */
  | 'unsearchable'
  /**
   * 直播源是**单仓 JSON**（`{group, channels}` 或 `type:1` / `.json` 地址），
   * 需要 TVBOX 的聚合逻辑，本站不解析。
   *
   * 注意：**不再代表「非 M3U」**。`.txt` 与无扩展名的播放列表一律放行，
   * 真实格式由服务端按内容嗅探（实测 `jinenge/tvbox` 的 `./lib/interface.txt`
   * 内容就是标准 M3U），按扩展名拒绝会误杀可用源。
   */
  | 'nonM3uLive'
  /** 接口目录条目自身标记 enabled: false（发布者主动停用，不是异常） */
  | 'disabled'
  /** 地址非法、非 http(s) 或未通过服务端公网校验 */
  | 'invalidUrl';

/** 订阅解析统计：说明跳过与截断情况，用于导入结果提示 */
export interface SubscriptionParseStats {
  /** 识别出的订阅格式 */
  format: 'libretv' | 'tvbox' | 'source-catalog';
  /** 被跳过的条目总数 */
  skipped: number;
  /** 跳过原因分类计数 */
  skippedByReason: Partial<Record<SubscriptionSkipReason, number>>;
  /** 被跳过条目的名称示例（最多 3 个），便于用户定位 */
  skippedSamples?: string[];
  /** 因超出数量上限被截断的条目数 */
  truncated: number;
}

/**
 * 远程订阅解析结果。
 * `sources` 为点播源（Apple CMS 采集站），`liveSources` 为直播源（M3U + 可选 EPG）。
 * 兼容三种订阅格式：LibreTV-SourceList JSON、TVBOX 配置 JSON（`sites` / `lives`）、
 * 接口目录（裸数组 `{name, baseUrl, enabled}`，仅点播）。
 * 老格式订阅只有 `sources`，此时 `liveSources` 为空数组。
 */
export interface SourceListPayload {
  /** 订阅列表自带名称 */
  name?: string;
  sources: Omit<SourceConfig, 'key'>[];
  liveSources: Omit<LiveSourceConfig, 'key'>[];
  /** 解析统计（格式、跳过与截断），老数据可能缺失 */
  stats?: SubscriptionParseStats;
  /**
   * TVBOX 配置的附加信息（解析线路、平台白名单、壁纸、站点索引、形态统计）。
   * 仅当订阅内容被识别为 TVBOX 配置时存在；LibreTV 源列表与接口目录不携带该字段，
   * 老消费方读不到它会照旧工作。
   */
  tvbox?: TvboxConfigExtras;
}
