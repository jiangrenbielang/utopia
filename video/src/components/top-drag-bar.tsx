/**
 * WCO 顶部拖拽带：给不渲染应用顶栏（Header）的页面（播放页错误态、
 * 路由错误边界等）补一条可拖动窗口的区域——顶栏即标题栏的方案下，
 * 没有它这些页面就无法拖动/移动窗口。
 *
 * 桌面端：fixed 顶部 56px（与 Header 同高）全宽 drag 区；
 * 浏览器端：app-region 无效，透明带无任何副作用（也不拦截点击之外的交互）。
 * 注意 z-index 取 60：高于普通内容，但低于 Header(40)？不——Header 是 z-40
 * 且本组件只出现在无 Header 的页面，取 z-[60] 确保覆盖错误页内容；
 * 页面若有可交互元素在顶部 56px 内会被遮挡，错误页内容均居中，无此情况。
 */
export function TopDragBar() {
  return (
    <div aria-hidden className="fixed top-0 inset-x-0 h-14 z-[60] app-region-drag" />
  );
}
