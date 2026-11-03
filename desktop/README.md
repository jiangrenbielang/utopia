# Utopia Desktop（Electron 客户端）

把 Utopia 的客户端界面与内建数据层合成一个 Windows 桌面客户端。**播放全部在应用内的播放器完成**（ArtPlayer + hls.js），不再包含伴生程序或外部 mpv 进程。

## 运行结构

```text
Electron 主进程
  └─ 本地数据层（一个 http 服务，监听 127.0.0.1:3210）
       ├─ 静态页面：video/out 的静态导出产物
       └─ /api/*    ：video/src/server 编译出的服务核（代理、聚合搜索、直播、画质探测…）
```

- **不再有 Next.js standalone 服务**：页面是静态导出的产物，数据接口由主进程内建的服务核承载。
- **端口与 origin 仍是 `http://127.0.0.1:3210`**：localStorage / IndexedDB 按 origin 隔离，换成别的端口会让课程库、学习记录与设置全部读不到。
- Web 端配置已删除：不再有访问密码、`.env` 注入或自动登录 cookie。
- **没有伴生程序、没有 mpv**：直链 / HLS / B 站站外播放器都在应用内播放，学习计时按页面实际播放进度统计。
- 媒体代理、内网上游放行、请求头伪装等全部由服务核处理，客户端不需要额外进程。

## 开发环境

需要：Node.js 20+（**不再需要 Python、mpv 或 companion 目录**）

```powershell
cd desktop
npm install

# 构建静态页面 + 编译服务核（产出 video/out 与 resources/api）
npm run build:web

# 启动 Electron
npm start
```

`npm run build:web` 依次做两件事：

1. `STATIC_EXPORT=1 next build` 产出静态页面。`output:'export'` 与 Route Handler 互斥，
   所以构建期间会把 `video/src/app/api` 临时移出源码树，**构建后自动还原**
   （正常结束、异常退出、Ctrl+C 都会还原；上次若被强杀，下次构建开头会先自愈）。
2. `tsc -p tsconfig.server.json` 把 `video/src/server` 编译到 `resources/api`
   （纯 tsc，不引入打包器），并写入 `app-version.json` 供 `/api/status` 显示版本。

**同一份服务端逻辑跑在两个宿主上**：Web 部署时是 Next 的 Route Handler
（`video/src/app/api/**` 只是薄壳），桌面客户端时是主进程内建的 Node `http.Server`
（`web-server.js`）。因此改完 `video/src` 里的服务端逻辑后，**必须重跑 `npm run build:web`**
才会反映到桌面客户端。

## 构建安装包

```powershell
cd desktop
npm install

# NSIS 安装包，输出到 desktop/release（内含 build:web）
npm run dist
```

如果暂时不打 NSIS，可生成免安装目录：

```powershell
npm run pack
```

## 配置

设置窗口只有一个选项：

- **允许播放本机 / 局域网地址**（默认开启）：自建 AList / OpenList 的网盘直链通常就在本机或局域网，
  这个本地服务只监听 `127.0.0.1`，所以默认放行；关掉后内网直链（含 HLS 分片）会被 SSRF 校验拒绝。
  对应的服务端环境变量是 `ALLOW_PRIVATE_UPSTREAM`（Web / Docker 部署默认关闭，需显式设为 `1`）

保存在：

```text
%APPDATA%\Utopia\config.json
```

## 播放能力与限制

- 安装包仅 Windows x64
- 内置播放器使用浏览器解码能力：**支持 mp4 / HLS(m3u8)**；`mkv`、`hevc`、`avi` 等浏览器无法解码的格式需要先转码
- B 站视频以站外 iframe 播放，无法读取播放状态，因此按「页面可见停留时长」计时
- `resources/api/` 是服务核的编译产物（已 gitignore），改完 `video/src` 后需重跑 `npm run build:web`