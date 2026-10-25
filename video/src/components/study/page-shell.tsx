'use client';

import type { ReactNode } from 'react';
import { Header, BottomNav } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';
import { cn } from '@/lib/utils';

/** 学习平台页面骨架：顶部导航 + 内容 + 页脚 + 移动端底部导航 */
export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className={cn('flex-1 w-full max-w-6xl mx-auto px-4 py-5 sm:py-7 pb-24 sm:pb-8', className)}>
        {children}
      </main>
      <SiteFooter />
      <BottomNav />
    </div>
  );
}
