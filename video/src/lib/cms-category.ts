import type { SearchResultItem } from './types';

/**
 * Apple CMS（苹果CMS）**分类浏览**的纯函数：分类列表、筛选定义、查询串拼装。
 *
 * 与 cms-parser.ts 的分工：
 * - cms-parser 处理「搜索结果 / 详情」；
 * - 本模块处理 TVBox 浏览范式所需的另外三件事：`class[]` → 分类 tab、
 *   `filters` → 筛选行、以及 `ac / t / pg / f` 的查询串拼装。
 *
 * 全部是纯函数（无 IO），服务端 handler 与单测共用同一份逻辑。
 */

/** 一个分类（上游 `class[]` 条目，兼容 `type_id`/`id` 与 `type_name`/`name`） */
export interface CmsClass {
  /** 分类 id（上游 `type_id`） */
  id: string;
  /** 分类名称（上游 `type_name`） */
  name: string;
  /** 父分类 id（上游 `type_pid`；顶层分类为 "0" 或缺失） */
  pid?: string;
}

/** 单个筛选项取值；`v` 为空串表示「全部 / 不限」 */
export interface CmsFilterValue {
  /** 展示名（上游 `n`） */
  n: string;
  /** 提交值（上游 `v`） */
  v: string;
}

/** 一组筛选（同一 `key` 下的多个互斥取值） */
export interface CmsFilterGroup {
  /** 筛选字段名（上游 `key`），如 `area` / `year` */
  key: string;
  /** 分组展示名（上游 `name`），如「地区」 */
  name: string;
  /** 上游指定的默认选中值（上游 `init`） */
  init?: string;
  value: CmsFilterValue[];
}

/** 分类筛选定义：分类 id → 该分类下的筛选组 */
export type CmsFilters = Record<string, CmsFilterGroup[]>;

/** `?class=1` 的响应：只取分类与筛选定义 */
export interface CategoryClassesResponse {
  classes: CmsClass[];
  filters: CmsFilters;
}

/** 分类列表响应：分页数据 + 顺带带回的分类与筛选定义 */
export interface CategoryListResponse {
  list: SearchResultItem[];
  /** 当前页（回显请求的 pg） */
  page: number;
  /** 上游总页数（**已限幅**，不是上游原始值） */
  pagecount: number;
  /** 上游声明的总条目数（解析不出时为 0） */
  total: number;
  classes: CmsClass[];
  filters: CmsFilters;
}

/** 宽容取字符串：数字 id 也接受（部分上游用数字型 `type_id`） */
function str(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const s = value.trim();
  return s || undefined;
}

/** 取对象上的某个字段（非对象 / null 时返回 undefined，避免到处写类型断言） */
function field(json: unknown, key: string): unknown {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return undefined;
  return (json as Record<string, unknown>)[key];
}

/**
 * 解析分类列表（上游 `class[]`）。
 * 宽容策略：非数组 → 空；条目缺 id 或缺 name → 跳过；id 重复 → 只保留第一条（上游偶有父子同名表）。
 */
export function parseCmsClasses(json: unknown): CmsClass[] {
  const raw = field(json, 'class');
  if (!Array.isArray(raw)) return [];
  const out: CmsClass[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = str(field(item, 'type_id')) ?? str(field(item, 'id'));
    const name = str(field(item, 'type_name')) ?? str(field(item, 'name'));
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const pid = str(field(item, 'type_pid')) ?? str(field(item, 'pid'));
    out.push(pid === undefined ? { id, name } : { id, name, pid });
  }
  return out;
}

/**
 * 解析筛选定义（上游 `filters`）。
 * 结构：`{ <分类id>: [{ key, name, init, value: [{ n, v }] }] }`。
 * 缺字段一律宽容跳过：没有可用取值的分组不返回（渲染出来只会是一行空控件）。
 */
export function parseCmsFilters(json: unknown): CmsFilters {
  const raw = field(json, 'filters');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: CmsFilters = {};
  for (const [classId, groupsRaw] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(groupsRaw)) continue;
    const groups: CmsFilterGroup[] = [];
    for (const groupRaw of groupsRaw) {
      const key = str(field(groupRaw, 'key'));
      const name = str(field(groupRaw, 'name'));
      if (!key || !name) continue;
      const value: CmsFilterValue[] = [];
      const valuesRaw = field(groupRaw, 'value');
      if (Array.isArray(valuesRaw)) {
        for (const valueRaw of valuesRaw) {
          // `n` 缺失即视为坏数据跳过；`v` 缺失按空串处理（上游「全部」项常见写法）
          const n = str(field(valueRaw, 'n'));
          if (!n) continue;
          value.push({ n, v: str(field(valueRaw, 'v')) ?? '' });
        }
      }
      if (value.length === 0) continue;
      const init = str(field(groupRaw, 'init'));
      groups.push(init === undefined ? { key, name, value } : { key, name, init, value });
    }
    if (groups.length > 0) out[classId] = groups;
  }
  return out;
}

export interface CategoryQueryOptions {
  /** 上游采集动作：分类列表用 `list`，分类内容用 `videolist`（兜底 `detail`） */
  ac: 'list' | 'videolist' | 'detail';
  /** 分类 id（`t`），缺省表示不限分类 */
  t?: string;
  /** 页码（`pg`，从 1 起），缺省不拼该参数（上游默认第 1 页） */
  pg?: number;
  /**
   * 筛选条件（`f`）：
   * - 传键值对时序列化为 JSON 再编码；
   * - 传字符串时视为**已序列化好的 JSON 文本**（原样编码透传，避免二次序列化）。
   * 空对象 / 空串不拼该参数。
   */
  f?: string | Record<string, string>;
}

/**
 * 拼装采集站查询串：`<base>?ac=…&t=…&pg=…&f=…`。
 * - `base` 末尾斜杠归一化（站点配置里普遍带 `/`，直接拼会出现 `//?ac=`）；
 * - `base` **自身已带查询串时改用 `&` 连接**：真实 TVBOX 配置里不少站点的 `api`
 *   就写成 `…/vod/?ac=list`（44 个 type:1 站点里 3 个如此），直接再拼一个 `?`
 *   会得到 `?ac=list?ac=videolist` 这种废地址（本站搜索链路沿用旧口径，未在此改动）；
 * - 所有值经 `encodeURIComponent`（`f` 是 JSON，含 `{}"` 与中文，必须编码）。
 */
export function buildCategoryQuery(base: string, opts: CategoryQueryOptions): string {
  const root = String(base ?? '').trim().replace(/\/+$/, '');
  const parts = [`ac=${encodeURIComponent(opts.ac)}`];
  if (opts.t !== undefined && opts.t !== '') parts.push(`t=${encodeURIComponent(String(opts.t))}`);
  if (opts.pg !== undefined) {
    const pg = Number(opts.pg);
    parts.push(`pg=${Number.isFinite(pg) && pg >= 1 ? Math.floor(pg) : 1}`);
  }
  const f =
    typeof opts.f === 'string'
      ? opts.f
      : opts.f && Object.keys(opts.f).length > 0
        ? JSON.stringify(opts.f)
        : '';
  if (f) parts.push(`f=${encodeURIComponent(f)}`);
  const query = parts.join('&');
  // 已带查询串的 base：接 `&`（并避开 `?` / `&` 结尾造成的空参数）
  if (root.includes('?')) return `${root}${/[?&]$/.test(root) ? '' : '&'}${query}`;
  return `${root}?${query}`;
}