'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import {
  clampWallpaperDim,
  createWallpaperUrl,
  wallpaperBackgroundStyle,
} from '@/lib/wallpapers';
import type { TvboxConfigExtras } from '@/lib/tvbox-config';

/**
 * 当前生效的 TVBox 配置附加信息（壁纸、解析线路、站点元信息…）。
 *
 * 优先取 `tvboxActiveUrl` 指向的配置；用户只导入过一份时它可能为空，
 * 此时退回第一条——与 `TvboxConfigPanel` 的「生效配置」判定保持一致。
 */
export function useTvboxExtras(): TvboxConfigExtras | undefined {
  const tvboxByUrl = useAppStore((s) => s.tvboxByUrl);
  const tvboxActiveUrl = useAppStore((s) => s.tvboxActiveUrl);
  if (tvboxActiveUrl && tvboxByUrl[tvboxActiveUrl]) return tvboxByUrl[tvboxActiveUrl];
  return Object.values(tvboxByUrl ?? {})[0];
}

/**
 * 页面背景壁纸层。三种来源由设置（`wallpaperMode`）切换：
 *
 * - `off`   ：不渲染（只有页面底色）
 * - `tvbox` ：TVBox 配置里的 `wallpaper`
 * - `local` ：用户导入的本地图片（IndexedDB → object URL）
 *
 * 渲染用 `background-image` 而不是 `<img>`：`<img>` 受 preflight 与固有尺寸影响，
 * 透明边/异常比例时容易看起来「没铺满」；背景图配 `background-size` 语义更直接。
 *
 * 图层是 `fixed inset-0 -z-10`：位于 html 底色之上、正文之下
 * （注意 globals.css 里 **body 必须透明**，否则普通流背景会盖住负 z 图层）。
 *
 * 压暗用一层与页面底色同色的遮罩（`opacity = wallpaperDim / 100`）：
 * 深色主题下是黑纱、浅色下是白纱，由主题令牌自动决定。
 */
export default function TvboxWallpaper() {
  const mode = useAppStore((s) => s.wallpaperMode);
  const dim = useAppStore((s) => s.wallpaperDim);
  const fit = useAppStore((s) => s.wallpaperFit);
  const localId = useAppStore((s) => s.wallpaperLocalId);
  const extras = useTvboxExtras();

  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const tvboxUrl = extras?.wallpaper;

  // 本地图片：读取 Blob 生成 object URL，切换/卸载时立刻回收
  useEffect(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setLocalUrl(null);
    if (mode !== 'local' || !localId) return;

    let cancelled = false;
    void createWallpaperUrl(localId)
      .then((url) => {
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        objectUrlRef.current = url;
        setLocalUrl(url);
      })
      .catch(() => setLocalUrl(null));

    return () => {
      cancelled = true;
    };
  }, [mode, localId]);

  // 卸载时兜底回收
  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    []
  );

  const url = mode === 'tvbox' ? tvboxUrl : mode === 'local' ? localUrl : undefined;

  /**
   * 把「当前是否有壁纸」同步到 <html>，供 globals.css 的玻璃化规则使用
   * （`html.has-wallpaper .card { 半透明 + backdrop-blur }`）。
   * 关掉壁纸时类会被移除，界面回到原来的实色外观。
   */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('has-wallpaper', Boolean(url));
    return () => root.classList.remove('has-wallpaper');
  }, [url]);

  if (!url) return null;

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
        style={wallpaperBackgroundStyle(url, fit)}
      />
      {/* 与页面底色同色的遮罩：只调透明度，不关心主题令牌的格式 */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-page"
        style={{ opacity: clampWallpaperDim(dim) / 100 }}
      />
    </>
  );
}