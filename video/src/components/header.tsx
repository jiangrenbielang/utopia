'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './theme';
import { Icon } from './icon';
import { SHELL_WIDTH, SHELL_PADDING } from './layout-metrics';
import { cn } from '@/lib/utils';

/**
 * TVBox 风顶部栏：左侧朴素字标 Logo + 中间横向可滑的分类 tab + 右侧搜索 / 主题 / 设置。
 *
 * 三端形态（对齐策略）：
 * - 桌面端：完整顶栏导航 + WCO 系统按钮让位（env(titlebar-area-*)）+ 可拖拽；
 * - web 端：完整顶栏导航（与桌面一致的玻璃观感，无 WCO 让位——env 回落 0）；
 * - 移动端：顶栏精简为 Logo + 操作按钮（导航交给底部 BottomNav），
 *   避免窄屏上一条 9 项滚动条与底部导航的冗余。
 */

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: '/', label: '首页' },
  { href: '/tasks', label: '每日任务' },
  { href: '/courses', label: '课程' },
  { href: '/netdisk', label: '网盘' },
  { href: '/resources', label: '资源库' },
  { href: '/browse', label: '分类' },
  { href: '/timer', label: '计时' },
  { href: '/stats', label: '统计' },
  { href: '/logs', label: '日志' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Header() {
  const pathname = usePathname();

  return (
    <header
      className={cn(
        // 三端统一玻璃基线：0.85 半透明 + blur(20) + 提饱和（globals.css .glass-bar）；
        // 壁纸模式与桌面亚克力由更高特异性规则覆盖（0.52 / 0.38）
        'glass-bar sticky top-0 z-40 border-b border-line',
        // 浅色主题：白底顶栏加一层极轻投影，避免与浅灰页面底贴平；
        // 深色主题靠边框与底色差已足够，不加阴影（TVBox 平涂观感）
        'shadow-[0_1px_3px_rgb(0_0_0/0.04)] dark:shadow-none',
        // 桌面端（WCO）：整条顶栏即标题栏，可拖拽移动窗口
        'app-region-drag'
      )}
      // 右侧给系统最小化/最大化/关闭按钮让位。用 WCO 标准环境变量计算按钮区宽度
      // （titlebar-area 是排除系统按钮后的应用可控区）：视口宽 - area-x - area-width。
      // 浏览器端 env 回落（x=100vw、width=0px）→ padding 0，外观不变；
      // 桌面端随窗口状态（最大化/还原/DPI 变化）实时生效，无首屏时序依赖。
      style={{
        paddingRight: 'calc(100vw - env(titlebar-area-x, 100vw) - env(titlebar-area-width, 0px))',
      }}
    >
      <div className={cn('mx-auto h-14 flex items-center gap-3', SHELL_WIDTH, SHELL_PADDING)}>
        {/* 朴素字标：TVBox 不做品牌渐变字，只用一个强调色句点点缀 */}
        <Link href="/" aria-label="Utopia 首页" className="flex items-center gap-2 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-512.png" alt="Utopia" className="w-7 h-7 rounded-md" />
          <span className="text-lg font-bold tracking-tight text-content">
            Utopia<span className="text-accent">.</span>
          </span>
          <span className="hidden xl:inline-flex items-center rounded-full border border-line px-2 py-0.5 text-[10px] text-faint">
            考研网课
          </span>
        </Link>

        {/* 横向可滑分类 tab：溢出可滑动、滚动条隐藏（TVBox 顶部栏观感）。
            移动端隐藏——导航由底部 BottomNav 承担（网盘/资源库等次级入口在「更多」里）。
            drag 区内的交互元素需要 no-drag 才能点击 */}
        <nav
          className={cn('nav-strip min-w-0 flex-1 ml-1 app-region-no-drag hidden sm:flex')}
          aria-label="主导航"
        >
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn('nav-tab', isActive(pathname, item.href) && 'nav-tab-active')}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* ml-auto：移动端（nav 隐藏时）把操作按钮推到右侧；
            sm+ 时 nav 的 flex-1 已占满空间，ml-auto 无额外效果 */}
        <div className="flex items-center gap-0.5 shrink-0 app-region-no-drag ml-auto sm:ml-0">
          <Link
            href="/resources"
            className="p-2 rounded-md text-muted hover:text-content hover:bg-hover transition-colors"
            title="搜索资源库"
            aria-label="搜索资源库"
          >
            <Icon name="search" />
          </Link>
          <ThemeToggle />
          <Link
            href="/settings"
            className="p-2 rounded-md text-muted hover:text-content hover:bg-hover transition-colors"
            title="学习设置"
            aria-label="学习设置"
          >
            <Icon name="gear" />
          </Link>
        </div>
      </div>
    </header>
  );
}

/** 移动端底部导航的次级页面（顶栏导航项里不在底部五个主位中的） */
const MORE_ITEMS: { href: string; label: string }[] = [
  { href: '/netdisk', label: '网盘' },
  { href: '/resources', label: '资源库' },
  { href: '/browse', label: '分类' },
  { href: '/logs', label: '日志' },
];

/**
 * 移动端底部导航：五个主位（首页 / 任务 / 课程 / 计时 / 统计）+ 「更多」。
 *
 * 「更多」展开一个贴在底部导航上方的次级页面面板（网盘 / 资源库 / 分类 / 日志），
 * 保证移动端与桌面端顶栏的**导航能力完全对等**；路由变化时自动收起。
 * 玻璃观感与顶栏共用 .glass-bar 基线。
 */
export function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // 路由变化即收起「更多」面板：导航完成后不该残留菜单
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const items: { href: string; label: string; icon: 'home' | 'list' | 'book' | 'clock' | 'chart' }[] = [
    { href: '/', label: '首页', icon: 'home' },
    { href: '/tasks', label: '任务', icon: 'list' },
    { href: '/courses', label: '课程', icon: 'book' },
    { href: '/timer', label: '计时', icon: 'clock' },
    { href: '/stats', label: '统计', icon: 'chart' },
  ];

  return (
    <>
      {/* 「更多」展开时的点击捕获层：点到面板外即收起（在 nav 之下，不挡面板本体） */}
      {moreOpen && (
        <div className="fixed inset-0 z-30 bg-black/30 animate-fade-in" onClick={() => setMoreOpen(false)} aria-hidden />
      )}
      <nav
        className={cn('sm:hidden fixed bottom-0 inset-x-0 z-40 glass-bar border-t border-line')}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="底部导航"
      >
        {/* 「更多」面板：贴在底部导航正上方，同玻璃基线 + 上圆角 */}
        {moreOpen && (
          <div className="absolute bottom-full inset-x-0 glass-bar border-t border-line rounded-t-xl p-2.5 shadow-lg">
            <div className="grid grid-cols-4 gap-1.5">
              {MORE_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg py-2.5 text-xs transition-colors',
                    isActive(pathname, item.href)
                      ? 'bg-accent/12 text-accent'
                      : 'text-muted hover:bg-hover hover:text-content'
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-6">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors',
                  active ? 'text-accent' : 'text-faint'
                )}
              >
                <Icon name={item.icon} className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            className={cn(
              'flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors',
              moreOpen ? 'text-accent' : 'text-faint'
            )}
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-label="更多页面"
          >
            <Icon name="dots" className="w-5 h-5" />
            更多
          </button>
        </div>
      </nav>
    </>
  );
}
