import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

/**
 * 分类浏览接口单测：查询串透传（ac / t / pg / f）、分页限幅、成人过滤口径、
 * videolist→detail 兜底，以及各类错误码。上游拉取与 SSRF 校验一律 mock，不产生网络请求。
 */

const state = vi.hoisted(() => ({
  /** 上游返回的 JSON（按 ac 区分：videolist 用 body，detail 用 detailBody） */
  body: null as unknown,
  detailBody: null as unknown,
  /** 原始响应文本（优先于 body），用于模拟非 JSON 响应 */
  rawText: null as string | null,
  status: 200,
  ssrfOk: true,
  /** 记录每次上游请求的完整 URL */
  urls: [] as string[],
}));

vi.mock('@/lib/fetch-utils', () => ({
  fetchUpstream: vi.fn(async (url: string) => {
    state.urls.push(url);
    const body = /(?:^|[?&])ac=detail(?:&|$)/.test(url) ? state.detailBody : state.body;
    return new Response(state.rawText ?? JSON.stringify(body), {
      status: state.status,
      headers: { 'content-type': 'application/json' },
    });
  }),
}));

vi.mock('@/lib/ssrf', () => ({
  checkUpstreamAllowed: vi.fn(async () =>
    state.ssrfOk ? { ok: true as const } : { ok: false as const, reason: '目标地址不在允许范围内（仅支持公网 http/https）' }
  ),
}));

interface CategoryPayload {
  classes?: { id: string; name: string; pid?: string }[];
  filters?: Record<string, unknown>;
  list?: { vodId: string; name: string; typeName?: string }[];
  page?: number;
  pagecount?: number;
  total?: number;
  error?: string;
}

async function readJson(res: Response): Promise<CategoryPayload> {
  return (await res.json()) as CategoryPayload;
}

function makeRequest(query: string): Request {
  return new Request(`https://local.test/api/category?${query}`);
}

const SITE = 'https://vod.example.com/api.php/provide/vod';

/** 一份带分类、筛选与分页信息的上游响应 */
function upstreamList(overrides: Record<string, unknown> = {}): unknown {
  return {
    code: 1,
    page: 1,
    pagecount: 11864,
    total: 17163,
    class: [{ type_id: 20, type_pid: 0, type_name: '国产剧' }],
    filters: { 20: [{ key: 'area', name: '地区', init: '大陆', value: [{ n: '全部', v: '' }, { n: '大陆', v: '大陆' }] }] },
    list: [
      { vod_id: 1, vod_name: '示例剧', type_name: '国产剧', vod_pic: 'https://img.example.com/1.jpg', vod_remarks: '更新至3集' },
      // 「福利片」命中成人关键词，用于验证默认过滤与 adult=1 保留
      { vod_id: 2, vod_name: '福利片甲', type_name: '福利片' },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  state.body = null;
  state.detailBody = null;
  state.rawText = null;
  state.status = 200;
  state.ssrfOk = true;
  state.urls = [];
});

describe('GET /api/category', () => {
  it('class=1：只返回分类与筛选定义，不返回列表', async () => {
    state.body = { class: [{ type_id: 20, type_pid: 0, type_name: '国产剧' }, { id: '21', name: '动漫' }], filters: {} };

    const res = await GET(makeRequest(`class=1&url=${encodeURIComponent(SITE)}`));
    const data = await readJson(res);

    expect(res.status).toBe(200);
    expect(data.classes).toEqual([
      { id: '20', name: '国产剧', pid: '0' },
      { id: '21', name: '动漫' },
    ]);
    expect(data.filters).toEqual({});
    expect(data.list).toBeUndefined();
    expect(state.urls).toEqual([`${SITE}?ac=list&pg=1`]);
  });

  it('分类列表：透传 ac/t/pg/f，pagecount 限幅为 500，默认过滤成人条目', async () => {
    state.body = upstreamList();

    const res = await GET(
      makeRequest(
        `url=${encodeURIComponent(SITE)}&t=20&pg=2&f=${encodeURIComponent('{"area":"大陆"}')}`
      )
    );
    const data = await readJson(res);

    expect(res.status).toBe(200);
    // f 是 JSON：原样编码透传（与客户端传来的编码一致，不二次序列化）
    expect(state.urls[0]).toBe(`${SITE}?ac=videolist&t=20&pg=2&f=${encodeURIComponent('{"area":"大陆"}')}`);
    expect(data.page).toBe(2);
    expect(data.pagecount).toBe(500);
    expect(data.total).toBe(17163);
    expect(data.list).toEqual([
      {
        sourceKey: 'category',
        sourceName: 'vod.example.com',
        vodId: '1',
        name: '示例剧',
        pic: 'https://img.example.com/1.jpg',
        typeName: '国产剧',
        year: undefined,
        area: undefined,
        remarks: '更新至3集',
        sourceUrl: SITE,
        isAdult: undefined,
      },
    ]);
    expect(data.classes).toEqual([{ id: '20', name: '国产剧', pid: '0' }]);
    expect(data.filters).toEqual({
      '20': [{ key: 'area', name: '地区', init: '大陆', value: [{ n: '全部', v: '' }, { n: '大陆', v: '大陆' }] }],
    });
  });

  it('adult=1：保留成人条目；pg 非法 / 超限时被限幅', async () => {
    state.body = upstreamList();

    const res = await GET(makeRequest(`url=${encodeURIComponent(SITE)}&t=20&pg=99999&adult=1`));
    const data = await readJson(res);

    expect(res.status).toBe(200);
    expect(data.list).toHaveLength(2);
    expect(data.page).toBe(500);
    expect(state.urls[0]).toContain('pg=500');
  });

  it('videolist 取不到内容时用 ac=detail 兜底一次，并采纳兜底结果', async () => {
    // videolist 返回空 list，detail 有内容
    state.body = upstreamList({ list: [], pagecount: 3, total: 0 });
    state.detailBody = upstreamList({ list: [{ vod_id: 9, vod_name: '兜底剧', type_name: '国产剧' }], pagecount: 3, total: 1 });

    const res = await GET(makeRequest(`url=${encodeURIComponent(SITE)}&t=20`));
    const data = await readJson(res);

    expect(res.status).toBe(200);
    expect(state.urls).toEqual([`${SITE}?ac=videolist&t=20&pg=1`, `${SITE}?ac=detail&t=20&pg=1`]);
    expect(data.list?.map((i) => i.vodId)).toEqual(['9']);
    expect(data.pagecount).toBe(3);
  });

  it('无效地址 400 / SSRF 403 / 上游非 2xx 502 / 非 JSON 400', async () => {
    const bad = await GET(makeRequest('class=1&url=ftp%3A%2F%2Fexample.com%2Fapi'));
    expect(bad.status).toBe(400);
    expect((await readJson(bad)).error).toBe('无效的站点地址');

    state.ssrfOk = false;
    const denied = await GET(makeRequest(`class=1&url=${encodeURIComponent('http://127.0.0.1:3210/api/status')}`));
    expect(denied.status).toBe(403);
    expect((await readJson(denied)).error).toContain('仅支持公网');

    state.ssrfOk = true;
    state.status = 503;
    const upstreamErr = await GET(makeRequest(`class=1&url=${encodeURIComponent(SITE)}`));
    expect(upstreamErr.status).toBe(502);
    expect((await readJson(upstreamErr)).error).toBe('站点返回 HTTP 503');

    state.status = 200;
    state.rawText = '<html>403 Forbidden</html>';
    const notJson = await GET(makeRequest(`class=1&url=${encodeURIComponent(SITE)}`));
    expect(notJson.status).toBe(400);
    expect((await readJson(notJson)).error).toBe('站点返回的内容不是合法的 JSON');
  });
});