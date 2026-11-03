import { describe, expect, it } from 'vitest';
import {
  MAX_WALLPAPER_BYTES,
  clampWallpaperDim,
  validateWallpaperFile,
  wallpaperBackgroundStyle,
} from './wallpapers';

/**
 * 壁纸导入的校验与压暗取值。
 *
 * 这里不碰 IndexedDB：只测纯函数，避免在 Node 里开数据库。
 */
describe('validateWallpaperFile', () => {
  it('接受常见图片格式', () => {
    expect(validateWallpaperFile({ type: 'image/png', size: 1024, name: 'a.png' })).toBeNull();
    expect(validateWallpaperFile({ type: 'image/jpeg', size: 1024, name: 'b.jpg' })).toBeNull();
    expect(validateWallpaperFile({ type: 'image/webp', size: 1024, name: 'c.webp' })).toBeNull();
  });

  it('拒绝非图片文件，并带上文件名便于定位', () => {
    const message = validateWallpaperFile({ type: 'application/pdf', size: 1024, name: '课件.pdf' });
    expect(message).toContain('课件.pdf');
    expect(message).toContain('不是图片');
  });

  it('拒绝空文件 / 读不到内容', () => {
    expect(validateWallpaperFile({ type: 'image/png', size: 0 })).toContain('为空');
    expect(validateWallpaperFile({ type: 'image/png', size: Number.NaN })).toContain('为空');
  });

  it('超过上限时给出可读提示（含实际上限）', () => {
    const message = validateWallpaperFile({ type: 'image/png', size: MAX_WALLPAPER_BYTES + 1, name: 'big.png' });
    expect(message).toContain('太大');
    expect(message).toContain(String(MAX_WALLPAPER_BYTES / 1024 / 1024));
  });

  it('恰好等于上限时放行', () => {
    expect(validateWallpaperFile({ type: 'image/png', size: MAX_WALLPAPER_BYTES })).toBeNull();
  });
});

describe('wallpaperBackgroundStyle', () => {
  it('默认铺满：cover + 居中 + 不重复', () => {
    const style = wallpaperBackgroundStyle('blob:http://127.0.0.1:3210/abc');
    expect(style.backgroundImage).toBe('url("blob:http://127.0.0.1:3210/abc")');
    expect(style.backgroundSize).toBe('cover');
    expect(style.backgroundPosition).toBe('center');
    expect(style.backgroundRepeat).toBe('no-repeat');
  });

  it('完整模式：background-size 为 contain', () => {
    expect(wallpaperBackgroundStyle('https://x/y.png', 'contain').backgroundSize).toBe('contain');
  });

  it('地址里的双引号要转义，否则 url("…") 会被截断', () => {
    const style = wallpaperBackgroundStyle('https://x/a"b.png');
    expect(style.backgroundImage).toContain('%22');
    expect(style.backgroundImage).not.toContain('a"b');
  });

  it('空地址不抛错（构造出空 url）', () => {
    expect(() => wallpaperBackgroundStyle('')).not.toThrow();
  });
});

describe('clampWallpaperDim', () => {
  it('夹在 0–95 并取整', () => {
    expect(clampWallpaperDim(-20)).toBe(0);
    expect(clampWallpaperDim(200)).toBe(95);
    expect(clampWallpaperDim(33.6)).toBe(34);
  });

  it('非法值回落默认 78', () => {
    expect(clampWallpaperDim(Number.NaN)).toBe(78);
    expect(clampWallpaperDim('abc')).toBe(78);
    expect(clampWallpaperDim(undefined)).toBe(78);
  });

  it('字符串数字按数值处理（滑块给的是字符串）', () => {
    expect(clampWallpaperDim('42')).toBe(42);
  });
});