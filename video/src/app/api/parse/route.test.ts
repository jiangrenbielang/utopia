import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

/**
 * 解析接口单测：请求形状（直接拼接）、四类结果（resolved / needs-browser / no-url / empty）、
 * 错误码（400 地址非法 / 403 SSRF / 502 请求失败）。上游与 SSRF 一律 mock，不产生网络请求。
 */

const state = vi.hoisted(() => ({
  body: '',
  contentType: 'application/json',
  status: 200,
  ssrfOk: true,
  throwOnFetch: false,
  urls: [] as string[],
}));

vi.mock('@/lib/fetch-utils', () => ({
  fetchUpstream: vi.fn(async (url: string) => {
    state.urls.push(url);
    if (state.throwOnFetch) throw new Error('连接被重置');
    return new Response(state.body, {
      status: state.status,
      headers: { 'content-type': state.contentType },
    });
  }),
}));

vi.mock('@/lib/ssrf', () => ({
  // 只做协议白名单：与真实实现的「字面量校验」意图一致，足以覆盖 400 分支
  isValidProxyUrl: (url: string) => /^https?:\/\//i.test(url),
  checkUpstreamAllowed: vi.fn(async () =>
    state.ssrfOk
      ? { ok: true as const }
      : { ok: false as const, reason: '目标地址不在允许范围内（仅支持公网 http/https）' }
  ),
}));

interface ParsePayload {
  ok?: boolean;
  kind?: string;
  url?: string;
  header?: Record<string, string>;
  message?: string;
  upstreamStatus?: number;
  error?: string;
}

const PARSE = 'https://jx.example.com/?url=';
const TARGET = 'https://v.example.com/play/1';

function makeRequest(body: unknown): Request {
  return new Request('https://local.test/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readJson(res: Response): Promise<ParsePayload> {
  return (await res.json()) as ParsePayload;
}

beforeEach(() => {
  state.body = '';
  state.contentType = 'application/json';
  state.status = 200;
  state.ssrfOk = true;
  state.throwOnFetch = false;
  state.urls = [];
});

describe('POST /api/parse', () => {
  it('地址以 url= 结尾时直接拼接原始待解析地址（不编码）', async () => {
    state.body = JSON.stringify({ url: 'https://cdn.example.com/a.m3u8' });

    const res = await POST(makeRequest({ parseUrl: PARSE, target: TARGET }));
    const data = await readJson(res);

    expect(res.status).toBe(200);
    expect(data).toMatchObject({ ok: true, kind: 'resolved', url: 'https://cdn.example.com/a.m3u8' });
    expect(state.urls).toEqual([`${PARSE}${TARGET}`]);
  });

  it('透传防盗链请求头', async () => {
    state.body = JSON.stringify({ url: 'https://cdn.example.com/a.m3u8', header: { Referer: 'https://v.example.com/' } });

    const data = await readJson(await POST(makeRequest({ parseUrl: PARSE, target: TARGET })));

    expect(data.ok).toBe(true);
    expect(data.header).toEqual({ Referer: 'https://v.example.com/' });
  });

  it('返回播放页时给出 needs-browser（200，不是错误码）', async () => {
    state.body = '<html><body>player</body></html>';
    state.contentType = 'text/html; charset=utf-8';

    const res = await POST(makeRequest({ parseUrl: PARSE, target: TARGET }));
    const data = await readJson(res);

    expect(res.status).toBe(200);
    expect(data.ok).toBe(false);
    expect(data.kind).toBe('needs-browser');
    expect(data.message).toContain('浏览器');
    expect(data.upstreamStatus).toBe(200);
  });

  it('JSON 里没有地址时 kind=no-url，并带上上游原因与状态', async () => {
    state.body = JSON.stringify({ msg: '线路维护中' });
    state.status = 502;

    const data = await readJson(await POST(makeRequest({ parseUrl: PARSE, target: TARGET })));

    expect(data.ok).toBe(false);
    expect(data.kind).toBe('no-url');
    expect(data.message).toContain('线路维护中');
    expect(data.upstreamStatus).toBe(502);
  });

  it('空响应 kind=empty', async () => {
    state.body = '';
    const data = await readJson(await POST(makeRequest({ parseUrl: PARSE, target: TARGET })));
    expect(data.ok).toBe(false);
    expect(data.kind).toBe('empty');
  });

  it('请求体不是 JSON 时 400', async () => {
    const res = await POST(
      new Request('https://local.test/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      })
    );
    expect(res.status).toBe(400);
    expect((await readJson(res)).error).toBe('请求格式错误');
  });

  it('解析地址或待解析地址非法时 400', async () => {
    const bad1 = await POST(makeRequest({ parseUrl: 'ftp://jx.example.com/?url=', target: TARGET }));
    expect(bad1.status).toBe(400);
    expect((await readJson(bad1)).error).toBe('无效的解析地址');

    const bad2 = await POST(makeRequest({ parseUrl: PARSE, target: 'not-a-url' }));
    expect(bad2.status).toBe(400);
    expect((await readJson(bad2)).error).toBe('无效的待解析地址');
  });

  it('解析地址被 SSRF 拦下时 403，且不发请求', async () => {
    state.ssrfOk = false;
    const res = await POST(makeRequest({ parseUrl: 'http://127.0.0.1:3210/x?url=', target: TARGET }));
    expect(res.status).toBe(403);
    expect((await readJson(res)).error).toContain('仅支持公网');
    expect(state.urls).toEqual([]);
  });

  it('上游请求抛错时 502', async () => {
    state.throwOnFetch = true;
    const res = await POST(makeRequest({ parseUrl: PARSE, target: TARGET }));
    expect(res.status).toBe(502);
    expect((await readJson(res)).error).toContain('解析线路请求失败');
  });
});