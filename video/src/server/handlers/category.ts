import {
  buildCategoryQuery,
  parseCmsClasses,
  parseCmsFilters,
  type CategoryListResponse,
} from '../../lib/cms-category';
import { cmsRequestHeaders, filterAdultResults, parseSearchList } from '../../lib/cms-parser';
import { fetchUpstream } from '../../lib/fetch-utils';
import { checkUpstreamAllowed } from '../../lib/ssrf';
import { jsonResponse } from '../adapt';
import { requestTimeoutMs } from '../request-timeout';
import type { ServerRequest } from '../types';

/**
 * GET /api/category —— TVBox 浏览范式的服务端一半：站点 → 分类 → 筛选 → 分页。
 *
 * 参数（查询串）：
 * - `url`    站点 api 根地址（必填），如 `https://example.com/api.php/provide/vod`
 * - `class=1` 只取分类与筛选定义（就是 TVBox 的分类 tab 数据源）
 * - `t`      分类 id（上游 `type_id`），缺省表示不限分类
 * - `pg`     页码，默认 1，限幅到 [1, 500]
 * - `f`      筛选条件 JSON（如 `{"area":"大陆"}`），原样编码透传给上游
 * - `adult`  是否保留成人内容；缺省沿用既有口径（过滤成人，与 /api/search 一致）
 *
 * 上游口径（真实抓取验证）：
 * - `?ac=list`             → `class[]`（分类，实测 32 条）+ `filters`（筛选定义）+ 一批推荐内容
 * - `?ac=videolist&t=&pg=` → 该分类分页列表 `list[]`
 * - 本站 `SourceConfig` 没带站点 `type`（上游惯例 `type:1/2` 用 `ac=detail`），
 *   因此与 /api/search 同一策略：**先用 `ac=videolist`，取不到内容时用 `ac=detail` 兜底一次**。
 *
 * 响应（200）：
 * - `class=1`：`{ classes: [{id,name,pid?}], filters }`
 * - 否则：`{ list: SearchResultItem[], page, pagecount, total, classes, filters }`
 *   其中 `pagecount` **已限幅**（最多 500）——上游实测声明的总页数高达 11864，
 *   直接透给分页 UI 会让用户翻到根本不存在的页。
 *
 * 失败：`{ error }`，无效地址 400 / SSRF 403 / 上游非 2xx 502 / JSON 坏 400 / 超时等 502。
 *
 * 安全：先过 checkUpstreamAllowed（字面量 + DNS 双校验），再用 fetchUpstream 取内容——
 * 它逐跳手动跟随重定向并**每一跳重新校验**，不用 `redirect:'follow'`。
 */

/** 上游虚高页数的限幅：实测 `pagecount` 达 11864，UI 分页必须用一个可信上限 */
const MAX_PAGECOUNT = 500;

/** 带 HTTP 状态的上游错误：让「上游非 2xx」与「JSON 坏」走到各自的状态码 */
class UpstreamError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** 宽容取整数：数字、数字字符串都认，非法 / 缺失时回落 */
function intOf(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

/** 读取对象字段（非对象返回 undefined，避免类型断言蔓延） */
function fieldOf(json: unknown, key: string): unknown {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return undefined;
  return (json as Record<string, unknown>)[key];
}

export async function categoryHandler(req: ServerRequest): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const target = (sp.get('url') || '').trim();
  if (!/^https?:\/\//i.test(target)) {
    return jsonResponse({ error: '无效的站点地址' }, { status: 400 });
  }

  const verdict = await checkUpstreamAllowed(target);
  if (!verdict.ok) {
    return jsonResponse({ error: verdict.reason }, { status: 403 });
  }

  const classesOnly = sp.get('class') === '1';
  const classId = (sp.get('t') || '').trim();
  const filterJson = (sp.get('f') || '').trim();
  // 页码限幅：手改 URL 也不该让服务端去抓一个不存在的深页
  const page = Math.min(MAX_PAGECOUNT, Math.max(1, intOf(sp.get('pg'), 1)));
  // 成人内容口径与 /api/search 对齐：默认过滤，只有显式 adult=1 才保留
  const filterAdult = sp.get('adult') !== '1' && sp.get('adult') !== 'true';

  /**
   * 站点侧没有 SourceConfig（只有 api 地址），`SearchResultItem` 需要的 sourceKey/sourceName
   * 用 `category` + hostname 兜底；前端会用用户实际选中的源覆盖这两个字段，
   * 详情/播放链路因此仍能解析到正确的源。
   */
  let host = target;
  try {
    host = new URL(target).hostname || target;
  } catch {
    /* 协议已在上面校验，这里只是名称兜底 */
  }
  const source = { key: 'category', name: host, url: target };

  /** 取上游 JSON；错误带上目标状态码，避免「网络错 / 非 2xx / JSON 坏」在下面混成一个 500 */
  const fetchJson = async (ac: 'list' | 'videolist' | 'detail', pg: number): Promise<unknown> => {
    const api = buildCategoryQuery(target, {
      ac,
      t: classId || undefined,
      pg,
      f: filterJson || undefined,
    });
    let res: Response;
    try {
      res = await fetchUpstream(api, {
        timeoutMs: requestTimeoutMs(),
        headers: cmsRequestHeaders(),
        // 客户端断开（翻页太快 / 关页面）时同步中止在途上游请求
        signal: req.signal,
      });
    } catch (err) {
      throw new UpstreamError(`站点请求失败：${err instanceof Error ? err.message : '未知错误'}`, 502);
    }
    if (!res.ok) throw new UpstreamError(`站点返回 HTTP ${res.status}`, 502);
    // 读文本而非 res.json()：上游偶有非 JSON 的错误页，需要给出「内容不是 JSON」而不是解析异常
    const text = await res.text();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new UpstreamError('站点返回的内容不是合法的 JSON', 400);
    }
  };

  try {
    if (classesOnly) {
      const json = await fetchJson('list', page);
      return jsonResponse(
        { classes: parseCmsClasses(json), filters: parseCmsFilters(json) },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    let json = await fetchJson('videolist', page);
    let raw = parseSearchList(json, source);
    if (raw.length === 0) {
      // 与 /api/search 同一兜底策略：只在取不到内容时换口径重试一次，且只在有结果时采纳
      const retry = await fetchJson('detail', page);
      const retryRaw = parseSearchList(retry, source);
      if (retryRaw.length > 0) {
        json = retry;
        raw = retryRaw;
      }
    }

    const payload: CategoryListResponse = {
      list: filterAdultResults(raw, filterAdult),
      page,
      pagecount: Math.min(MAX_PAGECOUNT, Math.max(1, intOf(fieldOf(json, 'pagecount'), 1))),
      total: Math.max(0, intOf(fieldOf(json, 'total'), 0)),
      classes: parseCmsClasses(json),
      filters: parseCmsFilters(json),
    };
    return jsonResponse(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err instanceof UpstreamError) {
      return jsonResponse({ error: err.message }, { status: err.status });
    }
    return jsonResponse(
      { error: err instanceof Error ? err.message : '分类浏览请求失败' },
      { status: 502 }
    );
  }
}