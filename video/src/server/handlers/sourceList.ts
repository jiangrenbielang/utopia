import { checkLiveUrlAllowed, checkUpstreamAllowed, isValidProxyUrl } from '../../lib/ssrf';
import { fetchUpstream } from '../../lib/fetch-utils';
import { describeParseStats, parseSubscriptionJson, parseSubscriptionPayload, withSkipped } from '../../lib/tvbox-parser';
import { isTvboxConfig, tvboxConfigExtras } from '../../lib/tvbox-config';
import type { SourceListPayload } from '../../lib/types';
import { jsonResponse } from '../adapt';
import { resolveTvboxRepo } from '../repo';
import type { ServerRequest } from '../types';

/**
 * 拉取远程数据源订阅，自动识别两种格式：
 * 1. LibreTV-SourceList JSON：{ name?, sources: [点播源], liveSources: [直播源] }（也接受裸数组与老格式）；
 * 2. TVBOX 配置 JSON：{ sites: [站点], lives: [直播源] }，仅导入直连类条目
 *    （type=1 的 Apple CMS 接口与 M3U 直播），Spider / XML 等跳过并计入统计。
 *
 * 点播源与直播源的地址放行策略不同（点播一律拒绝内网，直播可用 LIVE_ALLOW_PRIVATE 放行），
 * 因此两类分别校验，不能共用一把尺子；被校验拦下的条目同样计入统计，便于前端说明导入结果。
 *
 * TVBOX 配置还会多带回一份完整配置视图（`payload.tvbox`：解析线路、平台白名单、壁纸、
 * 站点形态统计），供客户端长期保留；其余格式不带该字段，返回结构与旧版一致。
 */
export async function sourceListHandler(req: ServerRequest): Promise<Response> {
  const requestUrl = new URL(req.url);
  const target = (requestUrl.searchParams.get('url') || '').trim();
  if (!/^https?:\/\//.test(target)) {
    return jsonResponse({ error: '无效的订阅地址' }, { status: 400 });
  }

  const verdict = await checkUpstreamAllowed(target);
  if (!verdict.ok) {
    return jsonResponse({ error: verdict.reason }, { status: 403 });
  }

  try {
    const res = await fetchUpstream(target, { timeoutMs: 8000, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return jsonResponse({ error: `订阅地址返回 HTTP ${res.status}` }, { status: 502 });
    }
    // 读文本而非 res.json()：部分配置带注释/尾随逗号，需要宽容解析
    const text = await res.text();

    let json: unknown;
    try {
      json = parseSubscriptionJson(text);
    } catch (err) {
      return jsonResponse(
        { error: err instanceof Error ? err.message : '订阅内容格式不正确' },
        { status: 400 }
      );
    }

    /**
     * 多仓地址（`{urls:[{name,url}]}`）要再取一次首个仓库才是真正的配置。
     * 必须在下面的格式判定之前处理：多仓外壳既没有 `sites` 也没有 `lives`，
     * `parseSubscriptionPayload` 认不出来，会被当成空订阅报错。
     */
    const resolved = await resolveTvboxRepo(json, target);
    if (!resolved.ok) {
      return jsonResponse({ error: resolved.error }, { status: resolved.status });
    }
    json = resolved.json;

    let parsed;
    try {
      // 相对地址（./lib/x.m3u）相对**配置地址**解析；多仓时是仓库地址
      parsed = parseSubscriptionPayload(json, resolved.configUrl);
    } catch (err) {
      return jsonResponse(
        { error: err instanceof Error ? err.message : '订阅内容格式不正确' },
        { status: 400 }
      );
    }

    // 点播源：拒绝非公网地址（DNS 层校验在搜索/详情请求时另有兜底）
    const sources = parsed.sources.filter((s) => isValidProxyUrl(s.url));

    // 直播源：按直播策略校验，EPG 地址非法时丢弃该字段而非整条源
    const checkedLive = await Promise.all(
      parsed.liveSources.map(async (s) => {
        if (!(await checkLiveUrlAllowed(s.url)).ok) return null;
        if (s.epg && !(await checkLiveUrlAllowed(s.epg)).ok) return { ...s, epg: undefined };
        return s;
      })
    );
    const liveSources = checkedLive.filter((s): s is NonNullable<typeof s> => s !== null);

    // 被服务端校验拦下的条目也计入统计，用户能看清「配置里有 N 条却只导入 M 条」的原因
    const dropped = parsed.sources.length - sources.length + (parsed.liveSources.length - liveSources.length);
    const stats = withSkipped(parsed.stats, 'invalidUrl', dropped);

    if (sources.length === 0 && liveSources.length === 0) {
      const detail = describeParseStats(stats);
      return jsonResponse(
        { error: detail ? `订阅未导入任何可用源：${detail}` : '订阅内容为空' },
        { status: 400 }
      );
    }

    /**
     * TVBOX 配置额外挂上完整配置视图（解析线路、平台白名单、壁纸、站点形态统计），
     * 供客户端长期保留与展示；非 TVBOX 格式不挂（值为 undefined，序列化后不会出现在响应里），
     * 因此既有消费方看到的返回结构逐字段不变。
     *
     * `stats` 覆盖掉 extras 内那份：extras 里的统计是**未经 SSRF 过滤**的解析结果，
     * 这里换成服务端校验后的最终统计，与订阅列表、TVBox 面板展示的跳过口径一致。
     */
    const tvbox = isTvboxConfig(json) ? { ...tvboxConfigExtras(json, resolved.configUrl), stats } : undefined;

    const payload: SourceListPayload = { name: parsed.name, sources, liveSources, stats, tvbox };
    return jsonResponse(payload);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : '订阅拉取失败' },
      { status: 502 }
    );
  }
}