# Utopia

> 考研备考网课平台：**Web 学习台 + Windows 桌面客户端**。纯本地数据、无账号、无广告。

## 项目介绍

2026年10月25日我在B站看网课时苦于每次都要自己手动调进度，便想着能不能自己做一个播放器具有记忆功能，于是乌托邦个人考研网课平台诞生了。

本平台的播放内核与聚合能力来自 [LibreTV](https://github.com/LibreSpark/LibreTV)，学习计时与统计部分与「研时记」一脉相承；客户端的数据源改为 **TVBox「配置地址」驱动**——填一份接口 JSON 即可带出点播站点、直播源、解析线路与壁纸，并内置**百度网盘直连播放**（授权、目录浏览、目录一键生成课程）。本项目禁止商用，视频源需要自己获取，祝愿每个使用该项目的考研人能够成功上岸。

如果你没有能力支持正版，希望你在获取盗版资源的时候不要跳脸那些支持正版的同学，如果你有能力支持正版但觉得本项目更便利，请在支持正版后采用本项目。

再次感谢每一个开源者对社区的贡献，如果觉得本项目还有可优化的地方，请向我的个人邮件qz3589@qq.com发送邮件。

愿世界更加美好，这里是乌托邦，感谢您的支持与理解。

## 项目结构

| 目录 | 说明 | 技术 |
|---|---|---|
| [video](video/) | 网课平台客户端：课程库、播放即计时、倒计时、统计、日志、资源库、网盘播放；数据源由 TVBox 配置地址驱动，界面为 TVBox 风格 | Next.js 15 + TypeScript + Tailwind |
| [desktop](desktop/) | Windows Electron 客户端：主进程内建本地数据层（静态页面 + 服务核 API），内置播放器，无需任何外部进程 | Electron + Node |
| [docs](docs/) | 开发文档与产品规格 | Markdown |

> 旧架构（Capacitor 移动端 `app/` 与分发服务 `backend/`）已于 v0.1.0 移除，安装包统一走 [Releases](https://github.com/jiangrenbielang/utopia/releases) 分发。

## 快速开始（Windows）

双击根目录 **`启动.bat`**，按菜单选择：

1. **Web 平台**：Next.js 网课平台，<http://localhost:8080>（首次使用请在「设置 → TVBox 配置地址」填入你的接口地址）。
2. **Web 开发模式**：保存代码即热更新。
3. **打开文档目录**。

也可以直接进入子目录分别启动：

```bash
# Web 平台
cd video && npm install && npm run dev

# 桌面客户端（开发模式）
cd desktop && npm install && npm run build:web && npm start
```

## 功能

### Web 网课平台

课程库按考研科目组织，章节支持 m3u8 / mp4 直链或 B 站站外播放器 iframe；**播放即计时**，离开页面自动保存；按学习进度自动续播；另有自由计时、日/周/月统计、学习日志、考试倒计时、资源库聚合搜索与课程进度。数据源统一由 **TVBox 配置地址**提供（一份接口 JSON 带出点播站点与直播源；依赖 Spider 引擎的站点会被跳过并说明原因）。

### 百度网盘直连播放（v0.1.0 新增）

平台内置 OAuth 授权与目录浏览，**「把当前目录生成课程」一键把网盘文件夹变成课程章节**；服务端代理自动携带百度要求的 UA 与 Range，支持拖动进度条；令牌只存本机，不随仓库分发。

### Windows 桌面客户端

`desktop/` 是 Electron 客户端：主进程内建**本地数据层**（静态导出的页面 + 编译好的服务核，监听 `127.0.0.1:3210`），播放全部在内置播放器完成（无伴生程序、无 mpv、无应用菜单栏；`Ctrl+,` 打开设置、`F11` 全屏）。安装包构建见 [desktop/README.md](desktop/README.md)，或直接下载 [Releases](https://github.com/jiangrenbielang/utopia/releases)。

### 壁纸系统（v0.1.0 新增）

跟随 TVBox 配置壁纸或导入本地图片（IndexedDB 存储）；壁纸模式下界面切换为深色玻璃 HUD 调色板，压暗程度与填充方式可调。

## 数据与兼容

- Web 端本地存储键迁移到 `utopia:*` 并自动读取旧的 `yst:*` 数据。
- 导出的备份 `app` 字段为 `Utopia`，导入同时兼容旧版「研时记」备份。
- 数据全部保存在浏览器本地，不上传服务器。

## 文档

- [Utopia 开发文档](docs/Utopia-开发文档.md)（含数据模型、统计口径、边界用例）
- [Web 端说明](video/README.md)
- [桌面端说明](desktop/README.md)

## 构建

```bash
# Web 生产构建
cd video && npm run build

# Windows 安装包（NSIS，输出 desktop/release）
cd desktop && npm install && npm run dist
```

## 贡献者

- **Utopia 作者**：[jiangrenbielang](https://github.com/jiangrenbielang)
- **LibreTV 创作者**：[bestZwei](https://github.com/bestZwei)
- **LibreTV 维护组织**：[LibreSpark](https://github.com/LibreSpark)

感谢 [LibreTV](https://github.com/LibreSpark/LibreTV) 及其全体贡献者为 Web 端播放与聚合能力打下的基础。完整名单见 [CONTRIBUTORS.md](CONTRIBUTORS.md)。

## License

沿用根目录 [LICENSE](LICENSE)；`video/` 为 LibreTV 衍生项目，遵循 AGPL-3.0-or-later（见 [video/LICENSE](video/LICENSE)）。