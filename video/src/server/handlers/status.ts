import { jsonResponse } from '../adapt';

/** 站点状态：仅下发构建时注入的应用版本（无入参：状态与请求无关） */
export function statusHandler(): Response {
  return jsonResponse({
    // 构建时由 next.config.ts 从 package.json 注入；主进程数据层解析不到时回落到 dev
    version: process.env.APP_VERSION || 'dev',
  });
}