import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LocalPlayer } from '@/components/study/local-player';

export const metadata: Metadata = {
  title: '本地高清播放 · Utopia',
  description: 'B 站 API + mpv 本地高清播放，并通过 mpv IPC 同步学习时长。',
};

export default function LocalPlayerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-faint">
          正在加载本地播放器…
        </div>
      }
    >
      <LocalPlayer />
    </Suspense>
  );
}
