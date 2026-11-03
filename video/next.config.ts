import type { NextConfig } from 'next';
import fs from 'node:fs';
import path from 'node:path';

/** 版本号以 package.json 为单一来源，构建时注入 process.env.APP_VERSION（/api/status 使用） */
function readAppVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const nextConfig: NextConfig = {
  // 三种构建形态：
  // - 默认：本地 `next start` / `next dev`（不产出 standalone，standalone 下本地 start 不受支持）
  // - DOCKER_BUILD=1：Docker 镜像用的 standalone 输出
  // - STATIC_EXPORT=1：桌面客户端用的纯静态导出（页面 + 资源，不含任何 route handler）。
  //   注意：静态导出要求 `src/app/api` 在构建时不在源码树里，由 desktop 的构建脚本临时移出。
  output:
    process.env.STATIC_EXPORT === '1'
      ? 'export'
      : process.env.DOCKER_BUILD === '1'
        ? 'standalone'
        : undefined,
  reactStrictMode: true,
  env: { APP_VERSION: readAppVersion() },
  // 采集站/豆瓣等上游地址在运行时由用户配置，构建期无法枚举，关闭图片优化改用 <img>
  images: { unoptimized: true },
};

export default nextConfig;
