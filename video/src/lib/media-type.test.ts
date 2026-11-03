import { describe, expect, it } from 'vitest';
import { guessMediaType } from './media-type';

/**
 * 播放器类型推断。
 *
 * 回归背景：ArtPlayer 里 `type: 'm3u8'` 会覆盖一切，导致 mp4 直链被塞进 hls.js
 * 而**永远播不出来**（网盘视频就是这样一直黑屏）。这里钉住两类地址的判定。
 */
describe('guessMediaType', () => {
  it('明确后缀：m3u8 → hls，mp4/mkv → file', () => {
    expect(guessMediaType('https://cdn.example.com/a/index.m3u8')).toBe('hls');
    expect(guessMediaType('https://cdn.example.com/a/index.m3u8?token=1')).toBe('hls');
    expect(guessMediaType('https://cdn.example.com/a/lesson.mp4')).toBe('file');
    expect(guessMediaType('https://cdn.example.com/a/lesson.mp4?v=2')).toBe('file');
    expect(guessMediaType('https://cdn.example.com/a/lesson.mkv')).toBe('file');
  });

  it('网盘流接口默认按文件处理（mp4 为主）', () => {
    expect(guessMediaType('/api/netdisk/stream?fsid=209975573828907')).toBe('file');
    expect(guessMediaType('http://127.0.0.1:3210/api/netdisk/stream?fsid=1')).toBe('file');
  });

  it('网盘流带 name 时按文件名判断（网盘里的 m3u8 仍走 HLS）', () => {
    expect(guessMediaType('/api/netdisk/stream?fsid=1&name=%E7%AC%AC1%E8%AE%B2.mp4')).toBe('file');
    expect(guessMediaType('/api/netdisk/stream?fsid=1&name=index.m3u8')).toBe('hls');
  });

  it('代理地址：解码后能看出是 HLS', () => {
    const proxied = '/api/proxy?url=' + encodeURIComponent('https://cdn.example.com/v/index.m3u8?sign=abc');
    expect(guessMediaType(proxied)).toBe('hls');
  });

  it('没有扩展名的采集站地址沿用 HLS 兜底', () => {
    expect(guessMediaType('https://api.example.com/play?vod=123')).toBe('hls');
    expect(guessMediaType('/api/watch/abc')).toBe('hls');
  });

  it('空地址按 HLS 兜底（不改变既有首页行为）', () => {
    expect(guessMediaType('')).toBe('hls');
    expect(guessMediaType(undefined)).toBe('hls');
  });
});