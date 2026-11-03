# TVBox「配置 / 接口」JSON 规范 + 参考客户端 UI 约定

面向在 Next.js 客户端中实现「TVBox 配置地址驱动」的中文参考文档。

**验证图例**
- ✅ **已核实**：来自抓取到的真实配置，或 [FongMi/TV](https://github.com/FongMi/TV) 源码（默认分支 `fongmi`，非 `main`）逐行确认。
- ⚠️ **未验证**：社区常见说法或本次未能取得源码确认，使用前需自行验证。

**主要来源**
- 用户指定配置：[jinenge.us.kg/app/tvbox/tvbox.json](https://jinenge.us.kg/app/tvbox/tvbox.json)（本次已抓取全文）
- 配置作者说明：[jinenge/tvbox README.md](https://raw.githubusercontent.com/jinenge/tvbox/main/README.md)
- [FongMi/TV](https://github.com/FongMi/TV)（维护中，字段语义最接近现代实践的 TVBox 家族客户端）
- [CatVodTVOfficial/TVBoxOSC](https://github.com/CatVodTVOfficial/TVBoxOSC)（原版，已归档，2022-07-18 后停更；本次网络中断未能取得其源码，仅确认仓库存在）
- [takagen99/Box](https://github.com/takagen99/Box)（TVBoxOSC 的活跃分支，`main`）

> 说明：FongMi 源码路径统一为 `app/src/main/java/com/fongmi/android/tv/...`，下文引用对应 GitHub `blob/fongmi/...` 链接。

---

## 1. 顶层字段全集

客户端读取顶层字段的位置：`VodConfig.parseConfig()` / `initList()`（点播配置）与 `LiveConfig.parseConfig()`（直播配置）。

| 字段 | 类型 | 作用 | 验证 |
|---|---|---|---|
| `sites` | `Site[]` | 点播站点列表，客户端首页/分类/搜索的数据源 | ✅ |
| `lives` | `Live[]` | 直播源列表 | ✅ |
| `parses` | `Parse[]` | 解析（去广告/取真实播放地址）接口列表 | ✅ |
| `spider` | `string` | 全局 Spider 包路径，可为 `x.jar;md5;<hash>`、`*.js`、`node:...`、`*.py` | ✅ |
| `wallpaper` | `string` | 壁纸地址。**基地址或完整 JSON 地址**：FongMi 把它交给独立的 `WallConfig` 处理，字段本身只是字符串 | ✅ |
| `logo` | `string` | 首页/启动 logo（图片 URL），本配置为一个 `.gif` | ✅ |
| `notice` | `string` | 公告文本（存 `Config.notice`，客户端弹公告/通知栏） | ✅ |
| `headers` | 对象数组 | 全局请求头注入，`Header.arrayFrom(...)` | ✅ 字段存在；元素结构 ⚠️ |
| `ads` | `string[]` | 广告过滤规则（与 `rules` 共用同一套 `RuleConfig` 引擎） | ✅ |
| `rules` | `Rule[]` | 正则改写/去广告规则，见 §6 | ✅ |
| `hosts` | `string[]` | 域名重定向，格式 `原域名=目标域名`（本配置 2 条） | ✅ |
| `flags` | `string[]` | **线路名白名单**，命中则走解析。**不是**首页推荐分组，见 §6 | ✅ |
| `doh` | `Doh[]` | DNS over HTTPS 服务器列表（FongMi 用 `doh` 键名） | ✅ |
| `proxy` | `Proxy[]` | 代理列表 | ✅ |
| `msg` | `string` | 若存在则**抛异常中止加载**，用于提示"配置已失效" | ✅ |
| `urls` | `Depot[]` | 多仓格式：`[{name,url}]`，客户端改加载第一个仓库 | ✅ |
| `danmaku` / `assrt` | `string` | 弹幕接口 / 字幕接口，存入 `Config` 实体 | ✅ |
| `ijk` | 对象/数组 | IJK 内核播放参数（category/name/value 形式） | ⚠️ 本配置无此字段，FongMi 不读取 |
| `dns` | `string[]` | 部分文档写作 `dns`，FongMi 实际键名是 `doh` | ⚠️ 键名差异未在原版源码核实 |
| `timeout` | `number` | 顶层超时。FongMi **不读取顶层 `timeout`**，只用 `site.timeout` / `live.timeout`（秒） | ✅ |
| `jar` / `spides` | — | 顶层无 `jar`；`spides` 疑为 `spider` 的拼写错误，源码中无任何读取点 | ✅ |

**多仓格式**（`{"urls":[...]}`）与单仓格式（含 `sites`）互斥：源码先判 `msg`，再判 `urls`，否则按单仓解析。

---

## 2. 实测样本：jinenge 配置统计

以下为 [该配置](https://jinenge.us.kg/app/tvbox/tvbox.json) 的真实结构（不贴原文）：

| 项 | 结果 |
|---|---|
| 顶层键 | 仅 7 个：`spider` `wallpaper` `sites` `rules` `logo` `hosts` `lives` |
| **缺失**的常见键 | `parses`、`flags`、`ads`、`headers`、`ijk`、`dns`/`doh`、`notice`、`timeout` |
| `sites` 总数 | **42** |
| `sites[].type` 分布 | **type 3 = 42**；type 0/1/2/4 = 0 |
| 其中 jar spider（`api` 为 `csp_*`） | **39** |
| 其中 JS spider（`api` = `./lib/drpy2.min.js`） | **3**（虎牙js、斗鱼js、dr_兔小贝） |
| 复用同一 spider 类 | `csp_AppSxGuard` ×7、`csp_BiliGuard` ×6、`csp_T4Guard` ×2 |
| `lives` 总数 | **7**，全部 `type: 0`（`.txt` ×1、`.m3u` ×6） |
| `parses` 总数 | **0（字段不存在）→ 该配置下解析功能完全未启用** |
| `rules` | 1 条，`name: cdn.ryplay`，5 条正则（删除 `#EXT-X-DISCONTINUITY` 片段） |
| `hosts` | 2 条（`img1.wsyzy.org=...`、`fiizvfck.top=...`） |
| `spider` | `./lib/jinenge.jar;md5;1d7a5147033044a81f91d5f4a510f9ed` |
| `sites[].style.type` 分布 | `oval` ×1、`list` ×5、`rect` ×12、**未指定 ×24** |
| `sites[].playerType` | 出现 `1`、`2` 与字符串 `"2"`（类型不统一，客户端需兼容） |
| 相对路径 | `./lib/...` 相对**配置 JSON 所在目录**；README 明确 jar 与直播目录均在同级 `lib/` | 

> ⚠️ 该配置本质是「jar spider 全集」：42/42 站点都依赖 jar 或 drpy JS，纯浏览器客户端在此配置下**可播放的点播站点为 0**（详见 §10）。

---

## 3. `sites[]` 字段

依据 [Site.java](https://github.com/FongMi/TV/blob/fongmi/app/src/main/java/com/fongmi/android/tv/bean/Site.java)（含 `@SerializedName` 与默认值逻辑）。

| 字段 | 类型 | 语义 | 验证 |
|---|---|---|---|
| `key` | `string` | 站点唯一主键（数据库主键），跨配置同步用户设置靠它 | ✅ |
| `name` | `string` | 显示名（含 emoji 与全角符号，本配置普遍带 `┃` 分隔符） | ✅ |
| `type` | `int` | 站点类型，见 §3.1，默认 `0` | ✅ |
| `api` | `string` | 接口地址；可为 http(s) URL、`csp_XXX`、`*.js`、`node:...`、`*.py` | ✅ |
| `ext` | `string \| object` | 扩展参数，自适应类型；**以 `http` 开头时会被下载后作为真实 ext** | ✅ |
| `jar` | `string` | 站点级 jar，覆盖顶层 `spider` | ✅ |
| `searchable` | `int` | `0`=强制不可切换；`1`/`2`=用户可切换的"开/关" | ✅ |
| `quickSearch` | `int` | 同上语义，是否参与聚合搜索（默认 `1`） | ✅ |
| `changeable` | `int` | 同上语义，是否允许用户改线路（默认 `1`） | ✅ |
| `hide` | `int` | `1` = 在列表中隐藏 | ✅ |
| `indexs` | `int` | `1` = 该站点作为首页聚合入口（本配置"主页┃推荐"用 `indexs:1`） | ✅ |
| `timeout` | `int` | **单位秒**，内部转 ms；缺省用播放超时 | ✅ |
| `categories` | `string[]` | 只保留这些分类名（按 `type_name` 过滤） | ✅ |
| `header` | `object` | 该站点请求头 | ✅ |
| `style` | `{type,ratio}` | 卡片样式，见 §3.2 | ✅ |
| `lang` | `string` | 站点语言，搜索词会按其转换（简繁等） | ✅ |
| `click` / `playUrl` | `string` | 点击动作 / 播放地址前缀 | ✅ |
| `danmaku` | `int` | 弹幕总开关（默认 `1`） | ✅ |
| `filter` / `filterable` | — | **FongMi 的 Site 中不存在此字段**；筛选来自响应体 `filters`，见 §3.4 | ✅ |
| `playerType` | `int`/`string` | 播放器内核选择（0 系统 / 1 IJK / 2 EXO 为常见说法） | ⚠️ 源码中不存在，仅 TVBox 原版分支使用，取值未核实 |

### 3.1 `type` 取值（已核实）

分发逻辑见 [SiteApi.java](https://github.com/FongMi/TV/blob/fongmi/app/src/main/java/com/fongmi/android/tv/api/SiteApi.java) 与 [Result.fromType()](https://github.com/FongMi/TV/blob/fongmi/app/src/main/java/com/fongmi/android/tv/bean/Result.java)：

```java
// SiteApi：请求参数名
ac = (type == 0) ? "videolist" : "detail";
// Result：响应解析
fromType(type, str) → type == 0 ? fromXml(str) : fromJson(str)
isSpider(site) → type == 3；type == 4 走独立的"外链 API"分支
```

| `type` | 含义 | 响应格式 | 验证 |
|---|---|---|---|
| `0` | XML 采集接口（苹果 CMS `videolist`） | XML | ✅ |
| `1` | JSON 采集接口（苹果 CMS `detail`） | JSON | ✅ |
| `2` | JSON 采集变体：走与 `1` 相同的 JSON/`detail` 分支 | JSON | ✅ 分支可证；与 1 的差异 ⚠️ |
| `3` | Spider（jar / js / py / node） | Spider 返回的 JSON | ✅ |
| `4` | 外链 / 外部 API | JSON | ✅ |

### 3.2 `style` 与卡片布局

依据 [Style.java](https://github.com/FongMi/TV/blob/fongmi/app/src/main/java/com/fongmi/android/tv/bean/Style.java)。

| `style.type` | 布局 | 默认 ratio |
|---|---|---|
| `rect`（默认） | 竖版海报卡（`ratio` > 1 视为横版 banner） | `0.75`（即宽:高 = 3:4 输入，渲染按比例） |
| `oval` | 圆形卡（人物/音乐类） | `1.0` |
| `list` | 纯文字列表行 | 无 |

`ratio` 上限被钳制为 `4`；站点未给 `style` 时可回退到 vod 项自身的 `land`/`circle`/`ratio`（见 `Vod.getStyle()`）。

### 3.3 type 0/1 采集站请求约定（苹果 CMS）✅

| 场景 | 请求 |
|---|---|
| 首页 | **直接 GET `api`，不带参数** |
| 分类 | `ac=videolist`(type0) / `ac=detail`(type1/2) + `t=<分类id>` + `pg=<页码>`；**type 1 额外 `f=<过滤条件JSON>`** |
| 搜索 | `wd=<关键词>` + `quick=true|false` + `extend=` (+ `pg` 仅非首页) |
| 详情 | `ac=...` + `ids=<id>`（批量补海报时 `ids` 为逗号分隔多 id） |
| 全部 | `extend` = 站点 `ext`（非空时自动附加）；ext ≥ 1000 字符时改为 POST body |

- 请求头：站点 `header` + 全局 `headers`。
- **海报补全**：type ≤ 2 且列表项缺 `vod_pic` 时，客户端会用 `ids` 批量请求一次再合并（`fetchPic()`）。

### 3.4 响应结构与 `filters` ✅

**type 0（XML）** — 由 [Vod.java](https://github.com/FongMi/TV/blob/fongmi/app/src/main/java/com/fongmi/android/tv/bean/Vod.java) / [Class.java](https://github.com/FongMi/TV/blob/fongmi/app/src/main/java/com/fongmi/android/tv/bean/Class.java) 的 SimpleXML 注解反推：

```xml
<rss>
  <class><ty id="1">电影</ty></class>
  <list><video>
    <id/><name/><type/><pic/><note/><year/><area/><director/><actor/><des/>
  </video></list>
  <dl><dd flag="线路名">第01集$http://a.m3u8#第02集$http://b.m3u8</dd></dl>
</rss>
```

**type 1（JSON）** — 关键字段名（源码 `@SerializedName`）：

| 层级 | 字段 |
|---|---|
| 分页 | `code` `msg` `page` `pagecount` `limit` `total` |
| 分类 `class[]` | `type_id`（或 `id`）、`type_name`（或 `name`）、`type_flag`、`land`/`circle`/`ratio` |
| 列表 `list[]` | `vod_id` `vod_name` `type_name` `vod_pic` `vod_remarks` `vod_year` `vod_area` `vod_director` `vod_actor` `vod_content` `vod_play_from` `vod_play_url` `vod_tag` `action` `cate` `style` |
| 详情播放 | `vod_play_from` 与 `vod_play_url` **以 `$$$` 分隔多线路**，两数组一一对应 |
| 单线路剧集 | 以 `#` 分隔；每集 `集名$地址`，无 `$` 时自动编号 `01,02...` |
| 播放结果 | `url` `header` `parse` `jx` `playUrl` `flag` `key` `position` `drm` `subs` `danmaku` `skips` `artwork` `web` `click` `format` `desc` `timeshift` `msg` `code` |

**`filters`（分类筛选）** ✅ — 由 [Filter.java](https://github.com/FongMi/TV/blob/fongmi/app/src/main/java/com/fongmi/android/tv/bean/Filter.java) + [Value.java](https://github.com/FongMi/TV/blob/fongmi/app/src/main/java/com/fongmi/android/tv/bean/Value.java)：

```json
"filters": {
  "1": [ { "key": "area", "name": "地区", "init": "", "value": [ {"n":"全部","v":""}, {"n":"大陆","v":"大陆"} ] } ]
}
```

- `filters` 是 **`LinkedHashMap<分类id, Filter[]>`**，分类 id 对应 `class[].type_id`。
- 筛选项 URL 取值：把用户选择的 `key → v` 组成对象，**type 1 以 `f=<JSON>` 发出，type 4 以 `ext=<base64url(JSON)>` 发出**。
- `value[].n` 是显示文本，`v` 是提交值（可省略 `n`，此时 `v` 兼作显示）。

### 3.5 `type 4` 外链 API ✅

- 首页：`filter=true`；分类：`ext=<base64url(JSON过滤条件)>` + `ac`/`t`/`pg`；播放：`play=<id>` + `flag=<线路>`。
- `action` 直接 GET 一个 URL 并解析为 `Result`。

---

## 4. `lives[]` 字段

依据 [Live.java](https://github.com/FongMi/TV/blob/fongmi/app/src/main/java/com/fongmi/android/tv/bean/Live.java) 与 [LiveConfig.java](https://github.com/FongMi/TV/blob/fongmi/app/src/main/java/com/fongmi/android/tv/api/config/LiveConfig.java)。

| 字段 | 类型 | 语义 | 验证 |
|---|---|---|---|
| `name` | `string` | 直播源唯一名（主键） | ✅ |
| `url` | `string` | 直播文件地址（`.m3u` 或 `.txt`） | ✅ |
| `type` | `int` | `0`=文本(m3u/txt)、`1`=单仓 JSON（常见说法）。FongMi **不读 `type`**，改为嗅探内容：JSON 对象走 JSON 分支，否则走文本解析 | ✅（本配置 7 个全为 `0`） |
| `epg` | `string` | 逗号分隔；含 `{` 的项视为 **EPG 模板 API**（如 `http://diyp5.112114.xyz/?ch={name}&date={date}`），其余视为 xml/gz 节目单 | ✅ |
| `logo` | `string` | 频道台标模板，支持 `{name}` 占位（如 `https://epg.112114.xyz/logo/{name}.png`） | ✅ |
| `ua` / `origin` / `referer` | `string` | 分别注入 `User-Agent` / `Origin` / `Referer` 请求头 | ✅ |
| `header` | `object` | 附加请求头 | ✅ |
| `timeout` | `int` | 秒 | ✅ |
| `jar` / `api` / `ext` | `string` | 该直播源也可挂 Spider（与站点同机制） | ✅ |
| `catchup` | `object` | 回看（时移）配置 | ✅ |
| `core` | `object` | 播放内核配置（`getResp()` 等） | ✅ |
| `groups` | `Group[]` | 分组结构（分组名 → 频道） | ✅ |
| `boot` | `bool` | 开机自动播放 | ✅ |
| `pass` | `bool` | 隐藏/密码保护分组 | ✅ |
| `keep` | `string` | 上次观看位置（`分组⊕频道⊕时间`），由客户端写入 | ✅ |
| `timeZone` | `string` | EPG 时区 | ✅ |

**`type=0` 与 `type=1` 的实际差别** ✅：`type=0` 指向 m3u/txt（`#genre#` 分组、`频道名,地址` 行、`#EXTINF` 元数据），由文本解析器处理；`type=1` 指向一个 JSON（结构与 §1 相同，即含 `lives` 或 `urls` 的直播配置），由 JSON 分支处理。FongMi 用「内容是否 JSON 对象」判定，不信任 `type` 字段，这一实现比 `type` 字段更宽松。

---

## 5. `parses[]` 字段

依据 [Parse.java](https://github.com/FongMi/TV/blob/fongmi/app/src/main/java/com/fongmi/android/tv/bean/Parse.java)。

| 字段 | 类型 | 语义 | 验证 |
|---|---|---|---|
| `name` | `string` | 解析名（用户可见，也是被记住的选择项） | ✅ |
| `type` | `int` | 解析方式，默认 `0` | ✅ |
| `url` | `string` | 解析接口地址 | ✅ |
| `ext.flag` | `string[]` | 仅在指定线路名（flag）下才使用该解析器 | ✅ |
| `ext.header` | `object` | 该解析器请求头 | ✅ |
| `header` | `object` | 顶层 `header` 会合入 `ext.header` | ✅ |

**`type` 语义**

| `type` | 含义 | 验证 |
|---|---|---|
| `4` | **超级解析**：源码 `Parse.god()` 明确 `setType(4)` 且名称取字符串资源 `parse_god`。FongMi 在 `parses` 非空时**自动把超级解析插到列表首位** | ✅ |
| `1` | JSON 解析（把目标地址以参数形式交给解析站，取回 JSON 中的真实地址） | ⚠️ 社区通用说法；本次网络中断未能取得 `api/parser` 目录源码 |
| `2` | 聚合解析 | ⚠️ 同上 |
| `3` | 插件解析 | ⚠️ 同上 |
| `0` | 嗅探/黑盒解析（需 WebView 嗅探真实媒体地址） | ⚠️ 同上 |

> 未验证项说明：`Parse.type` 的 0/1/2/3 分发代码位于 `app/src/main/java/com/fongmi/android/tv/api/parser/`（已知该目录存在），本次因宿主 DNS 故障未能抓取，故只确证 `type=4`。**实现客户端时不要依赖 1/2/3 的精确语义。**
>
> 已确证的相关行为：`Result.isUseParse()` = `hasParse() && ((playUrl 为空 && 顶层 flags 含当前线路名) || jx == 1)`，即"是否走解析"由**顶层 `flags` 白名单**或**播放结果里的 `jx=1`** 决定。

---

## 6. `flags` / `ads` / `rules` / `hosts` / `headers`

### `flags` —— 重要澄清 ✅

[VodConfig.java](https://github.com/FongMi/TV/blob/fongmi/app/src/main/java/com/fongmi/android/tv/api/config/VodConfig.java) 中：

```java
private List<String> flags;
setFlags(Json.safeListString(object, "flags"));   // 读成字符串数组
```

用途仅在 `Result.isUseParse()`：**当"当前线路名"命中该数组且 `playUrl` 为空时，改用解析器播放**。它是一份「该走解析的线路白名单」。

- ❌ **`flags` 不是首页"推荐"分组的驱动字段**，也不是 `[{key,name,value}]` 结构（至少 FongMi 分支不是）。
- ✅ 首页「推荐」内容实际来自：`type=3` 站点的 `homeContent()` / `homeVideoContent()`，或 CMS 响应里的 `class[]` 分类列表；`indexs:1` 的站点作为首页聚合入口。
- ⚠️ 若某些第三方文档写作 `[{"key","name"}]`，未能在任何源码中核实；本项目应把 `flags` 实现为"字符串数组"并做好类型兜底（收到非字符串数组时忽略）。

### `ads` / `rules` ✅

| 字段 | 结构 | 作用 |
|---|---|---|
| `ads` | `string[]` | 广告过滤条目，与 `rules` 共用 [RuleConfig](https://github.com/FongMi/TV/blob/fongmi/app/src/main/java/com/fongmi/android/tv/api/config/RuleConfig.java) 引擎 |
| `rules` | `Rule[]` | 见下 |

依据 [Rule.java](https://github.com/FongMi/TV/blob/fongmi/app/src/main/java/com/fongmi/android/tv/bean/Rule.java)：`{ name, hosts[], regex[], script[], click[], exclude[] }`。

- 匹配方式：`hosts` 命中域名后，按 `regex` 对**媒体文本**（m3u8 播放列表/ts 片段）做删除或改写；`exclude` 为排除正则；`script` / `click` 供脚本型规则使用。
- 本配置的实例正是删掉 m3u8 里的 `#EXT-X-DISCONTINUITY` 与固定时长片段（典型"去片头广告/去转场"写法），作用于 `cdn.ryplay` 域名。

### 其它

| 字段 | 结构 | 说明 | 验证 |
|---|---|---|---|
| `hosts` | `string[]` | `原域名=目标域名` 域名重定向（DNS 级替代，可在请求层实现） | ✅ |
| `headers` | `Header[]` | 全局请求头；元素结构（`{"key","value"}` 或 `{"name","value"}`）未取得源码 | ⚠️ 元素结构 |
| `doh` / `proxy` | `Doh[]` / `Proxy[]` | DoH 与代理；浏览器端基本无实现空间（代理须服务端） | ✅ |

---

## 7. Spider（jar）机制

依据 [BaseLoader.java](https://github.com/FongMi/TV/blob/fongmi/app/src/main/java/com/fongmi/android/tv/api/loader/BaseLoader.java)。

```java
isNode(api) → api.startsWith("node:")   → NodeLoader   （需 NodeJS 运行时模块）
isPy(api)   → api.contains(".py")       → PyLoader     （需 Python 运行时模块）
isJs(api)   → api.contains(".js")       → JsLoader     （需 QUICKJS 运行时模块）
isCsp(api)  → api.startsWith("csp_")    → JarLoader    （Android DexClassLoader 加载 dex）
否则                                     → SpiderNull  （空实现）
```

| 机制 | 要点 | 验证 |
|---|---|---|
| `spider` 值语法 | `<路径/URL>;md5;<32位hash>`；本配置 = `./lib/jinenge.jar;md5;1d7a5147033044a81f91d5f4a510f9ed`。客户端按字符串 md5 作为缓存键（`Crypto.md5(jar)`）；`;md5;` 后缀的具体校验时机未从源码核实 | ✅ 键名/格式；校验时机 ⚠️ |
| `csp_` 前缀 | 前缀 + 类名，指向 jar 内实现了 `Spider` 接口的类；jar 由 **`dalvik.system.DexClassLoader`** 加载 | ✅ |
| 站点级覆盖 | `Site.jar` 非空则覆盖顶层 `spider`（`if (site.getJar().isEmpty()) site.setJar(spider)`） | ✅ |
| 为何纯浏览器/纯 Node 跑不了 jar | jar 中是 **DEX 字节码**，必须由 Android ART/Dalvik 执行。浏览器（V8）与 Node 都没有 JVM/Dalvik，无法加载 `DexClassLoader`；`csp_*` 类还普遍依赖 Android API（`android.text`、`okhttp` 定制版、WebView 嗅探等） | ✅ 机制可证；具体依赖 ⚠️ |
| js spider（drpy） | 需 **QuickJS** 运行时 + 宿主注入的 Java 能力（`JsHost`、okHttp、嗅探、加解密等）。纯浏览器 V8 缺少这些宿主 API，**不能直接运行 drpy2.min.js** | ✅（`getJsLoader()` 内有 `RuntimeModule.QUICKJS.require()`） |
| `node:` / `.py` | FongMi 另行内置 NodeJS / Python 运行时模块，同样需要宿主 | ✅ |

**对客户端的直接含义**：`csp_*` 站点在浏览器/Node 里**必然为空壳**（能列站点、点开无内容）——这正是 jinenge README 强调"缺少 jar 就只能看到站点、点击是空荡的"的原因。

---

## 8. 客户端调用序列（实现检查表）

按 [SiteApi.java](https://github.com/FongMi/TV/blob/fongmi/app/src/main/java/com/fongmi/android/tv/api/SiteApi.java) 的实际分发顺序整理，可直接作为 Next.js 侧的对接清单：

| 步骤 | 请求 | 处理要点 |
|---|---|---|
| 1 加载配置 | GET 配置地址 | 先判 `msg`（报错中止）→ 再判 `urls`（多仓，取首个）→ 否则单仓解析；保存 **base URL** 用于解析 `./lib/...` 相对路径 |
| 2 首页 | type3 → spider `homeContent`/`homeVideoContent`；type4 → `?filter=true`；type0/1/2 → **GET `api` 不带参数** | 得到 `class[]`（分类 tab）+ `list[]`（推荐行）+ `filters`；按 `site.categories` 过滤分类；`vod_pic` 缺失时用 `ids` 批量补一次 |
| 3 分类 | type0 → `ac=videolist&t&pg`；type1/2 → `ac=detail&t&pg`（+ `f=<过滤JSON>`）；type4 → `ext=<base64url>` | 海报网格渲染；分页用 `pagecount` |
| 4 搜索 | `wd&quick`（非首页再加 `pg`）；聚合搜索并发多站点 | 结果**必须带站点标记**，供后续"换源"使用 |
| 5 详情 | `ac&ids=<id>` | 拆 `vod_play_from`/`vod_play_url`（`$$$` → 线路，`#` → 剧集，`$` → 集名/地址）；`skips`/`subs`/`danmaku` 透传给播放器 |
| 6 播放 | type3 → spider `playerContent(flag,id,flags)`；type4 → `play&flag`；type0/1/2 → 直接用剧集地址 | 是否走解析由 `parse==1`、`jx==1` 或（`playUrl` 为空 && 顶层 `flags` 含当前线路名）决定；`url` 可能是**画质数组** |
| 7 续播 | 写回 `position`（秒）+ 所选线路/集 | 收藏与历史按配置 id 隔离 |

**换源实现**：换源 = 用剧集名在其他站点重新搜索，再在各线路内按"集号 + 备注"打分匹配最接近的一集（`Flag.find(remarks)` 按集号与备注做评分取最优，其次回退到上次播放位置、再回退首集）。

---

## 9. 参考客户端 UI 约定（TVBox 风格）

> ⚠️ **本节的色值均为"常见视觉特征描述"，不是精确取色**：本次未能取得任何 TVBox 客户端的主题色值定义（网络中断，未抓到 `colors.xml` / 主题资源）。需要精确色值时必须在目标客户端里实测取色。

### 9.1 布局骨架（可由源码字段反推）✅

| 页面 | 结构 | 对应的配置字段 |
|---|---|---|
| 首页 | 顶部栏：`logo` + 搜索入口 + 设置；横向滚动**站点/分类 tab**；轮播 banner；下方多个横向海报行（推荐/电影/电视剧…）；`indexs:1` 的站点作为聚合入口 | `logo`、`wallpaper`、`sites[].indexs`、站点 `homeContent` 的 `class[]` |
| 分类页 | 顶部分类横排 + **筛选面板**（每组 `name` + 标签按钮组，单选）；海报网格（`rect`）/圆形网格（`oval`）/文字列表（`list`） | 响应体 `filters`、`style` |
| 详情页 | 顶部背景大图 + 海报 + 标题/备注/年份/地区 + 简介与演员；**线路切换 tab**（`vod_play_from`）；**剧集网格**（`vod_play_url`，圆角集号按钮）；常见"倒序"按钮 | `vod_play_from`/`vod_play_url` |
| 播放器 | 全屏/画面比例、解码方式切换、倍速、**换源**（切站点重搜）、**解析源切换**、选集、下一集、弹幕、**跳过片头/片尾**（`skips`）、字幕（`subs`）、画质列表（`url.values`）、`position` 续播 | `parses`、`flags`、`skips`、`subs`、`position`、`drm` |
| 直播页 | 分组 tab（`groups`）、频道网格/列表、EPG 节目单（`epg` 模板）、收藏频道、回看（`catchup`）、开机自启（`boot`）、隐藏分组（`pass`） | `lives[]` 全字段 |
| 设置页 | **配置地址三类**：点播=`Config type 0`、直播=`Config type 1`、壁纸=`Config type 2`；播放器设置；数据管理（备份/恢复/清除缓存） | `Config.vod()/live()/wall()` |
| 收藏 / 历史 | 独立库，与配置 id 绑定（换配置即隔离） | `Keep` / `History` 按 `configId` 绑定 |

### 9.2 视觉特征（描述，非精确值）⚠️

- **深色为主**：近黑背景（常见 `#000000`~`#101418` 一带），卡片比背景略亮一档；整体高对比、大面积暗底衬托海报。
- **强调色**：普遍使用**橙/红/金黄系**的单一强调色（选中 tab 下划线、播放按钮、集号高亮），部分分支支持主题色切换。
- **卡片**：海报**圆角矩形**（圆角约 4–10dp 量级），竖版 2:3 或 3:4；卡片右上/右下角常叠加**角标**（"更新至xx集"、评分、`vod_remarks`）。
- **横排分类**：顶部一排可横向滚动的分类/站点文本，选中项高亮 + 下划线或色块。
- **渐隐遮罩**：详情页头图底部、banner 文本区使用**自下而上的黑色渐变遮罩**保证文字可读。
- **焦点态**（TV 端）：D-pad 焦点放大 1.05–1.15 倍 + 边框/发光高亮。
- 播放器 UI：控制条自动隐藏，居中为播放/暂停，左右为进度与手势，底部为进度条 + 选集/倍速/比例/换源入口。

---

## 10. 对纯 JavaScript 客户端（浏览器 / Electron / Next.js）的可行性结论

### 10.1 结论速览

| 能力 | 可行性 | 前置条件 |
|---|---|---|
| 拉取并解析配置 JSON | ✅ 可做 | 配置站需允许跨域；否则用 Next.js Route Handler / 服务端转发。**相对路径要按配置 URL 解析**（`./lib/x.jar` → `<配置目录>/lib/x.jar`） |
| `wallpaper` / `logo` / `notice` | ✅ 可做 | `<img>` 加载图片不受 CORS 限制；有防盗链时需代理 |
| **type 1 / 2 站点**（JSON 采集） | ✅ 可做 | **服务端 CORS 代理**（采集站几乎都不发 CORS 头）；XML(type 0) 还需 `DOMParser`（浏览器原生可用） |
| **type 4 外链 API** | ✅ 可做 | 同上；注意 `ext` 是 base64url(JSON) |
| `filters` / 分类 / 详情 / 搜索 | ✅ 可做 | 同上；`$$$`/`#`/`$` 三段分隔解析规则已明确（§3.4） |
| `lives` type 0（m3u/txt） | ✅ 可做 | 文本解析纯前端即可；播放用 `hls.js`（Safari 原生 m3u8），**源站 CORS 仍是硬门槛** |
| `lives` type 1（单仓 JSON） | ✅ 可做 | 与配置解析同一套逻辑 |
| EPG（模板 API / XMLTV） | ✅ 可做 | `{name}`/`{date}` 占位替换；XMLTV 用 `DOMParser`；需代理 |
| `rules` 去广告（m3u8 文本正则） | 🟡 部分可做 | 需自定义 `hls.js` loader，在拉取 playlist 后按 `hosts`+`regex` 改写文本；**无法作用于已分片的媒体流**，也无法做域名级替换 |
| `hosts` 域名重定向 | 🟡 部分可做 | 浏览器无法改 DNS；只能在代理层重写 URL，或仅对自身发起的请求做映射 |
| `ads` | 🟡 部分可做 | 同 `rules` |
| `parses`（解析） | 🟡 极有限 | 仅能实现"把 URL 交给解析接口、取回 JSON 中的真实地址"这一种；`type 4 超级解析`、嗅探类、插件类均需 Android WebView + 嗅探/内部引擎，浏览器不可做 |
| 收藏 / 历史 / 续播 | ✅ 可做 | localStorage / IndexedDB；`position`、`Keep`、`History` 均按配置 id 隔离 |
| **type 3 站点（jar / `csp_*`）** | ❌ **不可做** | 需 Android `DexClassLoader` 执行 DEX，浏览器/Node 无 JVM。本配置 **39/42** 站点在此列 |
| **js spider（drpy2）** | ❌ 不可做 | 需 QuickJS + 宿主注入的 Java 能力（`JsHost`/okHttp/嗅探/加密）。本配置 3/42 站点在此列 |
| `./lib/*.jar` 的加载与执行 | ❌ 不可做 | 同上 |
| 自定义 `User-Agent` / `Referer` / `Origin` | ❌ 浏览器不可做 | 这些是**浏览器禁止修改的请求头**；`<video>`/`fetch` 都设不了。本配置 5 个直播源显式依赖 `ua: "okHttp/Mod-1.5.0.0"` → 必须走服务端代理，或在 Electron 主进程/`webRequest` 层注入 |
| `doh` / `proxy`（配置内置） | ❌ 基本不可做 | 浏览器不允许改 DNS/系统代理；需下沉到服务端或 Electron |
| 嗅探式播放（WebView 提取真实地址） | ❌ 不可做（浏览器） | 需 Electron 注入/DevTools 协议拦截，且跨域第三方页面不可控 |

### 10.2 针对本配置的落地建议

1. **先做"能用的一半"**：配置解析 → 站点 tab → 直播（7 个源，其中 5 个需代理注入 UA）→ 收藏/历史。这部分在 Next.js 里完全可行。
2. **点播部分需要换配置**：本配置 42/42 站点依赖 jar/JS。要验证纯 JS 的 type 1 链路，请另找一份以 `type: 1` + `api: "https://.../api.php/provide/vod/"` 为主的公开配置，按 §3.3/§3.4 的规则对接。
3. **架构上必须有一个代理层**：建议 Next.js Route Handler 做 `/api/tvbox/proxy?url=`（限制目标域名白名单、注入 UA/Referer、透传 Range），并把 CORS、禁止头、防盗链三个问题一并解决。这同时为将来的 Electron 版本保留同一层接口。
4. **不要把 `flags` 当推荐分组**：按 §6 实现为字符串数组；首页推荐走 `homeContent`/`class[]`。
5. **类型兜底**：`type`、`playerType`、`searchable`/`quickSearch`/`changeable` 在真实配置里混用数字与字符串（本配置 `playerType` 就有 `2` 与 `"2"`），解析时统一 `Number()` 转换并给默认值。
6. **降级策略**：遇到 `csp_*` / `*.js` 站点，UI 上仍展示（保持与 TVBox 一致的信息架构），但点击时提示"当前环境不支持该类接口（需 Android 客户端）"，避免空白页。

---

## 11. 未验证清单（交付风险提示）

| 结论 | 状态 |
|---|---|
| `parses[].type` 0/1/2/3 的精确解析方式 | ⚠️ 未验证（仅 `type=4` 超级解析已核实） |
| `playerType` 取值 0/1/2 的含义 | ⚠️ 未验证（FongMi 源码无此字段） |
| `ijk` / 顶层 `dns` / 顶层 `timeout` 语义 | ⚠️ 未验证（本配置无这些字段；FongMi 不读取） |
| `headers` 数组元素的确切键名 | ⚠️ 未验证 |
| `;md5;` 后缀的校验时机 | ⚠️ 未验证 |
| 任何精确主题色值（背景/卡片/强调色 hex） | ⚠️ 未验证，§9.2 为视觉描述 |
| `sites[].filter` / `filterable` 字段 | ⚠️ 在 FongMi 源码中**不存在**；筛选来自响应体 `filters` |
| `flags` 为 `[{key,name,value}]` 且驱动首页推荐 | ❌ 与源码不符（见 §6） |