import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 通用代理的准入行为单测。
 *
 * 这里只钉住「我这次改动的面」：默认拒绝内网、`ALLOW_PRIVATE_UPSTREAM=1` 后放行内网、
 * 放行后仍强制 http(s)、m3u8 分片被重写成代理地址、Range 原样转发给上游。
 * 上游请求与重定向跟随一律 mock，不产生网络。
 */

const { fetchWithSafeRedirectsMock } = vi.hoisted(() => ({
  fetchWithSafeRedirectsMock: vi.fn(),
}));

vi.mock('./fetch-utils', () => ({
  fetchWithSafeRedirects: (...args: unknown[]) => fetchWithSafeRedirectsMock(...args),
}));

import { handleProxyRequest, type ProxyRequestView } from './proxy-handlers';

const M3U8 = ['#EXTM3U', '#EXTINF:4.0,', 'segment0.ts', '#EXT-X-ENDLIST', ''].join('\n');
const ALIST = 'http://127.0.0.1:5244/d/video.m3u8';

function view(range?: string): ProxyRequestView {
  const headers = new Headers();
  if (range) headers.set('range', range);
  return { headers, signal: new AbortController().signal };
}

/** 上游返回一份 m3u8（含相对分片地址） */
function m3u8Upstream() {
  fetchWithSafeRedirectsMock.mockResolvedValue({
    res: new Response(M3U8, {
      status: 200,
      headers: { 'content-type': 'application/vnd.apple.mpegurl' },
    }),
    finalUrl: ALIST,
  });
}

const saved = { upstream: process.env.ALLOW_PRIVATE_UPSTREAM };

beforeEach(() => {
  fetchWithSafeRedirectsMock.mockReset();
  delete process.env.ALLOW_PRIVATE_UPSTREAM;
});

afterEach(() => {
  if (saved.upstream === undefined) delete process.env.ALLOW_PRIVATE_UPSTREAM;
  else process.env.ALLOW_PRIVATE_UPSTREAM = saved.upstream;
});

describe('handleProxyRequest 的准入', () => {
  it('默认拒绝内网地址（AList 直链），且不发上游请求', async () => {
    const res = await handleProxyRequest(view(), ALIST);
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('无效的 URL');
    expect(fetchWithSafeRedirectsMock).not.toHaveBeenCalled();
  });

  it('ALLOW_PRIVATE_UPSTREAM=1 后放行内网，并把 allowPrivate 传给逐跳复检', async () => {
    process.env.ALLOW_PRIVATE_UPSTREAM = '1';
    m3u8Upstream();

    const res = await handleProxyRequest(view(), ALIST);

    expect(res.status).toBe(200);
    expect(fetchWithSafeRedirectsMock).toHaveBeenCalledTimes(1);
    const [, , options] = fetchWithSafeRedirectsMock.mock.calls[0];
    expect(options).toMatchObject({ allowPrivate: true });
  });

  it('放行内网后仍拒绝非 http(s) 协议', async () => {
    process.env.ALLOW_PRIVATE_UPSTREAM = '1';
    const res = await handleProxyRequest(view(), 'ftp://127.0.0.1/x');
    expect(res.status).toBe(400);
    expect(fetchWithSafeRedirectsMock).not.toHaveBeenCalled();
  });

  it('m3u8 的分片被重写成同源代理地址（分片才能带同一把准入尺子）', async () => {
    process.env.ALLOW_PRIVATE_UPSTREAM = '1';
    m3u8Upstream();

    const res = await handleProxyRequest(view(), ALIST);
    const body = await res.text();

    expect(body).toContain('/api/proxy?url=');
    expect(body).toContain(encodeURIComponent('http://127.0.0.1:5244/d/segment0.ts'));
  });

  it('Range 原样转发给上游（拖进度依赖它）', async () => {
    m3u8Upstream();
    await handleProxyRequest(view('bytes=0-99'), 'https://cdn.example.com/a.m3u8');
    const [, init] = fetchWithSafeRedirectsMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Range).toBe('bytes=0-99');
  });

  it('自建网盘形态的清单也要被重写：路径带查询串 + content-type 是 octet-stream', async () => {
    // AList / OpenList 的直链长这样：/p/媒体/demo.m3u8?sign=…，且返回 octet-stream。
    // 若只看「整串 URL 是否以 .m3u8 结尾」或只看 content-type，都会漏判 → 分片不被代理 → 播不出来。
    process.env.ALLOW_PRIVATE_UPSTREAM = '1'; // 自建网盘在内网，先放行
    const signed = 'http://127.0.0.1:5244/p/media/demo/video.m3u8?sign=abc=:0';
    fetchWithSafeRedirectsMock.mockResolvedValue({
      res: new Response(M3U8, { status: 200, headers: { 'content-type': 'application/octet-stream' } }),
      finalUrl: signed,
    });

    const res = await handleProxyRequest(view(), signed);
    const body = await res.text();

    expect(res.headers.get('Content-Type')).toBe('application/vnd.apple.mpegurl');
    expect(body).toContain('/api/proxy?url=');
  });

  it('重定向后落在 .m3u8 路径时同样按清单处理（以 finalUrl 判定）', async () => {
    process.env.ALLOW_PRIVATE_UPSTREAM = '1';
    fetchWithSafeRedirectsMock.mockResolvedValue({
      res: new Response(M3U8, { status: 200, headers: { 'content-type': 'application/octet-stream' } }),
      // 首跳 URL 没有 .m3u8，真正拿到内容的是重定向后的地址
      finalUrl: 'http://127.0.0.1:5244/p/media/demo/video.m3u8?sign=xyz=:0',
    });

    const res = await handleProxyRequest(view(), 'http://127.0.0.1:5244/d/media/demo/video.m3u8');
    const body = await res.text();
    expect(body).toContain('/api/proxy?url=');
  });

  /**
   * 这条是为一次真实故障加的：代理曾给整个请求挂 `AbortSignal.timeout(8000)`，
   * 它作用于**整条响应流**，于是 185MB 的网课视频播到 8 秒就被掐断、播放器反复重连，
   * 表现为「加载极慢」。现在的约定是：只对「等响应头」限时（headerTimeoutMs），
   * 拿到响应头后 body 不再限时。
   */
  it('只对「等响应头」限时：必须传 headerTimeoutMs，且不挂整体超时', async () => {
    process.env.ALLOW_PRIVATE_UPSTREAM = '1';
    m3u8Upstream();

    await handleProxyRequest(view(), ALIST);

    const [, , options] = fetchWithSafeRedirectsMock.mock.calls[0];
    expect(typeof options.headerTimeoutMs).toBe('number');
    expect(options.headerTimeoutMs).toBeGreaterThan(0);
  });

  it('客户端断开时终止上游连接（不把废弃连接留给 AList / 网盘）', async () => {
    process.env.ALLOW_PRIVATE_UPSTREAM = '1';
    m3u8Upstream();

    const ac = new AbortController();
    const v: ProxyRequestView = { headers: new Headers(), signal: ac.signal };
    await handleProxyRequest(v, ALIST);

    const [, init] = fetchWithSafeRedirectsMock.mock.calls[0];
    const upstreamSignal = init.signal as AbortSignal;
    expect(upstreamSignal.aborted).toBe(false);

    ac.abort();
    expect(upstreamSignal.aborted).toBe(true);
  });
});