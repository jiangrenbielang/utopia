import { describe, expect, it, vi } from 'vitest';

// 最小 window mock：matchMedia / innerWidth / utopiaDesktop 均可注入
function stubWindow(opts: { coarse?: boolean; width?: number; desktop?: boolean }) {
  vi.stubGlobal('window', {
    matchMedia: (q: string) => ({ matches: q.includes('coarse') ? Boolean(opts.coarse) : false }),
    innerWidth: opts.width ?? 1280,
    ...(opts.desktop ? { utopiaDesktop: { isDesktop: true } } : {}),
  });
}

import { detectPlatform, isDesktopApp } from './platform';

describe('平台检测', () => {
  it('Electron 桌面客户端：桥存在即 desktop（宽窄触屏都不影响）', () => {
    stubWindow({ desktop: true, coarse: true, width: 400 });
    expect(isDesktopApp()).toBe(true);
    expect(detectPlatform()).toBe('desktop');
  });

  it('移动端：粗指针 + 窄视口（< 640）', () => {
    stubWindow({ coarse: true, width: 390 });
    expect(detectPlatform()).toBe('mobile');
  });

  it('触屏笔记本：粗指针但宽视口 → web（不误判为移动端）', () => {
    stubWindow({ coarse: true, width: 1280 });
    expect(detectPlatform()).toBe('web');
  });

  it('桌面浏览器：细指针宽视口 → web', () => {
    stubWindow({ coarse: false, width: 1280 });
    expect(detectPlatform()).toBe('web');
  });

  it('窄窗口的桌面浏览器（细指针）→ web', () => {
    stubWindow({ coarse: false, width: 500 });
    expect(detectPlatform()).toBe('web');
  });

  it('matchMedia 抛错时回落 web', () => {
    vi.stubGlobal('window', {
      matchMedia: () => {
        throw new Error('no matchMedia');
      },
      innerWidth: 390,
    });
    expect(detectPlatform()).toBe('web');
  });
});
