'use client';

import { useEffect, type ReactNode } from 'react';
import { Header, BottomNav } from '@/components/header';
import { SHELL_WIDTH, SHELL_PADDING } from '@/components/layout-metrics';
import { ensurePlanCourses } from '@/lib/study/plan-init';
import { cn } from '@/lib/utils';

export { SHELL_WIDTH, SHELL_PADDING };

/**
 * 学习平台页面骨架：顶部导航 + 内容 + 移动端底部导航。
 * TVBox 风没有页脚，原 SiteFooter 已移除；版权与许可声明移到「设置 → 关于」与 /about。
 *
 * 挂载时顺带执行一次复习计划课程注入（幂等：标记 utopia:plan-2027:v1，
 * 已注入/用户已删除均不重复写入），保证任何入口进来课程库都是完整的。
 */
export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  useEffect(() => {
    ensurePlanCourses();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main
        className={cn(
          'flex-1 w-full mx-auto py-5 sm:py-6 pb-24 sm:pb-8',
          SHELL_WIDTH,
          SHELL_PADDING,
          className
        )}
      >
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
