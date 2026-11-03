import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 百度网盘模块的关键行为。
 *
 * 两条都是**线上真实踩出来的**，写成测试防止回归：
 * 1. 解析出的直链必须拼上 `access_token`：只带 `User-Agent: pan.baidu.com` 时百度 CDN 返回
 *    `403 {"error_code":31045,"error_msg":"user not exists"}`，拼上令牌才是 200；
 * 2. 续期会轮换 refresh_token，旧令牌随即作废，所以必须把新令牌回写。
 *
 * 测试不落盘：用 `BAIDU_REFRESH_TOKEN` 注入令牌（模块在环境变量存在时跳过写文件）。
 */

const ENV_TOKEN = 'test-refresh-token-value';

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 按 URL 前缀路由的 fetch mock（`list` 回调会拿到完整 URL，便于按目录造数据） */
function mockFetch(routes: {
  token?: () => Response;
  filemetas?: () => Response;
  list?: (url: string) => Response;
}) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith('https://openapi.baidu.com/oauth/2.0/token')) {
      return (
        routes.token?.() ??
        jsonResponse({
          access_token: 'access-abc',
          refresh_token: 'rotated-token',
          expires_in: 2592000,
        })
      );
    }
    if (url.startsWith('https://pan.baidu.com/rest/2.0/xpan/multimedia')) {
      return (
        routes.filemetas?.() ??
        jsonResponse({
          errno: 0,
          // 实测字段是 list，不是文档里的 info
          list: [{ fs_id: 42, dlink: 'https://d.pcs.baidu.com/file/xyz?fid=1&expires=8h', size: 1024 }],
        })
      );
    }
    if (url.startsWith('https://pan.baidu.com/rest/2.0/xpan/file')) {
      return (
        routes.list?.(url) ??
        jsonResponse({
          errno: 0,
          list: [
            { fs_id: 1, server_filename: '第1讲.mp4', isdir: 0, size: 1048576 },
            { fs_id: 2, server_filename: '资料', isdir: 1, size: 0, path: '/考研2028/资料' },
            { fs_id: 3, server_filename: '笔记.mkv', isdir: 0, size: 2048 },
          ],
        })
      );
    }
    throw new Error(`未预期的请求：${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

beforeEach(() => {
  process.env.BAIDU_REFRESH_TOKEN = ENV_TOKEN;
});

afterEach(() => {
  delete process.env.BAIDU_REFRESH_TOKEN;
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('百度网盘：resolveDlink', () => {
  it('直链必须拼上 access_token（否则百度 403 user not exists）', async () => {
    mockFetch({});
    const { resolveDlink } = await import('./baidu-netdisk');
    const url = await resolveDlink(42);
    expect(url).toContain('d.pcs.baidu.com');
    expect(url).toContain('access_token=access-abc');
  });

  it('只允许百度系域名，避免被当成开放代理', async () => {
    mockFetch({
      filemetas: () => jsonResponse({ errno: 0, list: [{ fs_id: 42, dlink: 'https://evil.example.com/x.mp4' }] }),
    });
    const { resolveDlink } = await import('./baidu-netdisk');
    await expect(resolveDlink(42)).rejects.toThrow(/域名不在允许范围/);
  });

  it('百度没给 dlink 时给出可读错误', async () => {
    mockFetch({ filemetas: () => jsonResponse({ errno: 0, list: [{ fs_id: 42 }] }) });
    const { resolveDlink } = await import('./baidu-netdisk');
    await expect(resolveDlink(42)).rejects.toThrow(/没有返回可播放的直链/);
  });
});

describe('百度网盘：listDir', () => {
  it('解析文件名/大小/是否目录，并标出浏览器可播的容器', async () => {
    mockFetch({});
    const { listDir } = await import('./baidu-netdisk');
    const entries = await listDir('/考研2028');
    expect(entries).toHaveLength(3);
    const video = entries.find((e) => e.name === '第1讲.mp4');
    expect(video).toMatchObject({ isDir: false, size: 1048576, playable: true });
    expect(entries.find((e) => e.name === '资料')).toMatchObject({ isDir: true, playable: false });
    // mkv 浏览器解码不了，不能标成可播
    expect(entries.find((e) => e.name === '笔记.mkv')?.playable).toBe(false);
  });

  it('授权失效时把 errno 翻成人话', async () => {
    mockFetch({ list: () => jsonResponse({ errno: -6 }) });
    const { listDir } = await import('./baidu-netdisk');
    await expect(listDir('/考研2028')).rejects.toThrow(/授权已失效/);
  });
});

describe('百度网盘：scanVideos（目录 → 课程章节）', () => {
  /** 按目录返回造好的列表 */
  function dirRouter(map: Record<string, unknown[]>) {
    return (url: string) => {
      const dir = new URL(url).searchParams.get('dir') || '/';
      return jsonResponse({ errno: 0, list: map[dir] ?? [] });
    };
  }

  it('自然序：第2讲排在第10讲之前（字典序会排反）', async () => {
    mockFetch({
      list: dirRouter({
        '/root': [
          { fs_id: 10, server_filename: '第10讲.mp4', isdir: 0, size: 1, path: '/root/第10讲.mp4' },
          { fs_id: 1, server_filename: '第1讲.mp4', isdir: 0, size: 1, path: '/root/第1讲.mp4' },
          { fs_id: 2, server_filename: '第2讲.mp4', isdir: 0, size: 1, path: '/root/第2讲.mp4' },
        ],
      }),
    });
    const { scanVideos } = await import('./baidu-netdisk');
    const result = await scanVideos('/root');
    expect(result.videos.map((v) => v.name)).toEqual(['第1讲.mp4', '第2讲.mp4', '第10讲.mp4']);
    expect(result.truncated).toBe(false);
  });

  it('递归子目录，并过滤掉非视频文件', async () => {
    mockFetch({
      list: dirRouter({
        '/root': [
          { fs_id: 1, server_filename: 'A.mp4', isdir: 0, size: 1, path: '/root/A.mp4' },
          { fs_id: 2, server_filename: '笔记.txt', isdir: 0, size: 1, path: '/root/笔记.txt' },
          { fs_id: 3, server_filename: '子目录', isdir: 1, size: 0, path: '/root/子目录' },
        ],
        '/root/子目录': [
          { fs_id: 4, server_filename: 'B.mp4', isdir: 0, size: 1, path: '/root/子目录/B.mp4' },
        ],
      }),
    });
    const { scanVideos } = await import('./baidu-netdisk');
    const result = await scanVideos('/root');
    expect(result.videos).toHaveLength(2);
    expect(result.videos.map((v) => v.name).sort()).toEqual(['A.mp4', 'B.mp4']);
    expect(result.scannedDirs).toBe(2);
  });

  it('命中上限时标记 truncated（保护服务端与百度配额）', async () => {
    mockFetch({
      list: dirRouter({
        '/root': [
          { fs_id: 1, server_filename: 'a.mp4', isdir: 0, size: 1, path: '/root/a.mp4' },
          { fs_id: 2, server_filename: 'b.mp4', isdir: 0, size: 1, path: '/root/b.mp4' },
          { fs_id: 3, server_filename: 'c.mp4', isdir: 0, size: 1, path: '/root/c.mp4' },
        ],
      }),
    });
    const { scanVideos } = await import('./baidu-netdisk');
    const result = await scanVideos('/root', { maxFiles: 2 });
    expect(result.videos).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });
});

describe('百度网盘：exchangeCode', () => {
  it('授权码一次性：invalid_grant 时提示只能使用一次', async () => {
    mockFetch({
      token: () => jsonResponse({ error: 'invalid_grant', error_description: 'invalid code' }),
    });
    const { exchangeCode } = await import('./baidu-netdisk');
    await expect(exchangeCode('abcdefgh1234')).rejects.toThrow(/只能用一次/);
  });

  it('应用凭据被拒时提示检查环境变量', async () => {
    mockFetch({
      token: () => jsonResponse({ error: 'invalid_client', error_description: 'unknown client id' }),
    });
    const { exchangeCode } = await import('./baidu-netdisk');
    await expect(exchangeCode('abcdefgh1234')).rejects.toThrow(/BAIDU_CLIENT_ID/);
  });
});