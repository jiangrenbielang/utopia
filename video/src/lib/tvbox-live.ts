import type { LiveChannel } from './types';
import { normalizeStreamUrl, parseM3u } from './m3u-parser';

/**
 * TVBOX 直播源播放列表解析。
 *
 * TVBOX 的 `lives[]` 只有 `type:0`（普通播放列表）一种可被纯 JS 客户端直接使用，
 * 而**播放列表的扩展名不可信**：实测 `jinenge/tvbox` 的 `./lib/interface.txt`
 * 内容其实是标准 M3U（首行 `#EXTM3U x-tvg-url="…"`）。因此这里**按内容嗅探**格式，
 * 而不是按 `.m3u` / `.txt` 扩展名判断——否则会把一个完全可用的直播源误判成不支持。
 *
 * 支持两种内容形态：
 * - **M3U**：交给既有的 `parseM3u`（属性、`#EXTGRP`、去重都在那边处理）；
 * - **TVBox txt 频道列表**：`分组名,#genre#` 单独成行表示后续频道归属该分组，
 *   频道行为 `频道名,流地址`；`#` 开头是注释。
 */

/** 播放列表内容形态 */
export type PlaylistFormat = 'm3u' | 'txt';

/** 由任意字符串生成稳定的短 id（djb2 变体，与 m3u-parser / store.ts 同一风格） */
function stableId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * 按内容嗅探格式：首行有效内容以 `#EXTM3U` 开头（大小写不敏感、允许 BOM 与空行）即 M3U，
 * 否则按 TVBox txt 频道列表处理。空内容一律按 txt 处理（解析结果同样为空）。
 */
export function detectPlaylistFormat(content: string): PlaylistFormat {
  const head = content.replace(/^\uFEFF/, '');
  for (const line of head.split(/\r?\n/, 40)) {
    const text = line.trim();
    if (!text) continue;
    return text.toUpperCase().startsWith('#EXTM3U') ? 'm3u' : 'txt';
  }
  return 'txt';
}

/** TVBox txt 的分组标记 */
const GENRE_MARKER = '#genre#';

/**
 * 解析 TVBox txt 频道列表。
 *
 * 容错点（社区 txt 列表写法不一）：
 * - 分组行既可能写 `央视,#genre#`，也可能写 `央视, #genre#`（逗号后带空格）；
 * - 频道行取**最后一个**逗号切分，避免频道名里带逗号时把名字截断；
 * - 一个频道可以挂多条地址（TVBOX 用 `#` 分隔做容灾），这里取第一条可播放地址，
 *   其余丢弃——本站播放器没有多地址自动切换能力，保留无效备选只会让列表变长；
 * - 地址只放行 http(s)，`rtp://` / `udp://` 等浏览器播不了的协议直接丢弃。
 */
export function parseTvboxTxt(content: string, baseUrl?: string): LiveChannel[] {
  const channels: LiveChannel[] = [];
  if (!content) return channels;

  const seen = new Set<string>();
  let group: string | undefined;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // 分组标记：`分组名,#genre#`
    if (line.includes(GENRE_MARKER)) {
      const name = line.slice(0, line.indexOf(GENRE_MARKER)).replace(/[,\s]+$/, '').trim();
      if (name) group = name;
      continue;
    }

    // 其余 `#` 开头为注释（`#EXTINF` 等 m3u 指令在 sniff 后不会走到这里）
    if (line.startsWith('#')) continue;

    const commaIdx = line.lastIndexOf(',');
    if (commaIdx <= 0) continue;
    const name = line.slice(0, commaIdx).trim();
    const rawUrl = line.slice(commaIdx + 1).trim();
    // 多地址容灾：取第一条可用地址
    const url = rawUrl
      .split('#')
      .map((item) => normalizeStreamUrl(item, baseUrl))
      .find((item): item is string => !!item);
    if (!url || !name || seen.has(url)) continue;
    seen.add(url);

    channels.push({
      id: stableId(url),
      name,
      url,
      group,
      rawName: name,
    });
  }

  return channels;
}

/** 统一入口：按内容嗅探后交给对应解析器 */
export function parseTvboxPlaylist(content: string, baseUrl?: string): LiveChannel[] {
  return detectPlaylistFormat(content) === 'm3u' ? parseM3u(content, baseUrl) : parseTvboxTxt(content, baseUrl);
}