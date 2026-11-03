import { fetchHotList, isHotListId } from '../../lib/douban-weekly';
import { jsonResponse } from '../adapt';
import type { ServerRequest } from '../types';

/** 影视热榜（经 60s API 免 key）：豆瓣五个周榜 + 百度热播剧，服务端转发 + 缓存 */
export async function hotListHandler(req: ServerRequest): Promise<Response> {
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!isHotListId(id)) {
    return jsonResponse({ error: `未知榜单: ${id.slice(0, 30)}` }, { status: 400 });
  }

  try {
    const items = await fetchHotList(id);
    return jsonResponse({ items });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : '榜单获取失败' },
      { status: 502 }
    );
  }
}