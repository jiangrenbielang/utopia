import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import TvboxWallpaper from '@/components/tvbox-wallpaper';

export const metadata: Metadata = {
  title: {
    default: 'Utopia - 考研网课学习平台',
    template: '%s - Utopia',
  },
  description:
    'Utopia：面向考研备考的网课学习平台，按科目组织课程、观看网课自动记录学习时长，提供倒计时、统计图表与历史日志，数据保存在本地设备。',
  manifest: '/manifest.webmanifest',
  // 图标与门户站（LibreTV-portal）同一套：同一张 artwork 导出的多尺寸 + 根目录 favicon.ico 兜底。
  // 只声明单张 512 时，抓取端只能拿大图缩放，小尺寸下易糊、看起来「没填满」。
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icons/icon-96.png', sizes: '96x96', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  // 双主题 themeColor：深色 TVBox 中性黑 #0f0f11 / 浅色页面底 #f5f5f7，
  // 与 globals.css 的 --c-page 保持一致（浏览器地址栏 / PWA 顶栏取色用）
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0f0f11' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 首屏前同步主题，避免亮暗闪烁；桌面端顺带同步 Electron 原生主题（标题栏颜色）
            并读取 WCO 覆盖层几何（--ut-titlebar-w/h）与玻璃能力标记：
            - .os-desktop：preload 桥存在（桌面客户端）
            - .glass-titlebar：WCO + Win11 亚克力材质可用，顶栏切换为玻璃样式
            两个类都在 <html> 上，globals.css 按类启用桌面专属规则；浏览器端全不生效 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var h=document.documentElement;var r=h.style;var b=window.utopiaDesktop;if(b&&b.titleBarInfo){h.classList.add('os-desktop');var t=b.titleBarInfo();if(t&&t.width){r.setProperty('--ut-titlebar-w',t.width+'px');r.setProperty('--ut-titlebar-h',t.height+'px');if(t.glass)h.classList.add('glass-titlebar')}}var c=localStorage.getItem('libretv-theme')||'dark';var d=c==='dark'||(c==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);h.classList.toggle('dark',d);if(b&&b.setNativeTheme)b.setNativeTheme(d);}catch(e){}})()",
          }}
        />
      </head>
      <body>
        {/* 壁纸层放在 Providers 内：它要读挂载后才 rehydrate 的 store */}
        <Providers>
          <TvboxWallpaper />
          {children}
        </Providers>
      </body>
    </html>
  );
}
