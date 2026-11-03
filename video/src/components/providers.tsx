'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { ToastProvider } from './toast';
import { ThemeProvider } from './theme';
import { GlobalDownloadManager } from './download-manager';
import { TimerBar } from './study/timer-bar';
import { useAppStore } from '@/lib/store';
import { autoRefreshSubscriptions } from '@/lib/subscription-sync';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 },
        },
      })
  );

  // store 配置了 skipHydration：等挂载后再读 localStorage，
  // 保证 hydration 阶段客户端与服务端渲染结果一致。
  useEffect(() => {
    // 先等持久化状态恢复，再做依赖 store 的启动动作，
    // 避免在订阅状态就绪前就向上游发请求
    Promise.resolve(useAppStore.persist.rehydrate())
      .then(() => {
        // 用户订阅的自动刷新：打开站点执行一次（只处理显式设了 refreshDays 的订阅），
        // 离线 / 后台标签页会自动跳过（见 lib/subscription-sync.ts）
        return autoRefreshSubscriptions();
      })
      .catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          {/* 全站常驻：下载事件监听（enqueueDownload）依赖它存在——
              挂在 Header 里会让 /watch 等不渲染 Header 的页面派发的事件凭空丢失 */}
          <GlobalDownloadManager />
          {children}
          {/* 全局计时迷你条：跨页保持，计时页自身不显示 */}
          <TimerBar />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}