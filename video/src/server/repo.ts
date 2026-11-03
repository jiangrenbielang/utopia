import { fetchUpstream } from '../lib/fetch-utils';
import { checkUpstreamAllowed } from '../lib/ssrf';
import { parseSubscriptionJson } from '../lib/tvbox-parser';
import { normalizeTvboxConfig, tvboxFirstRepoUrl } from '../lib/tvbox-config';

/**
 * TVBOX「多仓」配置的处理。
 *
 * 多仓格式是 `{ urls: [{ name, url }] }`：**既没有 `sites` 也没有 `lives`**，
 * 因此用 `isTvboxConfig()`（判顶层有没有 sites/lives 数组）根本认不出来，
 * 必须在那个判定**之前**先处理。上游客户端读到 `urls` 会改去加载第一个仓库的地址，
 * 这里照做，但只跟一跳：仓库里若还是多仓就明确报错，避免无限套娃。
 */

/** 解析结果：要么拿到真正的单仓配置，要么拿到一个可直接返回的错误 */
export type RepoResolution =
  | { ok: true; json: unknown; configUrl: string }
  | { ok: false; error: string; status: number };

/**
 * 判断并跟随多仓地址。
 *
 * @param json         首次拉取到的 JSON（可能是多仓外壳）
 * @param requestedUrl 用户填写的地址。用于错误提示，也是**订阅标识**；
 *                     客户端按它归一化出 store key，因此不能换成仓库地址。
 * @returns `configUrl` 是**相对路径应当解析到的基地址**：单仓时就是 `requestedUrl`，
 *          多仓时是仓库地址（配置里 `./lib/x.m3u` 相对的是仓库所在目录）。
 */
export async function resolveTvboxRepo(json: unknown, requestedUrl: string): Promise<RepoResolution> {
  // 复用完整配置解析：它同时给出 urls（多仓）与 sites/lives（单仓）
  const config = normalizeTvboxConfig(json, requestedUrl);
  const repoUrl = tvboxFirstRepoUrl(config);
  // 不是多仓（没有 urls），或本身就是单仓（有 sites/lives）：原样返回
  if (!repoUrl || config.sites.length > 0 || config.lives.length > 0) {
    return { ok: true, json, configUrl: requestedUrl };
  }

  const verdict = await checkUpstreamAllowed(repoUrl);
  if (!verdict.ok) {
    return { ok: false, error: `多仓配置里的仓库地址不可用：${verdict.reason}`, status: 403 };
  }

  try {
    const res = await fetchUpstream(repoUrl, { timeoutMs: 8000, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return { ok: false, error: `仓库地址返回 HTTP ${res.status}`, status: 502 };
    }
    // 与首次拉取同一套宽容解析（注释 / 尾随逗号）
    const inner = parseSubscriptionJson(await res.text());
    const innerConfig = normalizeTvboxConfig(inner, repoUrl);
    if (tvboxFirstRepoUrl(innerConfig)) {
      return { ok: false, error: '仓库地址仍然是多仓配置，请直接填写具体仓库的地址', status: 400 };
    }
    return { ok: true, json: inner, configUrl: repoUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '仓库地址拉取失败', status: 502 };
  }
}