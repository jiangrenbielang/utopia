import { describe, expect, it } from 'vitest';
import { buildParseRequest, looksLikeHtml, parsePlayResult } from './parse-url';

/**
 * 解析契约的纯函数用例。
 *
 * 重点钉住两条**实测得来**的口径：
 * 1. 解析地址几乎都自带 `?url=` 尾巴，此时要**直接拼接原始地址**（不编码）——
 *    实测同一接口「拼接编码后地址」超时，而「原始地址直接拼接」返回 200；
 * 2. 返回 HTML 播放页是**可预期的正常结果**（浏览器嗅探类线路），
 *    必须判成 `needs-browser` 而不是「不是合法 JSON」。
 */

const TARGET = 'https://v.example.com/play/1';

describe('buildParseRequest', () => {
  it('地址以 = 结尾时直接拼接原始地址（不编码）', () => {
    expect(buildParseRequest('https://jx.example.com/?url=', TARGET)).toBe(
      `https://jx.example.com/?url=${TARGET}`
    );
    expect(buildParseRequest('https://jx.example.com/player/?url=', TARGET)).toBe(
      `https://jx.example.com/player/?url=${TARGET}`
    );
  });

  it('地址已带查询串但结尾不是 = 时用 & 补 url 参数', () => {
    expect(buildParseRequest('https://jx.example.com/p?token=abc', TARGET)).toBe(
      `https://jx.example.com/p?token=abc&url=${TARGET}`
    );
  });

  it('地址没有查询串时用 ? 补 url 参数', () => {
    expect(buildParseRequest('https://jx.example.com/player', TARGET)).toBe(
      `https://jx.example.com/player?url=${TARGET}`
    );
  });

  it('空地址返回空串', () => {
    expect(buildParseRequest('', TARGET)).toBe('');
    expect(buildParseRequest('   ', TARGET)).toBe('');
  });
});

describe('looksLikeHtml', () => {
  it('按内容判定播放页（含前导 BOM 与空白）', () => {
    expect(looksLikeHtml('<!DOCTYPE html><html>…')).toBe(true);
    expect(looksLikeHtml('\uFEFF\n  <html><body></body></html>')).toBe(true);
    expect(looksLikeHtml('<head><meta charset="utf-8"></head>')).toBe(true);
  });

  it('按 Content-Type 判定', () => {
    expect(looksLikeHtml('whatever', 'text/html; charset=utf-8')).toBe(true);
    expect(looksLikeHtml('{"url":"x"}', 'application/json')).toBe(false);
  });

  it('JSON 不算播放页', () => {
    expect(looksLikeHtml('{"url":"https://a.com/x.m3u8"}')).toBe(false);
    expect(looksLikeHtml('')).toBe(false);
  });
});

describe('parsePlayResult', () => {
  it('拿到 http(s) 地址即解析成功，并透传防盗链请求头', () => {
    const outcome = parsePlayResult(
      JSON.stringify({ url: 'https://cdn.example.com/x.m3u8', header: { Referer: 'https://v.example.com/' } })
    );
    expect(outcome).toEqual({
      kind: 'resolved',
      url: 'https://cdn.example.com/x.m3u8',
      header: { Referer: 'https://v.example.com/' },
    });
  });

  it('只接受 http(s)：其它协议视为没有可用地址', () => {
    expect(parsePlayResult(JSON.stringify({ url: 'ftp://cdn.example.com/x.m3u8' })).kind).toBe('no-url');
    expect(parsePlayResult(JSON.stringify({ url: '' })).kind).toBe('no-url');
  });

  it('返回播放页时判为 needs-browser（这是正常结果，不是错误）', () => {
    const outcome = parsePlayResult('<html><body><div id="player"></div></body></html>', 'text/html');
    expect(outcome.kind).toBe('needs-browser');
    if (outcome.kind === 'needs-browser') expect(outcome.message).toContain('浏览器');
  });

  it('JSON 里没有地址时带上上游给的原因', () => {
    const outcome = parsePlayResult(JSON.stringify({ msg: '该视频需要 VIP 会员' }));
    expect(outcome.kind).toBe('no-url');
    if (outcome.kind === 'no-url') expect(outcome.message).toContain('该视频需要 VIP 会员');
  });

  it('空响应、非 JSON、JSON 数组都给出可判定的结果而不是抛错', () => {
    expect(parsePlayResult('').kind).toBe('empty');
    expect(parsePlayResult('   ').kind).toBe('empty');
    expect(parsePlayResult('not json at all').kind).toBe('no-url');
    expect(parsePlayResult('[1,2,3]').kind).toBe('no-url');
    expect(parsePlayResult('null').kind).toBe('no-url');
  });

  it('多余字段忽略，header 里的非字符串项被丢弃', () => {
    const outcome = parsePlayResult(
      JSON.stringify({
        url: 'https://cdn.example.com/a.m3u8',
        jx: 1,
        flag: 'qq',
        header: { Referer: 'https://v.example.com/', 'x-empty': '', 'x-num': 3 },
      })
    );
    expect(outcome.kind).toBe('resolved');
    if (outcome.kind === 'resolved') expect(outcome.header).toEqual({ Referer: 'https://v.example.com/' });
  });
});