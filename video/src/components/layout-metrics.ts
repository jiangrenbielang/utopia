/**
 * 全站统一布局口径（TVBox 风：电视/大屏优先，海报网格横向铺开）。
 *
 * 单独成模块而不是放在 page-shell 里，是为了避免 page-shell ↔ header 之间的循环 import：
 * 顶栏、内容区、播放页、直播页都必须用同一组宽度/边距。
 */
export const SHELL_WIDTH = 'max-w-[1400px]';
export const SHELL_PADDING = 'px-4 sm:px-6 lg:px-8';