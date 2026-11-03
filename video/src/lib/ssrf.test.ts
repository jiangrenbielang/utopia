import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  allowLivePrivate,
  allowPrivateAny,
  allowPrivateUpstream,
  checkLiveUrlAllowed,
  checkPrivateAllowed,
  checkProxyUrlAllowed,
  isPrivateIP,
  isValidProxyUrl,
} from './ssrf';

describe('isPrivateIP', () => {
  it.each([
    ['127.0.0.1', true],
    ['10.1.2.3', true],
    ['192.168.1.1', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['172.32.0.1', false],
    ['169.254.169.254', true],
    ['100.64.0.1', true],
    ['::1', true],
    ['fe80::1', true],
    ['fd00::1', true],
    ['8.8.8.8', false],
    ['1.2.3.4', false],
    // URL.hostname 对 IPv6 会带方括号
    ['[::1]', true],
    ['[fe80::1]', true],
    ['[fd00::1]', true],
    ['[fc00::1]', true],
    // IPv4-mapped IPv6：十六进制形式与点分形式
    ['[::ffff:c0a8:164]', true], // ::ffff:192.168.1.100
    ['::ffff:192.168.1.100', true],
    ['[::ffff:7f00:1]', true], // ::ffff:127.0.0.1
    ['::ffff:127.0.0.1', true],
    ['[::ffff:a9fe:a9fe]', true], // ::ffff:169.254.169.254
    ['[::ffff:a00:1]', true], // ::ffff:10.0.0.1
    ['[::ffff:808:808]', false], // ::ffff:8.8.8.8 公网
    ['::ffff:8.8.8.8', false],
    ['[::ffff:c0a8:164', true], // 单边括号（异常输入）仍要拦
    ['[2606:4700::1111]', false], // 公网 IPv6 不应被误杀
  ])('%s → %s', (ip, expected) => {
    expect(isPrivateIP(ip)).toBe(expected);
  });
});

describe('isValidProxyUrl', () => {
  it('放行公网 http(s)', () => {
    expect(isValidProxyUrl('https://cdn.example.com/a.m3u8')).toBe(true);
    expect(isValidProxyUrl('http://1.2.3.4/x.ts')).toBe(true);
  });

  it('拦截内网与保留地址', () => {
    expect(isValidProxyUrl('http://localhost/x')).toBe(false);
    expect(isValidProxyUrl('http://127.0.0.1/x')).toBe(false);
    expect(isValidProxyUrl('http://192.168.1.1/x')).toBe(false);
    expect(isValidProxyUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
  });

  it('拦截带方括号的 IPv6 与 IPv4-mapped 写法', () => {
    expect(isValidProxyUrl('http://[::1]:8080/x')).toBe(false);
    expect(isValidProxyUrl('http://[::ffff:192.168.1.100]:8080/list.m3u')).toBe(false);
    expect(isValidProxyUrl('http://[::ffff:127.0.0.1]/x')).toBe(false);
    expect(isValidProxyUrl('http://[fe80::1]/x')).toBe(false);
    expect(isValidProxyUrl('http://[fd00::1]/x')).toBe(false);
  });

  it('不误杀公网 IPv6', () => {
    expect(isValidProxyUrl('http://[2606:4700::1111]/x')).toBe(true);
  });

  it('拦截非 http 协议', () => {
    expect(isValidProxyUrl('file:///etc/passwd')).toBe(false);
    expect(isValidProxyUrl('ftp://x.com/a')).toBe(false);
    expect(isValidProxyUrl('not a url')).toBe(false);
  });
});

/**
 * 自建网盘（AList / OpenList）场景的准入开关。
 *
 * 加这一组是因为「内网地址」在播放侧本来是被一律拒绝的：AList 通常跑在
 * `127.0.0.1:5244` 或 `192.168.x.x:5244`，不放行的话用户把直链填进课程也播不出来。
 * 同时要钉住两件事：**开关默认关闭**，且**两个开关互不串门**（直播的开关
 * 不该顺手打开播放侧，反之亦然）。
 */
describe('allowPrivateUpstream / checkProxyUrlAllowed', () => {
  const saved = { upstream: process.env.ALLOW_PRIVATE_UPSTREAM, live: process.env.LIVE_ALLOW_PRIVATE };

  beforeEach(() => {
    delete process.env.ALLOW_PRIVATE_UPSTREAM;
    delete process.env.LIVE_ALLOW_PRIVATE;
  });

  afterEach(() => {
    if (saved.upstream === undefined) delete process.env.ALLOW_PRIVATE_UPSTREAM;
    else process.env.ALLOW_PRIVATE_UPSTREAM = saved.upstream;
    if (saved.live === undefined) delete process.env.LIVE_ALLOW_PRIVATE;
    else process.env.LIVE_ALLOW_PRIVATE = saved.live;
  });

  it('默认关闭：内网直链一律不放行（AList 的默认端口也不例外）', async () => {
    expect(allowPrivateUpstream()).toBe(false);
    const verdict = await checkProxyUrlAllowed('http://127.0.0.1:5244/d/video.m3u8');
    expect(verdict.ok).toBe(false);
    const lan = await checkProxyUrlAllowed('http://192.168.1.9:5244/d/video.m3u8');
    expect(lan.ok).toBe(false);
  });

  it('打开后放行内网（含本机与局域网），且不触发 DNS 解析', async () => {
    process.env.ALLOW_PRIVATE_UPSTREAM = '1';
    expect(allowPrivateUpstream()).toBe(true);
    expect((await checkProxyUrlAllowed('http://127.0.0.1:5244/d/video.m3u8')).ok).toBe(true);
    expect((await checkProxyUrlAllowed('http://192.168.1.9:5244/d/seg.ts')).ok).toBe(true);
  });

  it('打开后仍强制 http(s) 协议：放行内网不等于放行任意协议', async () => {
    process.env.ALLOW_PRIVATE_UPSTREAM = '1';
    expect((await checkProxyUrlAllowed('ftp://127.0.0.1/x')).ok).toBe(false);
    expect((await checkProxyUrlAllowed('file:///etc/passwd')).ok).toBe(false);
    expect((await checkProxyUrlAllowed('not a url')).ok).toBe(false);
  });

  it('两个开关互不串门：播放侧开关不会放行直播侧，反之亦然', async () => {
    process.env.ALLOW_PRIVATE_UPSTREAM = '1';
    expect(allowLivePrivate()).toBe(false);
    // 直播侧仍按自己那把尺子拒绝内网
    expect((await checkLiveUrlAllowed('http://127.0.0.1:5244/live.m3u8')).ok).toBe(false);

    delete process.env.ALLOW_PRIVATE_UPSTREAM;
    process.env.LIVE_ALLOW_PRIVATE = '1';
    expect(allowPrivateUpstream()).toBe(false);
    expect((await checkProxyUrlAllowed('http://127.0.0.1:5244/d/video.m3u8')).ok).toBe(false);
    // 但「任一开关打开」的合并判定要为真，逐跳复检才不会把自建源挡在门外
    expect(allowPrivateAny()).toBe(true);
  });

  it('checkPrivateAllowed：放行内网时只校验协议', async () => {
    expect((await checkPrivateAllowed('http://192.168.1.9:5244/seg.ts')).ok).toBe(true);
    expect((await checkPrivateAllowed('https://127.0.0.1/a')).ok).toBe(true);
    expect((await checkPrivateAllowed('ftp://x/a')).ok).toBe(false);
  });
});
