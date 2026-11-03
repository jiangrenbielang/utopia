import { fetchBangumiCalendar } from '../../lib/bangumi';
import { jsonResponse } from '../adapt';

/** Bangumi 每日放送（免 key）：服务端直连 + 缓存，作为首页推荐的备用数据源（无入参） */
export async function bangumiHandler(): Promise<Response> {
  try {
    const days = await fetchBangumiCalendar();
    return jsonResponse({
      days: Object.entries(days).map(([weekday, items]) => ({ weekday: Number(weekday), items })),
    });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : '新番放送表获取失败' },
      { status: 502 }
    );
  }
}