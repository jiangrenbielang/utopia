import { db, type WallpaperAsset } from './db';

/**
 * 本地壁纸的存取（IndexedDB）。
 *
 * 存 Blob 而不是 data URL：
 * - data URL 会让体积膨胀约 1/3，且要在 JavaScript 堆里常驻一份字符串；
 * - localStorage 总配额只有约 5MB，一张手机壁纸就可能撑爆并连带影响设置持久化。
 * 因此原始字节进 IndexedDB，渲染时用 `URL.createObjectURL` 生成临时地址。
 */

/** 壁纸填充方式（与 store 的 `wallpaperFit` 对齐） */
export type WallpaperFit = 'cover' | 'contain';

/**
 * 生成背景层的内联样式（纯函数，便于单测）。
 *
 * 用 `background-image` 而不是 `<img>`：
 * - `<img>` 受 Tailwind preflight（`max-width:100%`、`height:auto`）与固有尺寸影响，
 *   透明边/异常比例时容易看起来「没铺满」；
 * - 背景图配 `background-size` 语义更直接（cover=铺满裁切，contain=完整显示）。
 *
 * URL 里的双引号要转义，否则 `url("…")` 会被截断（object URL 安全，远端地址不一定）。
 */
export function wallpaperBackgroundStyle(
  url: string,
  fit: WallpaperFit = 'cover'
): Record<string, string> {
  const safe = String(url || '').replace(/"/g, '%22');
  return {
    backgroundImage: `url("${safe}")`,
    backgroundSize: fit === 'contain' ? 'contain' : 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}

/** 单张上限：12MB。超过时让用户先压缩，而不是悄悄失败或撑爆磁盘配额 */
export const MAX_WALLPAPER_BYTES = 12 * 1024 * 1024;

/** 文件选择框的 accept：与 <img> 能解码的格式对齐 */
export const WALLPAPER_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif';

/** 压暗程度：0 = 原图，95 = 几乎只剩底色（保证还能看出是壁纸） */
export function clampWallpaperDim(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 78;
  return Math.min(95, Math.max(0, Math.round(num)));
}

/**
 * 校验待导入文件（纯函数，便于单测）。
 * 返回可读的错误文案；合法时返回 null。
 */
export function validateWallpaperFile(file: {
  type?: string;
  size?: number;
  name?: string;
}): string | null {
  const type = String(file.type || '').toLowerCase();
  if (!type.startsWith('image/')) {
    return `「${file.name || '所选文件'}」不是图片（当前类型 ${type || '未知'}）`;
  }
  const size = Number(file.size || 0);
  if (!Number.isFinite(size) || size <= 0) return '图片内容为空，读取失败';
  if (size > MAX_WALLPAPER_BYTES) {
    return `图片太大（${(size / 1024 / 1024).toFixed(1)} MB），上限 ${MAX_WALLPAPER_BYTES / 1024 / 1024} MB，请先压缩`;
  }
  return null;
}

function newId(): string {
  const cryptoRef = globalThis.crypto as Crypto | undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') return cryptoRef.randomUUID();
  return `wp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 导入一张本地图片 */
export async function addWallpaper(file: File): Promise<WallpaperAsset> {
  const problem = validateWallpaperFile(file);
  if (problem) throw new Error(problem);
  const asset: WallpaperAsset = {
    id: newId(),
    name: file.name || '本地图片',
    type: file.type,
    size: file.size,
    // File 本身就是 Blob，直接存引用即可（Dexie 会按结构化克隆写入）
    blob: file,
    createdAt: Date.now(),
  };
  await db.wallpapers.put(asset);
  return asset;
}

/** 全部本地壁纸，最新导入的排在前面 */
export async function listWallpapers(): Promise<WallpaperAsset[]> {
  const rows = await db.wallpapers.toArray();
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getWallpaper(id: string): Promise<WallpaperAsset | undefined> {
  return db.wallpapers.get(id);
}

export async function removeWallpaper(id: string): Promise<void> {
  await db.wallpapers.delete(id);
}

/**
 * 取壁纸的临时地址（object URL）。
 * 调用方必须在使用结束后 `URL.revokeObjectURL(url)`，否则图片会一直占内存。
 */
export async function createWallpaperUrl(id: string): Promise<string | null> {
  const asset = await db.wallpapers.get(id);
  if (!asset?.blob) return null;
  try {
    return URL.createObjectURL(asset.blob);
  } catch {
    return null;
  }
}