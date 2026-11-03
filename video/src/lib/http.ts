/**
 * API Route 统一的 JSON 错误响应。
 *
 * 刻意使用 **Web 标准 `Response`** 而不是 `NextResponse`：本项目的服务端逻辑
 * （代理、搜索、详情、直播…）要同时跑在两种宿主上——Next.js 的 Route Handler，
 * 与 Electron 桌面客户端主进程内建的本地数据层。`Response` 是两者都认的通用货币，
 * 用它就不必为「脱离 Next」再写一层响应适配；Next 的 Route Handler 直接接受
 * 标准 `Response` 作为返回值。
 */
export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}
