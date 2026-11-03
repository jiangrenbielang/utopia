'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { ErrorState } from '@/components/states';
import { TopDragBar } from '@/components/top-drag-bar';

/**
 * 路由段级错误边界：捕获页面渲染/数据异常，避免落到 Next 默认英文白屏。
 * 刻意不放 Header——它依赖 zustand store，若异常源正是 store 会二次崩溃。
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Utopia] 页面渲染异常:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col">
      <TopDragBar />
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-xl">
          <ErrorState
            message="页面出了点问题，请重试。若持续失败请返回首页。"
            onRetry={reset}
            retryLabel="重试"
          />
          {/* 把真正的异常露出来：错误边界只给人看一句通用文案，排查时全靠这段 */}
          <details className="mt-4 text-xs text-faint">
            <summary className="cursor-pointer hover:text-content">技术细节</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all rounded-md border border-line bg-surface p-3 text-[11px] text-muted">
              {error?.message || '(无 message)'}
              {error?.digest ? `\n\ndigest: ${error.digest}` : ''}
            </pre>
          </details>
        </div>
      </main>
      <footer className="border-t border-line py-4">
        <p className="text-center text-xs text-faint">
          问题持续存在？{' '}
          <Link href="/" className="hover:text-accent">
            返回首页
          </Link>
        </p>
      </footer>
    </div>
  );
}
