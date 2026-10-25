# Utopia Desktop（Electron 客户端）

把现有 Utopia Web、B 站本地高清伴生程序和 mpv 合成一个 Windows 桌面客户端。

> 伴生程序源码只保留在本地 `companion/`，不随仓库分发；本目录的构建需要本地 companion 与 mpv。

## 运行结构

```text
Electron 主窗口
  ├─ Next.js standalone Web 服务  http://127.0.0.1:3210
  ├─ companion HTTP 服务          http://127.0.0.1:8765
  └─ mpv.exe                     统一播放 B 站 / 直链视频
```

- Web、companion、mpv 全部由 Electron 主进程启动/停止
- Web 密码自动登录，无需在页面再输入
- companion 的配对令牌由 Electron 生成，通过 preload 自动填入「本地高清」页
- SESSDATA 和 Web 密码使用 Electron `safeStorage`（Windows 凭据加密）保存
- 课程页可选择「课程 → 章节」，自动填入 B 站 bvid / P 数或直链，再用 mpv 播放

## 开发环境

需要：

- Node.js 20+
- Python 3.10+（仅本地 companion 源码）
- mpv
- 本地 `companion/` 目录

```powershell
cd desktop
npm install

# 1. 构建 Web standalone
npm run build:web

# 2. 复制 mpv 到 resources/mpv
npm run copy:mpv

# 3. 打包本地 companion 为 exe（可选：开发模式会直接运行 py）
npm run build:companion

# 4. 启动 Electron
npm start
```

开发模式下，Electron 直接运行 `companion/run.py`，不要求先打包 exe；生产/安装包模式使用 `resources/companion/utopia-companion.exe`。

## 构建安装包

```powershell
cd desktop
npm install
npm run build:web
npm run copy:mpv
npm run build:companion

# NSIS 安装包，输出到 desktop/release
npm run dist
```

如果暂时不打 NSIS，可生成免安装目录：

```powershell
npm run pack
```

## 配置

首次启动会打开设置窗口：

- **B 站 SESSDATA**：粘贴自己的登录态，保存后重启；已配置时留空保持不变
- **Web 访问密码**：修改后重启本地 Web 服务

保存在：

```text
%APPDATA%\Utopia\config.json
%APPDATA%\Utopia\companion-data\
```

SESSDATA 已用 Windows DPAPI 加密；不要把 `config.json` 或 `companion-data` 发给别人。

## 本地高清

1. 打开课程库 → 本地高清
2. 选择课程 → 章节，自动填入视频来源
3. 点击「开始本地播放」，mpv 窗口打开
4. 关闭 mpv 后，学习记录自动同步到 Utopia

支持：

- B 站 BV/链接 → B 站 API 解析 DASH → mpv
- m3u8 / mp4 直链 → mpv
- 课程章节的 `courseId` / `lessonId` 会写入学习记录

## 限制

- 安装包仅 Windows x64
- mpv 是独立播放窗口，不能嵌入 Electron 页面（Windows 原生窗口限制）
- B 站接口为非公开接口，可能失效；SESSDATA 需要自己维护
- 伴生程序不随 GitHub 仓库分发；本机构建前请确认 `companion/` 存在
