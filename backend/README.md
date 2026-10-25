# Utopia · 安装包分发服务

让手机用户方便安装 Utopia App 的最小分发服务。App 本身是纯本地单机应用，本服务只负责「把 APK 发给用户、托管 Web 在线版」。

## 技术说明

- 纯 Node 内置 `http` 模块，零第三方依赖，`node server.js` 即可运行。
- 单文件主服务（`server.js`）+ 发布脚本（`publish.js`）。
- 支持 HTTP Range 断点续传、路径穿越防护、下载响应头。

## 目录结构

```
backend/
├── server.js              # 分发服务（下载页 + Web 在线版 + APK）
├── publish.js             # 发布脚本：登记新版本 APK
├── public/
│   ├── index.html         # 下载页
│   ├── qrcode.js          # 二维码生成库
│   └── web/               # 移动端 Web 在线版（app 构建产物）
└── data/
    ├── versions.json      # 版本清单
    └── apk/               # 已发布的 APK
```

## 一、快速开始

```bash
cd backend
node server.js            # http://localhost:8080/
```

Windows 可直接双击 `start-utopia-server.bat`（使用 8081 端口，避免与 Web 平台冲突）。
手机与电脑在同一 Wi-Fi 时，用手机打开控制台打印的局域网地址即可下载。

> 正式分发 APK 必须使用 HTTPS，否则手机会拦截下载。

## 二、正式部署（HTTPS）

1. 云服务器安装 Node，上传本目录，用 pm2 / systemd 常驻 `node server.js`。
2. 绑定域名并配置 SSL（Nginx / Caddy 反向代理，或 Node 直接 HTTPS）。
3. 域名解析到服务器，完成备案（国内节点）。

静态托管兜底：把 `public/` 与 APK 放到任意 HTTPS 静态托管，手工维护 `versions.json` 亦可。

## 三、发布新版本

```bash
cd backend
node publish.js ./app-release.apk --version 1.2.0 --changelog "Utopia 品牌升级，功能与数据全面延续"
```

脚本会复制 APK 到 `data/apk/utopia-v<版本>-b<构建号>.apk`、计算 SHA-256、更新 `versions.json`。
版本清单按请求实时读取，登记后无需重启服务。

## 四、前端打包契约（app/）

当前前端是 React (Vite) + Capacitor 原生壳（`app/` 目录）。

| 项 | 要求 |
|---|---|
| Web 构建 | `npm run build:app`（base=/，输出 `dist-capacitor`）；`npm run build:web`（base=/public/web/，输出到 `backend/public/web`） |
| 原生工程 | `app/android/`，Web 更新后执行 `npx cap sync android` |
| APK 产物 | `app/android/app/build/outputs/apk/release/app-release.apk` |
| 签名 | 在 `app/android/keystore.properties` 配置签名（密钥与口令不入库，请自行备份，丢失后无法覆盖升级） |
| 版本号 | `android/app/build.gradle` 的 `versionName` / `versionCode`，与 `publish.js --version/--build` 保持一致 |
| 应用标识 | `applicationId` = `com.yanshiji.app`（保留旧标识，已安装用户可覆盖升级） |

## 五、重新构建 APK

```bash
cd app
npm run build:app
npx cap sync android

# 需要 JDK 21 与 Android SDK
export JAVA_HOME="<你的 JDK 21 路径>"
export ANDROID_HOME="<你的 Android SDK 路径>"
cd android && ./gradlew assembleRelease
```

> 本机若默认 Java 高于 21，请显式把 `JAVA_HOME` 指到 JDK 21，否则 Capacitor 插件会报工具链错误。

## 六、常见问题

1. **微信 / QQ 内下载被拦截**：点右上角「···」→「在浏览器中打开」。
2. **安装提示未知来源**：设置 → 安全 → 允许安装未知应用。
3. **卸载后数据丢失**：纯本地存储，卸载即清空，建议在 App 内定期导出备份。
4. **端口被占用**：`PORT=9000 node server.js`。
5. **iOS**：需 App Store / TestFlight，本期不覆盖。
