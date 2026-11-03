import { fetchDoubanRecommend } from '../../lib/douban';
import { jsonResponse } from '../adapt';
import type { ServerRequest } from '../types';

/** 豆瓣推荐：服务端直连 + 缓存，替代旧版浏览器经公共 CORS 代理的方案 */
export async function doubanHandler(req: ServerRequest): Promise<Response> {
  const url = new URL(req.url);
  const type = url.searchParams.get('type') === 'tv' ? 'tv' : 'movie';
  const tag = (url.searchParams.get('tag') || '热门').slice(0, 20);
  const pageStart = Math.max(0, parseInt(url.searchParams.get('pageStart') || '0', 10) || 0);
  const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '25', 10) || 25));

  try {
    const items = await fetchDoubanRecommend(type, tag, pageStart, pageSize);
    return jsonResponse({ items });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : '豆瓣推荐获取失败' },
      { status: 502 }
    );
  }
}