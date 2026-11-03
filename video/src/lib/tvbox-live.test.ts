import { describe, expect, it } from 'vitest';
import { detectPlaylistFormat, parseTvboxPlaylist, parseTvboxTxt } from './tvbox-live';

/**
 * TVBOX 直播播放列表解析的用例。
 *
 * 核心动机：**扩展名不可信**——实测 `jinenge/tvbox` 的 `./lib/interface.txt`
 * 内容就是标准 M3U。因此必须按内容嗅探，否则会把可用源误判为不支持。
 */

const M3U_SAMPLE = [
  '#EXTM3U x-tvg-url="https://example.com/epg.xml"',
  '#EXTINF:-1 tvg-id="cctv1" tvg-logo="https://example.com/logo.png" group-title="央视",CCTV-1',
  'https://example.com/cctv1.m3u8',
  '#EXTINF:-1 group-title="卫视",湖南卫视',
  'https://example.com/hunan.m3u8',
].join('\n');

/** 后缀为 .txt，但内容其实是 M3U —— 真实配置里就是这样 */
const TXT_EXTENSION_M3U = `#EXTM3U x-tvg-url="https://example.com/epg.xml"\n${M3U_SAMPLE.split('\n').slice(1).join('\n')}`;

const TVBOX_TXT_SAMPLE = [
  '# 这是一行注释',
  '央视,#genre#',
  'CCTV-1,https://example.com/cctv1.m3u8',
  'CCTV-2, https://example.com/cctv2.m3u8',
  '',
  '卫视,#genre#',
  '湖南卫视,https://example.com/hunan.m3u8#https://example.com/hunan-backup.m3u8',
  'rtp组,rtp://239.0.0.1:1234',
  'CCTV-1,https://example.com/cctv1.m3u8',
].join('\n');

describe('detectPlaylistFormat', () => {
  it('首行有效内容为 #EXTM3U 即判为 M3U（容忍 BOM 与空行）', () => {
    expect(detectPlaylistFormat(M3U_SAMPLE)).toBe('m3u');
    expect(detectPlaylistFormat(`\uFEFF\n\n${M3U_SAMPLE}`)).toBe('m3u');
    expect(detectPlaylistFormat('#extm3u')).toBe('m3u');
  });

  it('内容是 M3U 时，即使扩展名无关也判为 M3U', () => {
    // 判定只看内容，调用方不该再用 .txt 之类的后缀做前置拒绝
    expect(detectPlaylistFormat(TXT_EXTENSION_M3U)).toBe('m3u');
  });

  it('其余按 TVBox txt 频道列表处理（空内容亦然）', () => {
    expect(detectPlaylistFormat(TVBOX_TXT_SAMPLE)).toBe('txt');
    expect(detectPlaylistFormat('')).toBe('txt');
  });
});

describe('parseTvboxTxt', () => {
  it('解析分组标记与频道行', () => {
    const channels = parseTvboxTxt(TVBOX_TXT_SAMPLE);
    expect(channels.map((c) => c.name)).toEqual(['CCTV-1', 'CCTV-2', '湖南卫视']);
    expect(channels[0].group).toBe('央视');
    expect(channels[1].group).toBe('央视');
    expect(channels[2].group).toBe('卫视');
  });

  it('多个地址用 # 分隔时取第一条可用地址', () => {
    const channels = parseTvboxTxt('卫视,#genre#\n湖南卫视,https://a.com/1.m3u8#https://a.com/2.m3u8');
    expect(channels).toHaveLength(1);
    expect(channels[0].url).toBe('https://a.com/1.m3u8');
  });

  it('丢弃浏览器无法播放的协议、跳过注释与重复地址', () => {
    const channels = parseTvboxTxt(TVBOX_TXT_SAMPLE);
    expect(channels.some((c) => c.url.startsWith('rtp://'))).toBe(false);
    // CCTV-1 出现两次，按 URL 去重
    expect(channels.filter((c) => c.url === 'https://example.com/cctv1.m3u8')).toHaveLength(1);
  });

  it('频道名含逗号时按最后一个逗号切分，不截断名称', () => {
    const channels = parseTvboxTxt('组,#genre#\nCCTV-1,综合,https://a.com/x.m3u8');
    expect(channels[0].name).toBe('CCTV-1,综合');
    expect(channels[0].url).toBe('https://a.com/x.m3u8');
  });

  it('相对地址相对播放列表地址解析', () => {
    const channels = parseTvboxTxt('组,#genre#\n频道,/live/x.m3u8', 'https://a.com/list/iptv.txt');
    expect(channels[0].url).toBe('https://a.com/live/x.m3u8');
  });

  it('空内容返回空数组', () => {
    expect(parseTvboxTxt('')).toEqual([]);
  });
});

describe('parseTvboxPlaylist', () => {
  it('按内容分派到 M3U 解析器', () => {
    const channels = parseTvboxPlaylist(M3U_SAMPLE);
    expect(channels.map((c) => c.name)).toEqual(['CCTV-1', '湖南卫视']);
    expect(channels[0].group).toBe('央视');
    expect(channels[0].tvgId).toBe('cctv1');
  });

  it('按内容分派到 TVBox txt 解析器', () => {
    const channels = parseTvboxPlaylist(TVBOX_TXT_SAMPLE);
    expect(channels.map((c) => c.name)).toEqual(['CCTV-1', 'CCTV-2', '湖南卫视']);
  });

  it('扩展名是 .txt 但内容是 M3U 时仍按 M3U 解析（真实配置的关键用例）', () => {
    const channels = parseTvboxPlaylist(TXT_EXTENSION_M3U, 'https://example.com/lib/interface.txt');
    expect(channels).toHaveLength(2);
    expect(channels[0].tvgId).toBe('cctv1');
  });
});