import { describe, expect, it } from 'vitest';
import {
  hasTvboxExtras,
  isTvboxConfig,
  normalizeTvboxConfig,
  parseTvboxConfig,
  parseTvboxSpider,
  resolveTvboxUrl,
  tvboxConfigExtras,
  tvboxFirstRepoUrl,
  tvboxFlagOptions,
  tvboxLiveExtensionHint,
  tvboxLiveKind,
  tvboxSiteKind,
} from './tvbox-config';

/**
 * TVBOX 配置数据层的用例。
 *
 * 断言依据来自真实配置抽样与上游客户端源码（见 `docs/tvbox-config-and-ui-spec.md`），
 * 覆盖几条**容易写反**的语义：`flags` 是解析线路白名单而非首页分组、`type=2` 与
 * `type=1` 同样可导入、`msg` 会中止加载、多仓 `urls` 与单仓互斥、直播格式按内容嗅探。
 */

const CONFIG_URL = 'https://example.com/tvbox/config.json';

describe('isTvboxConfig', () => {
  it('顶层含 sites / lives 即判定为 TVBOX 配置', () => {
    expect(isTvboxConfig({ sites: [] })).toBe(true);
    expect(isTvboxConfig({ lives: [] })).toBe(true);
    expect(isTvboxConfig({ name: 'x' })).toBe(false);
    expect(isTvboxConfig(null)).toBe(false);
  });
});

describe('resolveTvboxUrl', () => {
  it('相对路径相对配置地址解析，而不是相对页面', () => {
    expect(resolveTvboxUrl('./lib/iptv.m3u', CONFIG_URL)).toBe('https://example.com/tvbox/lib/iptv.m3u');
    expect(resolveTvboxUrl('../shared/a.txt', CONFIG_URL)).toBe('https://example.com/shared/a.txt');
  });

  it('绝对地址与伪协议原样返回', () => {
    expect(resolveTvboxUrl('https://a.example.com/x.m3u', CONFIG_URL)).toBe('https://a.example.com/x.m3u');
    expect(resolveTvboxUrl('proxy://do=live&type=txt', CONFIG_URL)).toBe('proxy://do=live&type=txt');
  });

  it('缺少配置地址时原样返回相对路径', () => {
    expect(resolveTvboxUrl('./lib/x.txt', undefined)).toBe('./lib/x.txt');
    expect(resolveTvboxUrl(undefined, CONFIG_URL)).toBeUndefined();
  });
});

describe('parseTvboxSpider', () => {
  it('拆出地址与 md5', () => {
    const spider = parseTvboxSpider('./lib/jinenge.jar;md5;1d7a5147033044a81f91d5f4a510f9ed');
    expect(spider).toMatchObject({
      url: './lib/jinenge.jar',
      md5: '1d7a5147033044a81f91d5f4a510f9ed',
      relative: true,
    });
  });

  it('没有 md5 后缀时只留地址', () => {
    expect(parseTvboxSpider('./jar/top98_1.jar')).toMatchObject({ url: './jar/top98_1.jar', md5: undefined });
    expect(parseTvboxSpider('')).toBeUndefined();
  });
});

describe('tvboxSiteKind', () => {
  it('type=1 与 type=2 都算可直接使用的 JSON 采集站', () => {
    expect(tvboxSiteKind({ type: 1, api: 'https://a.com/api.php/provide/vod' })).toBe('json');
    // type=2 是 JSON 采集变体：上游与 type=1 走同一分支
    expect(tvboxSiteKind({ type: 2, api: 'https://a.com/inc/apijson_vod.php' })).toBe('json');
  });

  it('type=1 不依赖地址是否命中标准 CMS 路径', () => {
    expect(tvboxSiteKind({ type: 1, api: 'https://caiji.huakuiapi.com/inc/apijson_vod.php' })).toBe('json');
  });

  it('type=0 是 XML（除非地址命中 JSON 特征），type=3 是 Spider，type=4 是外链', () => {
    expect(tvboxSiteKind({ type: 0, api: 'https://a.com/inc/api.php' })).toBe('xml');
    expect(tvboxSiteKind({ type: 3, api: 'csp_AppYs' })).toBe('spider');
    expect(tvboxSiteKind({ type: 4, api: 'https://a.com/api' })).toBe('external');
  });

  it('csp_ / jar / js / py 与本地相对资源一律判为 Spider', () => {
    expect(tvboxSiteKind({ type: 1, api: 'csp_Xxx' })).toBe('spider');
    expect(tvboxSiteKind({ type: 1, api: './lib/drpy2.min.js' })).toBe('spider');
    expect(tvboxSiteKind({ type: 1, api: './json/x.json' })).toBe('spider');
  });
});

describe('tvboxLiveKind', () => {
  it('type=0 的播放列表一律按可用处理（扩展名不可信）', () => {
    expect(tvboxLiveKind({ type: 0, url: 'https://a.com/a.m3u' })).toBe('playlist');
    // 实测 jinenge 的 ./lib/interface.txt 内容就是标准 M3U
    expect(tvboxLiveKind({ type: 0, url: 'https://a.com/interface.txt' })).toBe('playlist');
    expect(tvboxLiveKind({ type: 0, url: 'https://a.com/no-extension' })).toBe('playlist');
  });

  it('单仓 JSON（group/channels）判为 single-file', () => {
    expect(tvboxLiveKind({ channels: [{ name: 'a', urls: ['x'] }] })).toBe('single-file');
    expect(tvboxLiveKind({ type: 1, url: 'https://a.com/live.json' })).toBe('single-file');
  });

  it('扩展名提示只用于展示', () => {
    expect(tvboxLiveExtensionHint({ url: 'a.m3u8' })).toBe('m3u');
    expect(tvboxLiveExtensionHint({ url: 'a.txt' })).toBe('txt');
    expect(tvboxLiveExtensionHint({ url: 'a' })).toBeUndefined();
  });
});

describe('normalizeTvboxConfig', () => {
  it('flags 字符串数组解析为解析线路白名单，不是首页分组', () => {
    const config = normalizeTvboxConfig({ flags: ['youku', 'qq', 'iqiyi'] });
    expect(config.platforms).toEqual(['youku', 'qq', 'iqiyi']);
    expect(config.flagGroups).toEqual([]);
  });

  it('flags 对象形态归到 flagGroups，并用 $%$ 拆选项', () => {
    const config = normalizeTvboxConfig({ flags: [{ key: 'class', name: '类型', value: '全部$%$动作片$%$喜剧片' }] });
    expect(config.platforms).toEqual([]);
    expect(config.flagGroups).toHaveLength(1);
    expect(tvboxFlagOptions(config.flagGroups[0])).toEqual(['全部', '动作片', '喜剧片']);
  });

  it('sites[].ext 与 filter 的字符串 / 对象两种形态都保留', () => {
    const config = normalizeTvboxConfig({
      sites: [
        { key: 'a', name: 'A', type: 3, api: 'csp_X', ext: { 'Cloud-drive': 'tvfan/x.txt' } },
        { key: 'b', name: 'B', type: 1, api: 'https://a.com/api.php/provide/vod', ext: '5++kw', filter: '{}' },
      ],
    });
    expect(config.sites[0].ext).toEqual({ 'Cloud-drive': 'tvfan/x.txt' });
    expect(config.sites[1].ext).toBe('5++kw');
    expect(config.sites[1].filter).toBe('{}');
  });

  it('相对路径字段相对配置地址解析；csp_ 站点不解析成绝对地址', () => {
    const config = normalizeTvboxConfig(
      {
        logo: './images/logo.png',
        wallpaper: './wallpaper/',
        sites: [
          { key: 'j', name: 'J', type: 3, api: 'csp_X', jar: './lib/x.jar' },
          { key: 'k', name: 'K', type: 3, api: './lib/drpy2.min.js' },
        ],
        lives: [{ name: 'L', type: 0, url: './lib/iptv.m3u' }],
      },
      CONFIG_URL
    );
    expect(config.logo).toBe('https://example.com/tvbox/images/logo.png');
    expect(config.wallpaper).toBe('https://example.com/tvbox/wallpaper/');
    expect(config.sites[0].jar).toBe('https://example.com/tvbox/lib/x.jar');
    // api 是 Spider 标识而非地址，必须原样保留
    expect(config.sites[1].api).toBe('./lib/drpy2.min.js');
    expect(config.lives[0].url).toBe('https://example.com/tvbox/lib/iptv.m3u');
  });

  it('保留 indexs / hide / searchable 等站点开关', () => {
    const config = normalizeTvboxConfig({
      sites: [{ key: 'a', name: 'A', type: 1, api: 'https://a.com/api.php/provide/vod', indexs: 1, searchable: 0, hide: 1 }],
    });
    expect(config.sites[0]).toMatchObject({ indexs: 1, searchable: false, hide: true });
  });

  it('parses：内置关键字标记 builtin，ext.flag 解析为线路白名单，type=4 保留', () => {
    const config = normalizeTvboxConfig({
      parses: [
        { name: 'Json并发', type: 2, url: 'Parallel' },
        { name: '某解析', type: 4, url: 'https://jx.example/api', ext: { flag: ['qq', 'youku'], header: { a: 'b' } } },
      ],
    });
    expect(config.parses[0].builtin).toBe(true);
    expect(config.parses[1].builtin).toBe(false);
    expect(config.parses[1].type).toBe(4);
    expect(config.parses[1].flag).toEqual(['qq', 'youku']);
    expect(config.parses[1].header).toEqual({ a: 'b' });
  });

  it('单仓 JSON 直播源不丢条目，channels 原样保留', () => {
    const config = normalizeTvboxConfig({
      lives: [
        { group: 'redirect', channels: [{ name: 'live', urls: ['proxy://do=live&type=txt'] }] },
        { name: '普通', type: 0, url: 'https://a.com/a.m3u' },
      ],
    });
    expect(config.lives).toHaveLength(2);
    expect(config.lives[0].group).toBe('redirect');
    expect(config.lives[0].channels).toEqual([{ name: 'live', urls: ['proxy://do=live&type=txt'] }]);
  });

  it('msg 与多仓 urls 单独识别', () => {
    const blocked = normalizeTvboxConfig({ msg: '本接口已失效' });
    expect(blocked.msg).toBe('本接口已失效');
    const multi = normalizeTvboxConfig({ urls: [{ name: '仓库一', url: 'https://a.com/1.json' }] }, CONFIG_URL);
    expect(multi.repos).toEqual([{ name: '仓库一', url: 'https://a.com/1.json' }]);
    expect(tvboxFirstRepoUrl(multi)).toBe('https://a.com/1.json');
    expect(tvboxFirstRepoUrl(blocked)).toBeUndefined();
  });
});

describe('parseTvboxConfig', () => {
  it('全是 Spider 站点的配置不抛错：payload 为空、有 importError、计数正确', () => {
    const parsed = parseTvboxConfig({
      sites: [
        { key: 'a', name: 'A', type: 3, api: 'csp_X' },
        { key: 'b', name: 'B', type: 3, api: './lib/drpy2.min.js' },
      ],
    });
    expect(parsed.payload).toBeNull();
    expect(parsed.importError).toBeTruthy();
    expect(parsed.siteKinds.spider).toBe(2);
    expect(parsed.unsupported).toBe(2);
    expect(parsed.blocked).toBe(false);
  });

  it('混合配置只导入可用条目，并把跳过数量算进 unsupported', () => {
    const parsed = parseTvboxConfig({
      sites: [
        { key: 'ok', name: '可用', type: 1, api: 'https://a.com/api.php/provide/vod' },
        { key: 'sp', name: '蜘蛛', type: 3, api: 'csp_X' },
        { key: 'xml', name: 'XML', type: 0, api: 'https://a.com/inc/api.php' },
      ],
    });
    expect(parsed.payload?.sources).toHaveLength(1);
    expect(parsed.siteKinds).toMatchObject({ json: 1, spider: 1, xml: 1 });
    expect(parsed.unsupported).toBe(2);
  });

  it('msg 配置直接判失效且不再尝试导入', () => {
    const parsed = parseTvboxConfig({ msg: '已失效', sites: [{ key: 'a', name: 'A', type: 1, api: 'https://a.com/api.php/provide/vod' }] });
    expect(parsed.blocked).toBe(true);
    expect(parsed.payload).toBeNull();
    expect(parsed.importError).toContain('已失效');
  });

  it('多仓配置提示改用仓库地址', () => {
    const parsed = parseTvboxConfig({ urls: [{ url: 'https://a.com/1.json' }] }, CONFIG_URL);
    expect(parsed.payload).toBeNull();
    expect(parsed.importError).toContain('多仓');
  });
});

describe('tvboxConfigExtras / hasTvboxExtras', () => {
  it('站点按 key 建索引，统计与 spider 原始值一并带出', () => {
    const extras = tvboxConfigExtras({
      name: '示例',
      spider: './lib/x.jar;md5;abc',
      sites: [{ key: 'a', name: 'A', type: 1, api: 'https://a.com/api.php/provide/vod' }],
    });
    expect(extras.sites.a).toMatchObject({ name: 'A', type: 1 });
    expect(extras.spider).toBe('./lib/x.jar;md5;abc');
    expect(extras.siteKinds.json).toBe(1);
    expect(hasTvboxExtras(extras)).toBe(true);
  });

  it('空配置不算「有内容」', () => {
    expect(hasTvboxExtras(tvboxConfigExtras({}))).toBe(false);
    expect(hasTvboxExtras(undefined)).toBe(false);
  });
});