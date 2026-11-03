import { describe, expect, it, vi } from 'vitest';

// jsdom 之外的最小 DOM mock：desktop-bridge 只用 documentElement.classList 与 localStorage
const classSet = new Set<string>();
vi.stubGlobal('document', {
  documentElement: {
    classList: {
      contains: (c: string) => classSet.has(c),
      add: (c: string) => classSet.add(c),
      remove: (c: string) => classSet.delete(c),
      toggle: (c: string, on: boolean) => (on ? classSet.add(c) : classSet.delete(c)),
    },
  },
});

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
});

import { buildSyncPayload, pageAppearanceDark } from './desktop-bridge';

describe('桌面外观同步载荷（buildSyncPayload）', () => {
  // 模拟主题应用后的 DOM 实况：dark 主题会给 <html> 加 .dark 类（首屏脚本/ThemeProvider）
  it.each([
    ['dark', ['dark'], true, true],
    ['light', [], false, false],
    ['system', ['dark'], true, 'system'],
    ['system', [], false, 'system'],
  ] as const)('主题 %s + 类 %j：headerDark=%s, theme=%s', (theme, classes, dark, expectedTheme) => {
    store.set('libretv-theme', theme);
    classSet.clear();
    for (const c of classes) classSet.add(c);
    const p = buildSyncPayload();
    expect(p.headerDark).toBe(dark);
    expect(p.theme).toBe(expectedTheme);
  });

  it('壁纸模式：即便浅色主题，顶栏按深色（图标取白色）', () => {
    store.set('libretv-theme', 'light');
    classSet.clear();
    classSet.add('has-wallpaper');
    expect(pageAppearanceDark()).toBe(true);
    const p = buildSyncPayload();
    expect(p.headerDark).toBe(true);
    // 壁纸强制深色 HUD：themeSource 也写 dark，系统对话框与页面同色
    expect(p.theme).toBe(true);
  });

  it('system 主题 + 壁纸：theme 写 dark 而非恢复 system（页面已被强制深色）', () => {
    store.set('libretv-theme', 'system');
    classSet.clear();
    classSet.add('has-wallpaper');
    const p = buildSyncPayload();
    expect(p.theme).toBe(true);
    expect(p.headerDark).toBe(true);
  });

  it('无 localStorage（隐私模式等）：storedThemeChoice 默认 dark，theme 写 headerDark 的布尔值', () => {
    store.clear();
    classSet.clear();
    const p = buildSyncPayload();
    // 存储缺失按 dark 主题处理，但 DOM 无类无壁纸 → headerDark=false → theme=false（布尔）
    expect(p.headerDark).toBe(false);
    expect(p.theme).toBe(false);
  });
});
