/**
 * 课程章节视频来源解析：支持 m3u8 / mp4 直链，或 B 站站外播放器 iframe。
 * 只放行 player.bilibili.com/player.html，避免把任意 HTML/脚本写进数据。
 */
const BILIBILI_PLAYER_HOST = 'player.bilibili.com';

export function extractBilibiliEmbed(raw) {
  if (!raw) return null;
  let value = String(raw).trim();
  if (!value) return null;

  const iframeSrc = value.match(/<iframe[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  if (iframeSrc) value = iframeSrc[1].trim();

  if (value.startsWith('//')) value = `https:${value}`;
  if (!/^https?:\/\//i.test(value)) return null;

  try {
    const url = new URL(value);
    if (url.hostname !== BILIBILI_PLAYER_HOST) return null;
    if (!url.pathname.startsWith('/player.html')) return null;
    url.protocol = 'https:';
    return url.toString();
  } catch (e) {
    return null;
  }
}

export function isBilibiliEmbed(url) {
  return Boolean(url && extractBilibiliEmbed(url));
}
