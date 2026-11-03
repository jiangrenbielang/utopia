'use client';

import { useEffect, useState } from 'react';
import { Icon } from './icon';

/**
 * 桌面客户端设置入口。
 *
 * 应用菜单栏已删除（顶部那条「文件 / 编辑 / 视图 / 帮助」），设置窗不能只靠菜单进——
 * 这里给网页一个按钮。浏览器环境下 `window.utopiaDesktop` 不存在，整块不渲染，
 * 且要等挂载后再判断，避免静态导出时 SSR 与客户端结果不一致。
 */
export default function DesktopSettingsLink() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setIsDesktop(Boolean(window.utopiaDesktop?.isDesktop));
  }, []);

  if (!isDesktop) return null;

  return (
    <section className="card p-5 lg:col-span-2">
      <h2 className="text-sm font-medium text-content flex items-center gap-2">
        <Icon name="gear" className="w-4 h-4 text-accent" />
        桌面客户端设置
      </h2>
      <p className="text-xs text-muted mt-2 leading-relaxed">
        应用菜单栏已移除。桌面端的「允许播放本机 / 局域网地址」等开关在这个独立设置窗里，
        也可以随时按 <code className="text-content">Ctrl + ,</code> 打开。
      </p>
      <button className="btn-ghost btn-sm mt-4" onClick={() => window.utopiaDesktop?.openSettings?.()}>
        <Icon name="gear" className="w-3.5 h-3.5" />
        打开桌面设置窗
      </button>
    </section>
  );
}