import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Utopia - 考研网课学习平台',
    short_name: 'Utopia',
    description: '按科目学习网课，自动记录学习时长，倒计时与统计一应俱全。',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b101a',
    theme_color: '#0b101a',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
