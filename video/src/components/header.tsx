'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './theme';
import { Icon } from './icon';
import { cn } from '@/lib/utils';

/**
 * 顶部导航：Logo / 主导航 / 主题切换 / 学习设置。
 * 视觉沿用 LibreTV（深蓝黑底、霓虹蓝强调色、品牌渐变字），导航内容改为考研学习平台。
 */

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: '/', label: '首页' },
  { href: '/courses', label: '课程' },
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
    <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-line">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
        <Link href="/" aria-label="Utopia 首页" className="flex items-center gap-2 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-512.png" alt="Utopia" className="w-7 h-7 rounded-lg" />
          <span className="brand-gradient text-lg font-bold tracking-tight">Utopia</span>
          <span className="hidden sm:inline-flex items-center rounded-full border border-line px-2 py-0.5 text-[10px] text-faint">
            考研网课
          </span>
        </Link>

        <nav className="hidden sm:flex items-center gap-0.5 ml-4" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'px-2.5 py-1.5 rounded-md text-sm transition-colors',
                isActive(pathname, item.href) ? 'text-content bg-hover' : 'text-muted hover:text-content hover:bg-hover/60'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-0.5">
          <Link
            href="/resources"
            className={cn(
              'hidden md:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm transition-colors',
              isActive(pathname, '/resources') ? 'text-content bg-hover' : 'text-muted hover:text-content hover:bg-hover/60'
            )}
          >
            资源库
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

/** 移动端底部导航（首页 / 课程 / 计时 / 统计 / 日志） */
export function BottomNav() {
  const pathname = usePathname();
  const items: { href: string; label: string; icon: 'home' | 'book' | 'clock' | 'chart' | 'list' }[] = [
    { href: '/', label: '首页', icon: 'home' },
    { href: '/courses', label: '课程', icon: 'book' },
    { href: '/timer', label: '计时', icon: 'clock' },
    { href: '/stats', label: '统计', icon: 'chart' },
    { href: '/logs', label: '日志', icon: 'list' },
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
