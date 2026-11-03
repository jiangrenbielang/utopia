import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 多仓地址跟随的用例。
 *
 * 这里 mock 掉网络层（`fetchUpstream`）与 SSRF 校验，只验证**决策与跟随逻辑**：
 * 多仓外壳既没有 `sites` 也没有 `lives`，很容易被误判成「不是 TVBOX 配置」而拒掉，
 * 所以这条路径值得钉住。真实多仓配置地址在本机环境里没找到可用的（候选全部失效/404），
 * 因此端到端只覆盖到单仓配置。
 */

const { fetchUpstreamMock, checkUpstreamAllowedMock } = vi.hoisted(() => ({
  fetchUpstreamMock: vi.fn(),
  checkUpstreamAllowedMock: vi.fn(),
}));

vi.mock('../lib/fetch-utils', () => ({
  fetchUpstream: (...args: unknown[]) => fetchUpstreamMock(...args),
}));

vi.mock('../lib/ssrf', () => ({
  checkUpstreamAllowed: (...args: unknown[]) => checkUpstreamAllowedMock(...args),
}));

import { resolveTvboxRepo } from './repo';

const REQUESTED = 'https://example.com/multi.json';
const REPO = 'https://example.com/repo/1.json';

/** 构造一个成功响应（只需处理器用到的那几个字段） */
function okResponse(json: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(json) };
}

describe('resolveTvboxRepo', () => {
  beforeEach(() => {
    fetchUpstreamMock.mockReset();
    checkUpstreamAllowedMock.mockReset().mockResolvedValue({ ok: true });
  });

  it('单仓配置（含 sites）原样返回，基地址仍是用户填写的地址', async () => {
    const json = { sites: [{ key: 'a', name: 'A', type: 1, api: 'https://a.com/api.php/provide/vod' }] };
    const result = await resolveTvboxRepo(json, REQUESTED);
    expect(result).toEqual({ ok: true, json, configUrl: REQUESTED });
    expect(fetchUpstreamMock).not.toHaveBeenCalled();
  });

  it('非 TVBOX JSON（既无 urls 也无 sites/lives）原样返回', async () => {
    const json = { sources: [{ url: 'https://a.com/api.php/provide/vod' }] };
    const result = await resolveTvboxRepo(json, REQUESTED);
    expect(result).toEqual({ ok: true, json, configUrl: REQUESTED });
    expect(fetchUpstreamMock).not.toHaveBeenCalled();
  });

  it('多仓配置：跟随首个仓库，返回仓库内容且基地址改为仓库地址', async () => {
    const inner = {
      name: '仓库一',
      sites: [{ key: 'a', name: 'A', type: 1, api: 'https://a.com/api.php/provide/vod' }],
      lives: [{ name: 'L', type: 0, url: './lib/iptv.m3u' }],
    };
    fetchUpstreamMock.mockResolvedValue(okResponse(inner));

    const result = await resolveTvboxRepo({ urls: [{ name: '仓库一', url: REPO }] }, REQUESTED);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // 相对地址要相对**仓库地址**解析，所以基地址不能是用户填写的多仓地址
      expect(result.configUrl).toBe(REPO);
      expect(result.json).toEqual(inner);
    }
    expect(fetchUpstreamMock).toHaveBeenCalledTimes(1);
    expect(checkUpstreamAllowedMock).toHaveBeenCalledWith(REPO);
  });

  it('仓库地址未通过 SSRF 校验时直接报错，不发请求', async () => {
    checkUpstreamAllowedMock.mockResolvedValue({ ok: false, reason: '不允许访问私有/保留网络地址' });

    const result = await resolveTvboxRepo({ urls: [{ url: 'http://127.0.0.1/x.json' }] }, REQUESTED);

    expect(result).toMatchObject({ ok: false, status: 403 });
    if (!result.ok) expect(result.error).toContain('不允许访问私有');
    expect(fetchUpstreamMock).not.toHaveBeenCalled();
  });

  it('仓库返回非 2xx 时报 502', async () => {
    fetchUpstreamMock.mockResolvedValue({ ok: false, status: 500, text: async () => '' });
    const result = await resolveTvboxRepo({ urls: [{ url: REPO }] }, REQUESTED);
    expect(result).toMatchObject({ ok: false, status: 502 });
  });

  it('仓库里还是多仓时明确报错，不做无限套娃', async () => {
    fetchUpstreamMock.mockResolvedValue(okResponse({ urls: [{ url: 'https://example.com/repo/2.json' }] }));
    const result = await resolveTvboxRepo({ urls: [{ url: REPO }] }, REQUESTED);
    expect(result).toMatchObject({ ok: false, status: 400 });
    if (!result.ok) expect(result.error).toContain('仍然是多仓配置');
    expect(fetchUpstreamMock).toHaveBeenCalledTimes(1);
  });

  it('仓库内容不是合法 JSON 时报错而不是抛出', async () => {
    fetchUpstreamMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'not json at all' });
    const result = await resolveTvboxRepo({ urls: [{ url: REPO }] }, REQUESTED);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('JSON');
  });
});