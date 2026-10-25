/**
 * B 站站外播放器嵌入地址解析。
 *
 * 课程章节允许直接粘贴 B 站「嵌入代码」，但真正写入数据、渲染 iframe 的
 * 只有经过白名单校验的 player.bilibili.com/player.html 地址，避免把任意
 * HTML/脚本塞进页面。
 */

const BILIBILI_PLAYER_HOST = 'player.bilibili.com';

/** 从整段 iframe 代码或地址中提取 B 站播放器地址；非法/非 B 站地址返回 null */
export function extractBilibiliEmbed(raw: string): string | null {
  if (!raw) return null;
  let value = String(raw).trim();
  if (!value) return null;

  const iframeSrc = value.match(/<iframe[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  if (iframeSrc) value = iframeSrc[1].trim();

  if (value.startsWith('//')) value = `https:${value}`;
  if (!/^https?:\/\//i.test(value)) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.hostname !== BILIBILI_PLAYER_HOST) return null;
    if (!url.pathname.startsWith('/player.html')) return null;
    // 统一升级为 https，避免 https 页面里嵌入 http 被拦截
    url.protocol = 'https:';
    return url.toString();
  } catch {
    return null;
  }
}

/** 是否为 B 站播放器嵌入地址 */
export function isBilibiliEmbed(url: string | undefined): boolean {
  return Boolean(url && extractBilibiliEmbed(url));
}
