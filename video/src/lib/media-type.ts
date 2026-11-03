/**
 * 播放地址的媒体类型推断。
 *
 * 为什么需要它（一次真实故障）：ArtPlayer 内部的类型分发是
 *   `type = option.type || getExt(url)`
 * 我们曾把 `type` 硬写成 `'m3u8'`，于是**所有**地址都被塞进 hls.js ——
 * mp4 直链（包括网盘的 `/api/netdisk/stream?fsid=…`）必然播不出来。
 *
 * 反过来也不能一律交给 `getExt`：采集站的 HLS 地址经常**没有 .m3u8 后缀**
 * （`/api/proxy?url=…m3u8`、或干脆是无扩展的接口地址），只靠扩展名会把它们
 * 交给原生 `<video>` —— Chrome 同样播不了 HLS。
 *
 * 因此这里按「先看确定信息，再按来源兜底」的顺序判断，并明确区分两类：
 * - `hls`  → 交给 hls.js（ArtPlayer 需要显式 `type: 'm3u8'`）
 * - `file` → 不传 type，让 ArtPlayer 走原生 video（mp4/mkv 等）
 */

export type MediaType = 'hls' | 'file';

/** 浏览器原生可播（或至少应交给原生处理）的容器 */
const FILE_EXT = /\.(mp4|m4v|webm|ogv|mov|mkv|avi|flv|wmv|mp3|m4a|aac)$/i;
const HLS_EXT = /\.m3u8?$/i;

/** 解码一次（代理地址的查询串里常嵌着真实地址） */
function safeDecode(url: string): string {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

function pathnameOf(url: string): string {
  const raw = url.split('?')[0].split('#')[0];
  // 绝对地址取 pathname；相对地址本身就是路径
  try {
    return new URL(raw).pathname;
  } catch {
    return raw;
  }
}

export function guessMediaType(url: string | undefined | null): MediaType {
  if (!url) return 'hls';
  const decoded = safeDecode(url);
  const path = pathnameOf(decoded);

  // 1) 路径后缀最可靠
  if (HLS_EXT.test(path)) return 'hls';
  if (FILE_EXT.test(path)) return 'file';

  // 2) 网盘流接口：默认按文件直传（mp4 为主）；带了 name 就按文件名判断
  if (/\/api\/netdisk\/stream\/?$/.test(path) || path.endsWith('/api/netdisk/stream')) {
    const name = /[?&]name=([^&]+)/.exec(decoded);
    if (name) {
      const fileName = name[1].split('?')[0];
      if (HLS_EXT.test(fileName)) return 'hls';
      if (FILE_EXT.test(fileName)) return 'file';
    }
    return 'file';
  }

  // 3) 解码后的整串里出现 m3u8（典型：/api/proxy?url=http%3A%2F%2F...%2Findex.m3u8）
  if (/\.m3u8?(\?|&|$)/i.test(decoded)) return 'hls';

  // 4) 兜底：采集站的 HLS 地址常常没有扩展名，沿用「按 HLS 处理」的既有行为
  return 'hls';
}