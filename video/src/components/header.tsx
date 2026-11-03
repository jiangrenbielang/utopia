'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './theme';
import { Icon } from './icon';
import { SHELL_WIDTH, SHELL_PADDING } from './layout-metrics';
import { cn } from '@/lib/utils';

/**
 * TVBox 风顶部栏：左侧朴素字标 Logo + 中间横向可滑的分类 tab + 右侧搜索 / 主题 / 设置。
 * 分类 tab 的选中判定沿用原有 isActive（pathname 精确匹配或前缀匹配），只改视觉层。
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
        'sticky top-0 z-40 bg-surface/95 backdrop-blur border-b border-line',
        // 浅色主题：白底顶栏加一层极轻投影，避免与浅灰页面底贴平；
        // 深色主题靠边框与底色差已足够，不加阴影（TVBox 平涂观感）
        'shadow-[0_1px_3px_rgb(0_0_0/0.04)] dark:shadow-none',
        // 桌面端（WCO）：整条顶栏即标题栏，可拖拽移动窗口
        'app-region-drag'
      )}
      // 右侧给系统最小化/最大化/关闭按钮让位（--ut-titlebar-w 由首屏脚本注入；
      // 浏览器端无此变量，回落为 0，外观不变）
      style={{ paddingRight: 'var(--ut-titlebar-w, 0px)' }}
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
            drag 区内的交互元素需要 no-drag 才能点击 */}
        <nav className={cn('nav-strip min-w-0 flex-1 ml-1 app-region-no-drag')} aria-label="主导航">
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

        <div className="flex items-center gap-0.5 shrink-0 app-region-no-drag">
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

/** 移动端底部导航（首页 / 每日任务 / 课程 / 计时 / 统计；日志留在顶部导航） */
export function BottomNav() {
  const pathname = usePathname();
  const items: { href: string; label: string; icon: 'home' | 'list' | 'book' | 'clock' | 'chart' }[] = [
    { href: '/', label: '首页', icon: 'home' },
    { href: '/tasks', label: '任务', icon: 'list' },
    { href: '/courses', label: '课程', icon: 'book' },
    { href: '/timer', label: '计时', icon: 'clock' },
    { href: '/stats', label: '统计', icon: 'chart' },
  ];

  return (
    <nav
      className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line bg-surface/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="底部导航"
    >
      <div className="grid grid-cols-5">
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
      </div>
    </nav>
  );
}