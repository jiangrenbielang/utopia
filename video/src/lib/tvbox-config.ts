import type { SourceListPayload, SubscriptionParseStats } from './types';
import { isTvboxPayload, parseTvboxPayload } from './tvbox-parser';

/**
 * TVBOX 配置（接口）的**完整**数据层。
 *
 * `tvbox-parser.ts` 只回答「哪些条目能直接导入本站」（把 sites/lives 裁剪成
 * SourceListPayload）；本模块把整份配置**原样保留**，供客户端使用 TVBOX 的其余能力：
 * 解析线路（parses）、解析平台名单（flags）、壁纸（wallpaper）、站点扩展与请求头、
 * 广告域名（ads）、解码器配置（ijk）等。
 *
 * ## 字段语义取自真实配置抽样（已核对，非推测）
 *
 * 抽样对象：`scovis/TVBox` 的 `R18.json`（101 站点）、`jinenge/tvbox` 的
 * `app/tvbox/tvbox.json`（42 站点）、`home.jundie.top` 的 `top98.json`（24 站点）。
 * 据此确认的几条关键事实（决定了本模块的形状）：
 *
 * 1. **`flags` 是解析平台白名单，不是首页推荐分组**：真实取值形如
 *    `["youku","qq","iqiyi","letv","mgtv","bilibili"]`，对应各解析接口 `ext.flag`
 *    支持哪些平台。**不要**拿它去拼首页。
 * 2. **`sites[].categories` 在真实配置里几乎不出现**（24/101 站点抽样全为 0），
 *    因此首页分类/推荐只能来自站点自身的分类列表接口，不能依赖该字段。
 * 3. **真实源以 Spider 为主**：jinenge 42/42、top98 24/24 全是 `type:3`，纯 JS 客户端
 *    一个都跑不了；可用的 CMS 源集中在 `type:1`（JSON）与 `type:0`（XML）。
 * 4. `parses[].url` **可能是内置关键字**（`Parallel` / `Sequence` / `Web` / `Demo`），
 *    不是可请求地址；`type:2`/`type:3` 即聚合类解析。
 * 5. `lives[]` 有两种形状：普通播放列表 `{name,type,url,...}`（`url` **可能是相对路径**
 *    如 `./lib/iptv.m3u`，须相对配置地址解析），以及单仓 JSON
 *    `{group, channels:[{name, urls:[...]}]}`。
 * 6. `spider` 形如 `./lib/jinenge.jar;md5;1d7a…`（`;md5;` 后缀可选）。
 * 7. `sites[].ext` **可能是字符串也可能是对象**（如 `{"Cloud-drive":"tvfan/x.txt"}`）。
 * 8. `wallpaper` 可能是不带图片后缀的接口地址（如 `http://…/api/tvbox/img`）。
 *
 * ## 解析取向
 *
 * TVBOX 生态的配置由社区手写，字段缺失、类型写错都属常态（客户端用 fastjson 也能容忍），
 * 因此这里每个字段单独兜底，解析不出就留 undefined，**绝不因为一个字段写坏而丢掉整份
 * 配置**；原始对象挂在 `raw` 上，将来要读新字段不必改解析层。
 */

/** 站点/直播/解析的原始对象（未识别字段的逃生口） */
type RawObject = Record<string, unknown>;

/** 站点封面比例等展示参数（TVBOX 的 `style`；真实取值见过 `oval` / `list` / `rect`） */
export interface TvboxSiteStyle {
  type?: string;
  ratio?: number;
}

/** TVBOX `sites[]` 站点条目 */
export interface TvboxSite {
  key: string;
  name: string;
  /** 0=XML 接口，1=JSON 接口，3=Spider；4=外链。缺失表示配置未声明 */
  type?: number;
  api: string;
  searchable?: boolean;
  quickSearch?: boolean;
  /**
   * 是否支持分类筛选。**注意**：FongMi 分支的 `Site` 里并没有 `filterable` / `filter`
   * 字段——分类筛选实际来自**分类响应体里的 `filters`**（按分类 id 索引），
   * 客户端据此渲染筛选栏并以 `f=<JSON>` 提交。这两个字段属 TVBox 原版遗留，
   * 这里保留只为兼容旧配置，UI 不应以它们为唯一依据。
   */
  filterable?: boolean;
  /** 见 `filterable` 的说明：原版遗留字段，结构由站点自定义，原样保留 */
  filter?: string | RawObject;
  /** 扩展参数：字符串或对象（Spider 站点常用对象承载私有配置） */
  ext?: string | RawObject;
  /** Spider 站点所需的 jar 地址 */
  jar?: string;
  playerType?: number;
  /** 首页/搜索结果里的首页推荐开关（真实配置里常见 `indexs:0`；`1` = 作为首页聚合入口） */
  indexs?: number;
  /** `1` = 在站点列表中隐藏（配置作者用它挂"仅搜索用"的站点） */
  hide?: boolean;
  /** 站点自带的分类名（真实配置里极少出现，缺失时由分类接口获取） */
  categories?: string[];
  style?: TvboxSiteStyle;
  /** 站点级请求头（防盗链、Referer、UA） */
  header?: Record<string, string>;
  timeout?: number;
  changeable?: boolean;
  raw: RawObject;
}

/** 单仓 JSON 直播源里的一个频道 */
export interface TvboxLiveChannel {
  name: string;
  /** 一个频道可挂多条地址 */
  urls: string[];
}

/** TVBOX `lives[]` 直播源条目（两种形状合一） */
export interface TvboxLive {
  name: string;
  /** 0=普通播放列表（m3u/txt），1=单仓 JSON；缺失表示配置未声明 */
  type?: number;
  /** 普通播放列表地址；单仓 JSON 形状下缺失 */
  url?: string;
  /** 单仓 JSON 形状下的分组名 */
  group?: string;
  /** 单仓 JSON 形状下的频道列表 */
  channels?: TvboxLiveChannel[];
  /** XMLTV 节目单地址，可能含 `{name}` / `{date}` 占位符 */
  epg?: string;
  logo?: string;
  ua?: string;
  header?: Record<string, string>;
  playerType?: number;
  timeout?: number;
  raw: RawObject;
}

/** TVBOX `parses[]` 解析线路条目 */
export interface TvboxParse {
  name: string;
  /**
   * 解析方式，默认 0。
   * **仅 `4`（超级解析）经 FongMi 源码确证**（`Parse.god()` 显式 `setType(4)`，
   * 且 `parses` 非空时会被自动插到列表首位）；0/1/2/3 的精确语义属社区说法，
   * 实现时不要依赖。
   */
  type?: number;
  /** 可能是真实地址，也可能是内置关键字（见 `builtin`） */
  url: string;
  /** 该 url 是否为 TVBOX 内置解析器关键字（内置于客户端，本站无法调用） */
  builtin: boolean;
  /**
   * `ext.flag`：**仅在当前线路名命中这些名字时才使用该解析器**。
   * 顶层 `flags` 是同一份「走解析的线路白名单」的另一处来源。
   */
  flag?: string[];
  /** 扩展参数（原始值，字符串或对象） */
  ext?: string | RawObject;
  header?: Record<string, string>;
  raw: RawObject;
}

/** TVBOX `flags[]` 的对象形态（真实配置里少见，保留以兼容） */
export interface TvboxFlag {
  key?: string;
  name: string;
  /** 选项文本，TVBOX 用 `$%$`（部分配置用 `$$$`）分隔 */
  value: string;
}

/** Spider jar 描述：`./lib/x.jar;md5;abc…` */
export interface TvboxSpider {
  /** 原始值 */
  value: string;
  /** 去掉 `;md5;` 后缀后的地址（可能是相对路径） */
  url: string;
  /** 声明的 md5（无则为 undefined） */
  md5?: string;
  /** 是否为相对路径（需相对配置地址解析；本站不运行 jar，仅用于提示） */
  relative: boolean;
}

/** 多仓格式里的一个仓库条目（`{"urls":[{"name","url"}]}`） */
export interface TvboxRepo {
  name?: string;
  url: string;
}

/** 完整配置 */
export interface TvboxConfig {
  name?: string;
  logo?: string;
  notice?: string;
  /**
   * 配置失效提示。**TVBOX 客户端读到 `msg` 会直接抛异常中止加载**
   * （用于配置作者宣告"本接口已失效"），因此这里单列出来供调用方判断，
   * 而不是当作普通公告。
   */
  msg?: string;
  /**
   * 多仓格式的仓库列表。与单仓格式（含 `sites`）互斥：客户端应取**第一个**仓库
   * 的地址作为真正的配置地址再加载一次。
   */
  repos?: TvboxRepo[];
  /** 壁纸地址；可能是不带图片后缀的接口地址，按图片直接用、失败即忽略 */
  wallpaper?: string;
  spider?: TvboxSpider;
  /** 广告域名/正则列表（可喂给本站既有的广告过滤） */
  ads: string[];
  /** `flags` 的字符串形态：解析平台白名单（youku / qq / iqiyi …） */
  platforms: string[];
  /** `flags` 的对象形态：分组选项 */
  flagGroups: TvboxFlag[];
  sites: TvboxSite[];
  lives: TvboxLive[];
  parses: TvboxParse[];
  /** 解码器配置（TVBOX 的 ijk），Web 端用不到，原样保留 */
  ijk?: unknown;
  rules?: unknown;
  hosts?: unknown;
  headers?: Record<string, string>;
  raw: RawObject;
}

/** 站点可用性判定（供 UI 徽标与统计；口径与 tvbox-parser 的导入判定保持一致） */
export type TvboxSiteKind =
  /** type=1（或地址命中 Apple CMS JSON 特征）：本站可直接使用 */
  | 'json'
  /** type=0 且不是 JSON 接口：XML 接口，本站不解析 */
  | 'xml'
  /** type=3 或 csp_/jar/js/py：需要 TVBOX 引擎（JVM/QuickJS），本站不可运行 */
  | 'spider'
  /** type=4：外链站点，需站点自带嗅探逻辑，本站不实现 */
  | 'external'
  /** 地址非法或无法判断 */
  | 'unknown';

/**
 * 直播源形态。
 *
 * 注意：**不按扩展名区分 m3u / txt**——实测 `jinenge/tvbox` 的 `./lib/interface.txt`
 * 内容就是标准 M3U，按扩展名判定会把可用源误判为不支持。格式由 `tvbox-live.ts`
 * 在拉取后按内容嗅探。
 */
export type TvboxLiveKind =
  /** 普通播放列表（m3u/txt 皆可，内容嗅探）：本站可直接使用 */
  | 'playlist'
  /** 单仓 JSON（group/channels）：本站不解析 */
  | 'single-file'
  /** 地址缺失或类型无法判断 */
  | 'unknown';

/** 配置解析结果 */
export interface TvboxConfigParsed {
  config: TvboxConfig;
  /**
   * 可直接导入本站的条目（CMS 点播站 + M3U 直播源）与跳过统计；
   * 一份全是 Spider 站点的配置（jinenge / top98 就是）拿不到 payload——
   * 解析器会抛错，此时为 null，原因写在 `importError`，配置本身仍然可用。
   */
  payload: SourceListPayload | null;
  importError?: string;
  /** 配置含 `msg`：TVBOX 客户端会中止加载，本站同样视为失效配置 */
  blocked: boolean;
  /** 站点形态计数 */
  siteKinds: Record<TvboxSiteKind, number>;
  liveKinds: Record<TvboxLiveKind, number>;
  /** 本站无法直接使用的条目总数（Spider / XML / 单仓 JSON / txt 等） */
  unsupported: number;
}

const SITE_TYPE_XML = 0;
const SITE_TYPE_JSON = 1;
/** JSON 采集变体：FongMi 的 `Result.fromType()` 与 type=1 走同一分支，一样可导入 */
const SITE_TYPE_JSON_VARIANT = 2;
const SITE_TYPE_SPIDER = 3;
const SITE_TYPE_EXTERNAL = 4;

const LIVE_TYPE_PLAYLIST = 0;
const LIVE_TYPE_SINGLE_FILE = 1;

/** Spider 特征：csp_ 前缀，或 jar / js / py 资源（含查询串） */
const SPIDER_PATTERN = /^csp_|\.(?:jar|js|py)(?:[?#].*)?$/i;
/** 非 http(s) 的相对/本地资源同样需要 TVBOX 引擎 */
const LOCAL_ASSET_PATTERN = /^\.{0,2}\//;
/** Apple CMS JSON 接口特征（类型缺失或写成 XML / 外链时用于宽容识别） */
const CMS_API_PATTERN = /\/api\.php\/provide\/vod(?![^?#]*\/at\/xml)(?:[/?#]|$)/i;
const M3U_PATTERN = /\.m3u8?(?:[?#].*)?$/i;
const TXT_PATTERN = /\.txt(?:[?#].*)?$/i;
const JSON_PATTERN = /\.json(?:[?#].*)?$/i;

/**
 * TVBOX 内置解析器关键字：这些 `parses[].url` 不是地址，而是客户端内置的聚合解析器，
 * 本站无从调用（抽样中真实出现过 `Parallel` / `Sequence` / `Web` / `Demo`）。
 * 判定用小写全等，避免把真实域名误判。
 */
const BUILTIN_PARSE_URLS = new Set(['parallel', 'sequence', 'web', 'demo', 'json', 'json并发', 'json轮询']);

/** TVBOX 的分组选项分隔符（社区配置里两种都出现过） */
const FLAG_SEPARATORS = ['$%$', '$$$'];

/** 安全取对象：仅接受纯对象（排除数组与 null） */
function asObject(value: unknown): RawObject | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as RawObject;
}

/** 取非空字符串（去首尾空白），否则 undefined */
function str(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/** 取数字（容忍字符串数字） */
function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

/**
 * 取布尔开关：TVBOX 里同一开关可能写成 `1` / `"1"` / `true`，
 * 也可能写成 `0` / `"0"` / `false`。取不到时返回 undefined（「未声明」，
 * 与「显式关闭」区分开）。
 */
function bool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === '') return undefined;
    if (text === '0' || text === 'false') return false;
    if (text === '1' || text === 'true') return true;
    return undefined;
  }
  return undefined;
}

/** 取字符串数组（过滤空值；单个字符串也接受） */
function strList(value: unknown): string[] | undefined {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : undefined;
  if (!list) return undefined;
  const out = list.map((item) => str(item)).filter((item): item is string => !!item);
  return out.length > 0 ? out : undefined;
}

/** 取请求头对象（值统一转成字符串，丢弃空项） */
function headers(value: unknown): Record<string, string> | undefined {
  const record = asObject(value);
  if (!record) return undefined;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(record)) {
    const text = str(raw);
    if (text) out[key] = text;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** 取「字符串或对象」字段（`ext` / `filter`：真实配置里两种都出现过） */
function strOrObject(value: unknown): string | RawObject | undefined {
  const text = str(value);
  if (text) return text;
  return asObject(value);
}

/**
 * 把 TVBOX 配置里的相对地址解析成绝对地址。
 * 真实配置大量使用相对路径（`./lib/iptv.m3u`、`./jar/top98_1.jar`），
 * 必须相对**配置地址**（而不是页面地址）解析，否则会指到本站自身。
 * 绝对地址与 protocol 伪地址（`proxy://`）原样返回。
 */
export function resolveTvboxUrl(rawUrl: string | undefined, configUrl: string | undefined): string | undefined {
  const value = str(rawUrl);
  if (!value) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  if (!configUrl) return value;
  try {
    return new URL(value, configUrl).toString();
  } catch {
    return value;
  }
}

/** 解析 `spider`：`./lib/x.jar;md5;abc…` → 地址 + md5 */
export function parseTvboxSpider(value: unknown): TvboxSpider | undefined {
  const text = str(value);
  if (!text) return undefined;
  const [rawUrl, marker, md5] = text.split(';');
  const url = str(rawUrl) ?? text;
  return {
    value: text,
    url,
    md5: marker?.toLowerCase() === 'md5' ? str(md5) : undefined,
    relative: LOCAL_ASSET_PATTERN.test(url),
  };
}

/** 站点形态判定：优先看显式 type，type 缺失或写坏时用地址特征兜底 */
export function tvboxSiteKind(site: Pick<TvboxSite, 'type' | 'api'>): TvboxSiteKind {
  const api = site.api;
  if (site.type === SITE_TYPE_SPIDER || SPIDER_PATTERN.test(api)) return 'spider';
  if (!/^https?:\/\//i.test(api)) {
    return LOCAL_ASSET_PATTERN.test(api) ? 'spider' : 'unknown';
  }
  if (site.type === SITE_TYPE_JSON || site.type === SITE_TYPE_JSON_VARIANT) return 'json';
  // 本站点播链路只吃 Apple CMS 的 JSON 输出；address 命中该特征时按可用处理，
  // 与 tvbox-parser 的宽容导入口径一致
  if (site.type === SITE_TYPE_XML) return CMS_API_PATTERN.test(api) ? 'json' : 'xml';
  if (site.type === SITE_TYPE_EXTERNAL) return 'external';
  return CMS_API_PATTERN.test(api) ? 'json' : 'unknown';
}

/** 直播源形态判定 */
export function tvboxLiveKind(live: Pick<TvboxLive, 'type' | 'url' | 'channels'>): TvboxLiveKind {
  if (live.channels && live.channels.length > 0) return 'single-file';
  const url = live.url;
  if (!url) return live.type === LIVE_TYPE_SINGLE_FILE ? 'single-file' : 'unknown';
  if (live.type === LIVE_TYPE_SINGLE_FILE) return 'single-file';
  // 带 `.json` 后缀的播放列表地址：实测形态是单仓 JSON，客户端不解析
  if (JSON_PATTERN.test(url)) return 'single-file';
  // type 明确写 0、或地址像播放列表（m3u/txt，甚至没有扩展名）都按可用处理，
  // 真实格式交给内容嗅探——扩展名不可信
  if (live.type === LIVE_TYPE_PLAYLIST || M3U_PATTERN.test(url) || TXT_PATTERN.test(url)) return 'playlist';
  return 'unknown';
}

/** 直播源扩展名提示（仅用于 UI 展示，不代表真实格式） */
export function tvboxLiveExtensionHint(live: Pick<TvboxLive, 'url'>): 'm3u' | 'txt' | undefined {
  const url = live.url;
  if (!url) return undefined;
  if (M3U_PATTERN.test(url)) return 'm3u';
  if (TXT_PATTERN.test(url)) return 'txt';
  return undefined;
}

/** 站点是否为本站可直接使用的形态（JSON CMS） */
export function isTvboxSiteSupported(site: Pick<TvboxSite, 'type' | 'api'>): boolean {
  return tvboxSiteKind(site) === 'json';
}

/** 直播源是否为本站可直接使用的形态（普通播放列表，具体格式内容嗅探） */
export function isTvboxLiveSupported(live: Pick<TvboxLive, 'type' | 'url' | 'channels'>): boolean {
  return tvboxLiveKind(live) === 'playlist';
}

/** 拆解对象形态 flag 的候选项：TVBOX 用 `$%$`（部分配置用 `$$$`）分隔 */
export function tvboxFlagOptions(flag: Pick<TvboxFlag, 'value'>): string[] {
  let text = flag.value;
  for (const separator of FLAG_SEPARATORS) {
    if (text.includes(separator)) text = text.split(separator).join('\n');
  }
  return text
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

/** 解析 sites[] */
function parseSites(value: unknown, configUrl: string | undefined): TvboxSite[] {
  if (!Array.isArray(value)) return [];
  const out: TvboxSite[] = [];
  for (const item of value) {
    const raw = asObject(item);
    if (!raw) continue;
    const api = str(raw.api);
    // 没有 api 的站点在本站毫无用处（TVBOX 里也等同不可用），直接丢弃
    if (!api) continue;
    const name = str(raw.name);
    const style = asObject(raw.style);
    const header = headers(raw.header);
    out.push({
      // key 是 TVBOX 的站点标识，缺失时退回名称保证可用
      key: str(raw.key) ?? name ?? api,
      name: name ?? str(raw.key) ?? api,
      type: num(raw.type),
      // api 可能是相对资源（csp_ / ./xx.jar），不解析成绝对地址——那类站点本站本就不能用
      api,
      searchable: bool(raw.searchable),
      quickSearch: bool(raw.quickSearch),
      filterable: bool(raw.filterable),
      filter: strOrObject(raw.filter),
      ext: strOrObject(raw.ext),
      jar: resolveTvboxUrl(str(raw.jar), configUrl),
      playerType: num(raw.playerType),
      indexs: num(raw.indexs),
      hide: bool(raw.hide),
      categories: strList(raw.categories),
      style: style ? { type: str(style.type), ratio: num(style.ratio) } : undefined,
      header,
      timeout: num(raw.timeout),
      changeable: bool(raw.changeable),
      raw,
    });
  }
  return out;
}

/** 解析单仓 JSON 直播源的 channels[] */
function parseLiveChannels(value: unknown): TvboxLiveChannel[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: TvboxLiveChannel[] = [];
  for (const item of value) {
    const raw = asObject(item);
    if (!raw) continue;
    const urls = strList(raw.urls);
    if (!urls || urls.length === 0) continue;
    out.push({ name: str(raw.name) ?? urls[0], urls });
  }
  return out.length > 0 ? out : undefined;
}

/** 解析 lives[]；两种形状（普通播放列表 / 单仓 JSON）合并到同一结构 */
function parseLives(value: unknown, configUrl: string | undefined): TvboxLive[] {
  if (!Array.isArray(value)) return [];
  const out: TvboxLive[] = [];
  for (const item of value) {
    const raw = asObject(item);
    if (!raw) continue;
    const channels = parseLiveChannels(raw.channels);
    const url = str(raw.url);
    // 没有 url 也没有 channels 的条目没有任何用处
    if (!url && !channels) continue;
    out.push({
      name: str(raw.name) ?? str(raw.group) ?? url ?? '未命名直播源',
      type: num(raw.type),
      // 相对路径相对配置地址解析（真实配置里 `./lib/iptv.m3u` 很常见）
      url: resolveTvboxUrl(url, configUrl),
      group: str(raw.group),
      channels,
      epg: str(raw.epg),
      logo: str(raw.logo),
      ua: str(raw.ua),
      header: headers(raw.header),
      playerType: num(raw.playerType),
      timeout: num(raw.timeout),
      raw,
    });
  }
  return out;
}

/** 解析 parses[] */
function parseParses(value: unknown, configUrl: string | undefined): TvboxParse[] {
  if (!Array.isArray(value)) return [];
  const out: TvboxParse[] = [];
  for (const item of value) {
    const raw = asObject(item);
    if (!raw) continue;
    const url = str(raw.url);
    if (!url) continue;
    const ext = strOrObject(raw.ext);
    const builtin = BUILTIN_PARSE_URLS.has(url.toLowerCase());
    out.push({
      name: str(raw.name) ?? url,
      type: num(raw.type),
      // 内置关键字不是地址，只有真实地址才做相对解析
      url: builtin ? url : resolveTvboxUrl(url, configUrl) ?? url,
      builtin,
      flag: strList(asObject(ext)?.flag),
      ext,
      header: headers(raw.header) ?? headers(asObject(ext)?.header),
      raw,
    });
  }
  return out;
}

/**
 * 解析 flags[]：真实配置里绝大多数是**字符串数组**，取值是解析平台名
 * （`youku` / `qq` / `iqiyi` …），用于标注各解析线路支持哪些平台；
 * 少量配置用对象形态承载分组选项，一并保留。
 */
function parseFlags(value: unknown): { platforms: string[]; flagGroups: TvboxFlag[] } {
  if (!Array.isArray(value)) return { platforms: [], flagGroups: [] };
  const platforms: string[] = [];
  const flagGroups: TvboxFlag[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const text = str(item);
      if (text) platforms.push(text);
      continue;
    }
    const raw = asObject(item);
    if (!raw) continue;
    const optionValue = str(raw.value);
    if (!optionValue) continue;
    flagGroups.push({
      key: str(raw.key),
      name: str(raw.name) ?? str(raw.key) ?? optionValue,
      value: optionValue,
    });
  }
  return { platforms, flagGroups };
}

/** 解析多仓格式的 `urls[]`（真实结构 `[{name,url}]`） */
function parseRepos(value: unknown, configUrl: string | undefined): TvboxRepo[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: TvboxRepo[] = [];
  for (const item of value) {
    const raw = asObject(item);
    if (!raw) continue;
    const url = resolveTvboxUrl(str(raw.url), configUrl);
    if (!url) continue;
    out.push({ name: str(raw.name), url });
  }
  return out.length > 0 ? out : undefined;
}

/** 判断一份 JSON 是否为 TVBOX 配置（与 tvbox-parser 同一判别口径） */
export function isTvboxConfig(json: unknown): boolean {
  return isTvboxPayload(json);
}

/** 把任意 JSON 归一化为完整的 TVBOX 配置 */
export function normalizeTvboxConfig(json: unknown, configUrl?: string): TvboxConfig {
  const raw = asObject(json) ?? {};
  const flags = parseFlags(raw.flags);
  return {
    name: str(raw.name),
    logo: resolveTvboxUrl(str(raw.logo), configUrl),
    notice: str(raw.notice),
    // `msg` 不是公告而是「本配置已失效」的宣告，见字段注释
    msg: str(raw.msg),
    // 多仓格式：与单仓（含 sites）互斥，调用方应取第一个仓库地址再加载一次
    repos: parseRepos(raw.urls, configUrl),
    // 壁纸可能是不带扩展名的接口地址，原样保留（做相对解析以免配置写了相对路径）
    wallpaper: resolveTvboxUrl(str(raw.wallpaper), configUrl),
    spider: parseTvboxSpider(raw.spider),
    ads: strList(raw.ads) ?? [],
    platforms: flags.platforms,
    flagGroups: flags.flagGroups,
    sites: parseSites(raw.sites, configUrl),
    lives: parseLives(raw.lives, configUrl),
    parses: parseParses(raw.parses, configUrl),
    ijk: raw.ijk,
    rules: raw.rules,
    hosts: raw.hosts,
    headers: headers(raw.headers),
    raw,
  };
}

/** 统计站点形态 */
function countSiteKinds(sites: TvboxSite[]): Record<TvboxSiteKind, number> {
  const counts: Record<TvboxSiteKind, number> = { json: 0, xml: 0, spider: 0, external: 0, unknown: 0 };
  for (const site of sites) counts[tvboxSiteKind(site)] += 1;
  return counts;
}

/** 统计直播源形态 */
function countLiveKinds(lives: TvboxLive[]): Record<TvboxLiveKind, number> {
  const counts: Record<TvboxLiveKind, number> = { playlist: 0, 'single-file': 0, unknown: 0 };
  for (const live of lives) counts[tvboxLiveKind(live)] += 1;
  return counts;
}

/**
 * 解析 TVBOX 配置：完整配置 + 可导入子集 + 统计。
 *
 * 可导入子集复用 `tvbox-parser.parseTvboxPayload`，保证「配置地址」与「订阅导入」两条
 * 入口对「哪些站点可用」的判断完全一致。该函数在没有任何可导入条目时会抛错，这里捕获
 * 成 `importError` 并把 payload 置空——配置里只剩 Spider 站点是社区常态（jinenge 与
 * top98 就是如此），不该让整次解析失败：UI 仍需照常展示壁纸、解析线路与跳过原因。
 */
export function parseTvboxConfig(json: unknown, configUrl?: string): TvboxConfigParsed {
  const config = normalizeTvboxConfig(json, configUrl);
  const siteKinds = countSiteKinds(config.sites);
  const liveKinds = countLiveKinds(config.lives);
  // 本站能直接用的是 JSON CMS 站点与普通播放列表直播源，其余（Spider/XML/单仓 JSON）都算不可用
  const unsupported = config.sites.length - siteKinds.json + (config.lives.length - liveKinds.playlist);

  let payload: SourceListPayload | null = null;
  let importError: string | undefined;

  if (config.msg) {
    // TVBOX 客户端读到 `msg` 会中止加载；多仓配置本身也不含站点，
    // 两种情况都不该再尝试导入，直接把原因交给调用方展示
    importError = `配置已声明失效：${config.msg}`;
  } else if (config.repos && config.repos.length > 0 && config.sites.length === 0) {
    importError = '这是多仓配置地址，需要改用其中某个仓库的地址';
  } else {
    try {
      payload = parseTvboxPayload(json, configUrl);
    } catch (error) {
      importError = error instanceof Error ? error.message : '配置解析失败';
    }
  }

  return { config, payload, importError, blocked: Boolean(config.msg), siteKinds, liveKinds, unsupported };
}

/** 多仓配置里应当加载的第一个仓库地址（单仓配置返回 undefined） */
export function tvboxFirstRepoUrl(config: Pick<TvboxConfig, 'repos'>): string | undefined {
  return config.repos?.[0]?.url;
}

/**
 * 需要客户端长期保留的附加信息（不含可导入源列表本身）。
 * 源列表由订阅机制写入 `customAPIs`；这里只留客户端其余能力要用的部分。
 */
export interface TvboxConfigExtras {
  name?: string;
  logo?: string;
  notice?: string;
  /** 配置声明失效的提示（`msg`）：有值就不该继续使用该配置 */
  msg?: string;
  wallpaper?: string;
  /** Spider jar 原始值：本站无法运行，仅用于提示用户配置里有部分站点不可用 */
  spider?: string;
  ads: string[];
  /** 解析平台白名单 */
  platforms: string[];
  parses: TvboxParse[];
  flagGroups: TvboxFlag[];
  /** 站点元信息（按 key 索引），供分类浏览与站点级请求头使用 */
  sites: Record<string, TvboxSite>;
  siteKinds: Record<TvboxSiteKind, number>;
  liveKinds: Record<TvboxLiveKind, number>;
  unsupported: number;
  stats?: SubscriptionParseStats;
}

/** 生成附加信息（供 /api/source-list 随 SourceListPayload 一起下发） */
export function tvboxConfigExtras(json: unknown, configUrl?: string): TvboxConfigExtras {
  const parsed = parseTvboxConfig(json, configUrl);
  const sites: Record<string, TvboxSite> = {};
  for (const site of parsed.config.sites) sites[site.key] = site;
  return {
    name: parsed.config.name,
    logo: parsed.config.logo,
    notice: parsed.config.notice,
    msg: parsed.config.msg,
    wallpaper: parsed.config.wallpaper,
    spider: parsed.config.spider?.value,
    ads: parsed.config.ads,
    platforms: parsed.config.platforms,
    parses: parsed.config.parses,
    flagGroups: parsed.config.flagGroups,
    sites,
    siteKinds: parsed.siteKinds,
    liveKinds: parsed.liveKinds,
    unsupported: parsed.unsupported,
    stats: parsed.payload?.stats,
  };
}

/** 附加信息是否「有内容」：全空没必要写进本地存储 */
export function hasTvboxExtras(extras: TvboxConfigExtras | undefined): boolean {
  if (!extras) return false;
  return (
    extras.parses.length > 0 ||
    extras.platforms.length > 0 ||
    extras.flagGroups.length > 0 ||
    Object.keys(extras.sites).length > 0 ||
    !!extras.wallpaper ||
    !!extras.notice ||
    !!extras.msg
  );
}