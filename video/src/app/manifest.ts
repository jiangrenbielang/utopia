import type { MetadataRoute } from 'next';

/**
 * PWA manifest。
 *
 * `dynamic = 'force-static'` 是**静态导出（桌面客户端）所必需**的：manifest 也是一条
 * 服务端路由，`output: 'export'` 下不显式声明静态就会在收集页面数据阶段直接构建失败。
 * 它本身只依赖常量，标记为静态对普通构建没有任何影响。
 */
export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Utopia - 考研网课学习平台',
    short_name: 'Utopia',
    description: '按科目学习网课，自动记录学习时长，倒计时与统计一应俱全。',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f0f11',
    theme_color: '#0f0f11',
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
      // maskable：Android 自适应图标（安全区裁切）不裁坏内容
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
