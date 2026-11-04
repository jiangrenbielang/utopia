'use client';

import { useEffect, useState } from 'react';
import { detectPlatform } from '@/lib/platform';

/**
 * WCO 顶部拖拽带：给不渲染应用顶栏（Header）的页面（播放页错误态、
 * 路由错误边界等）补一条可拖动窗口的区域——顶栏即标题栏的方案下，
 * 没有它这些页面就无法拖动/移动窗口。
 *
 * 仅桌面端渲染：app-region 在浏览器/移动端是无效 CSS，跳过渲染也省掉
 * 一层 fixed 覆盖。挂载后检测（首帧不渲染，无 hydration 错位——SSR 与
 * 客户端首帧都返回 null，桌面端在 effect 后出现，拖拽带本身无视觉）。
 */
export function TopDragBar() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    setIsDesktop(detectPlatform() === 'desktop');
  }, []);
  if (!isDesktop) return null;
  return <div aria-hidden className="fixed top-0 inset-x-0 h-14 z-[60] app-region-drag" />;
}
