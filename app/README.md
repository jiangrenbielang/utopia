# Utopia 移动端

Utopia 的 Android / 移动端：React 19 + Vite + Capacitor 8。与 Web 端功能对齐：课程库、m3u8 / mp4 网课播放、播放即计时、章节进度、倒计时、学习计时、统计图表、历史日志与本地备份，全部数据保存在设备本地。

## 开发

```bash
npm install
npm run dev        # http://localhost:5173
```

## 构建

```bash
# 浏览器在线版（由 backend 托管到 /public/web/）
npm run build:web

# Capacitor 原生资源（base=/，供 Android 工程打包）
npm run build:app

# 同步到 Android 工程（需已安装 Android SDK / JDK 21）
npx cap sync android
```

APK 构建与发布流程见 [../backend/README.md](../backend/README.md)；分发服务入口为 `../backend/server.js`。

## 目录

- `src/pages/`：首页、课程、计时、统计、日志五个 Tab
- `src/components/CoursePlayer.jsx`：网课播放器（hls.js，播放即计时、离开自动保存）
- `src/components/CourseEditorModal.jsx`：课程 / 章节编辑
- `src/components/`：倒计时、饼图、趋势图、打卡历、设置/备份/补录弹窗
- `src/services/storage.js`：本地存储、备份格式、倒计时工具
- `src/services/timerService.js`：计时状态机与心跳恢复
- `android/`：Capacitor 生成的 Android 工程

## 兼容性说明

- **应用标识保留 `com.yanshiji.app`**：改名为 Utopia 后仍可覆盖升级已安装的旧版本，不会变成另一个 App。
- **本地存储键沿用 `yanshiji_*` 前缀**：升级后历史学习记录、设置与心跳数据不丢失。
- 导出备份的 `app` 字段为 `Utopia`，导入同时兼容旧版「研时记」备份。

## 测试

```bash
node test_suite.mjs        # 纯 Node 单元/集成测试
node simulate_user_test.mjs # 需要先启动 npm run dev（Edge + puppeteer-core）
```
