/**
 * 上游请求超时（毫秒）：沿用既有 `REQUEST_TIMEOUT` 口径（与 /api/proxy 的代理请求同一把尺子）。
 * 环境变量写坏时（NaN / 非正数）回落到 8 秒，而不是把非法超时值传进 AbortSignal。
 *
 * 抽到独立模块只为多处共用（/api/tvbox、/api/category）：数值口径与原来完全一致。
 */
export function requestTimeoutMs(): number {
  const raw = Number.parseInt(process.env.REQUEST_TIMEOUT || '8000', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 8000;
}