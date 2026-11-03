import { checkUpstreamAllowed } from '../../lib/ssrf';
import { fetchUpstream } from '../../lib/fetch-utils';
import { isTvboxConfig, parseTvboxConfig, tvboxConfigExtras } from '../../lib/tvbox-config';
import { parseSubscriptionJson } from '../../lib/tvbox-parser';
import type { SubscriptionParseStats } from '../../lib/types';
import type { TvboxConfigExtras, TvboxLiveKind, TvboxSiteKind } from '../../lib/tvbox-config';
import { jsonResponse } from '../adapt';
import { resolveTvboxRepo } from '../repo';
import { requestTimeoutMs } from '../request-timeout';
import type { ServerRequest } from '../types';

/** `parse` 段：把「导入前检查」要看的统计平铺出来，UI 不必再翻 extras 的内部结构 */
interface TvboxPreviewParse {
  siteKinds: Record<TvboxSiteKind, number>;
  liveKinds: Record<TvboxLiveKind, number>;
  /** 本站无法直接使用的条目数（Spider / XML / 单仓 JSON 直播源等） */
  unsupported: number;
  /** 没有任何可导入条目时的原因（全是 Spider 站点的配置就会走到这里） */
  importError?: string;
  /** 跳过与截断统计，与订阅导入入口同源，可直接喂给 describeParseStats 拼文案 */
  stats?: SubscriptionParseStats;
  /** 可直接导入本站的点播源数量（payload 为空时为 0） */
  sources: number;
  /** 可直接导入本站的直播源数量（payload 为空时为 0） */
  liveSources: number;
}

/**
 * GET /api/tvbox?url=<配置地址>
 *
 * 解析任意一份 TVBOX 配置并返回「完整配置视图 + 统计」，供 UI 预览与导入前检查。
 *
 * 与 /api/source-list 的分工：那边把配置裁成「能直接导入的源列表」，本接口不做裁剪，
 * 整份配置（解析线路、平台白名单、壁纸、站点形态）都要看得见——全是 Spider 站点的配置
 * 在 source-list 侧只会得到一条错误信息，看不出配置本身还有什么。
 *
 * 响应（200）：
 * {
 *   ok: true,
 *   url: string,                        // 请求时传入的配置地址
 *   extras: TvboxConfigExtras,          // 解析线路 / 平台白名单 / 壁纸 / 站点索引 / 形态统计
 *   parse: { siteKinds, liveKinds, unsupported, importError, stats, sources, liveSources }
 * }
 * 失败（4xx/5xx）：{ error: string }，统一由 jsonError 产出。
 *
 * 安全：先过 checkUpstreamAllowed（字面量 + DNS 双校验），再用既有的 fetchUpstream 取内容——
 * 它默认逐跳手动跟随重定向并**每一跳重新校验**，不用 redirect:'follow'
 * （自动跟随的 3xx 会把请求带进内网，绕过首跳校验）。
 */
export async function tvboxHandler(req: ServerRequest): Promise<Response> {
  const target = (new URL(req.url).searchParams.get('url') || '').trim();
  if (!/^https?:\/\//i.test(target)) {
    return jsonResponse({ error: '无效的配置地址' }, { status: 400 });
  }

  const verdict = await checkUpstreamAllowed(target);
  if (!verdict.ok) {
    return jsonResponse({ error: verdict.reason }, { status: 403 });
  }

  let text: string;
  try {
    const res = await fetchUpstream(target, {
      timeoutMs: requestTimeoutMs(),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return jsonResponse({ error: `配置地址返回 HTTP ${res.status}` }, { status: 502 });
    }
    // 读文本而非 res.json()：TVBOX 配置普遍带注释/尾随逗号，需要宽容解析
    text = await res.text();
  } catch (err) {
    return jsonResponse({ error: `配置拉取失败：${err instanceof Error ? err.message : '未知错误'}` }, { status: 502 });
  }

  let json: unknown;
  try {
    json = parseSubscriptionJson(text);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : '配置内容不是合法的 JSON' }, { status: 400 });
  }

  /**
   * 多仓地址（`{urls:[{name,url}]}`）要再取一次首个仓库才是真正的配置。
   * 必须在下面 `isTvboxConfig` 之前处理：多仓外壳既没有 `sites` 也没有 `lives`，
   * 用那个判定会直接把它当成「不是 TVBOX 配置」拒掉。
   */
  const resolved = await resolveTvboxRepo(json, target);
  if (!resolved.ok) {
    return jsonResponse({ error: resolved.error }, { status: resolved.status });
  }
  json = resolved.json;
  /** 相对路径的基地址：单仓时是 target，多仓时是仓库地址 */
  const configUrl = resolved.configUrl;

  // 只认顶层含 sites / lives 的配置：其余 JSON（LibreTV 源列表、接口目录）走 /api/source-list
  if (!isTvboxConfig(json)) {
    return jsonResponse({ error: '该地址不是 TVBOX 配置（顶层缺少 sites / lives 数组）' }, { status: 400 });
  }

  /**
   * 两次解析同一份 JSON 是刻意的：`tvboxConfigExtras` 给完整配置视图，
   * `parseTvboxConfig` 给「可导入子集 + 跳过原因」——后者与订阅导入入口复用同一套判定，
   * 手写一遍字段反而会与该模块漂移。配置体量（数百条站点）下这点开销可以忽略。
   */
  const extras: TvboxConfigExtras = tvboxConfigExtras(json, configUrl);
  const parsed = parseTvboxConfig(json, configUrl);
  const parse: TvboxPreviewParse = {
    siteKinds: parsed.siteKinds,
    liveKinds: parsed.liveKinds,
    unsupported: parsed.unsupported,
    // 一份全是 Spider 站点的配置拿不到可用子集，原因如实透出，配置本身照常返回
    importError: parsed.importError,
    stats: parsed.payload?.stats,
    sources: parsed.payload?.sources.length ?? 0,
    liveSources: parsed.payload?.liveSources.length ?? 0,
  };

  return jsonResponse(
    // url 是用户填写的地址（订阅标识）；多仓时额外给出实际生效的仓库地址
    { ok: true as const, url: target, configUrl, extras, parse },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}