# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/)：修复 = PATCH，新功能 = MINOR，不兼容变更 = MAJOR。发布时同步更新 `package.json` 的 `version`、`index.js` 的 `PLUGIN_VERSION` 与本文件（`node scripts/bump-version.mjs <version> "<note>"`）。

**版本记录约定**：同一发布日只保留一个章节，标题取当日**最后一个**已发布版本号；当日多次发布的改动合并到该章节，并在标题下注明当日实际发布过的版本号（npm 上仍可安装这些独立版本）。若当日已有发布，后续小改动不再单独增加版本号，而是并入下一篇日志。这样日志按天规整、不出现同日多个小版本。

## 1.3.9 — 2026-11-02

（当日已发布版本：v1.3.5 / v1.3.6 / v1.3.7 / v1.3.8 / v1.3.9）

- feat(ui): 供应商管理页可为 **Open Design** 填写「工作区 ID」并持久化到插件配置——此前 workspaceId 只能在 profile patch 或 `OPENDESIGN_WORKSPACE_ID` 里设置，用推理 Key 配好供应商后额度卡片仍报错却无处可改
- feat(ui): **Control Key 也能在弹窗里直接填**（v1.3.9）——Open Design 卡片新增密码型输入框，粘贴保存即写入插件自己的 store；输入框是只写的（Host 只回 `hasKey` / `keySource`，secret 永不下发浏览器），保存成功后自动清空并改用「已保存；要替换请重新粘贴」占位提示。小白用户不再需要手改 `.credentials.yaml`
- feat(ui): 「工作区 ID」输入框支持**直接粘贴整条控制台地址**——`https://open-design.ai/cloud/dashboard?workspaceId=ws_x&tab=billing` 会自动提取出 `ws_x`，避免用户复制整条 URL 后被校验拒绝
- feat(ui): Open Design 额度失败时的引导——详情弹窗的错误条说明「额度查询需要工作区 ID 与 Control Key（不是推理 Key）」，并提供「去配置」按钮直接跳到供应商管理页
- feat(host): Host 侧错误文案更具体（区分缺 workspaceId / 缺 Control Key，并指向管理页）；`providerUpdate` 接受 `workspaceId`，校验为 1–120 位标识符字符（字母、数字、`. _ : @ -`），路径穿越/空格/超长一律拒绝
- feat(wire): `providers[]` 仅对声明了 workspace 的适配器（Open Design）下发 `workspaceId` 字段；其余供应商不下发，客户端据此决定是否渲染输入框（旧 Host 无此字段 ⇒ 不渲染，自然降级）
- feat(ui): Open Design 缺配置时 chip 不再按 `missing-key` 静默隐藏，而是显示「待配置」并可点进详情看引导——否则用户既看不到提示也没有入口
- fix(tool): Agent 工具 `tokenlens_usage` 的 `updateCheck` 动作此前虽在枚举里却会落到用量读取分支，返回当前供应商的用量或错误；现在正确执行更新检查并返回 `UpdateInfo`
- docs: 中英 README 补充 **workspace ID 与 Control Key 到底在哪里取**——控制台的「套餐与余额」页没有独立的 ID 字段，workspace ID 取自地址栏的 `?workspaceId=`（成员邀请预览页也会显示「工作空间 ID」），而 `~/.amr/config.json` 只存 `controlKey` / `runtimeKey` / `apiUrl` / `linkUrl`、不含 workspace ID；Control Key 是桌面端 / `vela login` 写入该文件的 `profiles.prod.controlKey`，用推理 Key 冒充会得到 401
- 测试：280 → 289（workspace ID 校验/持久化/清空与 URL 提取、管理页字段渲染、Control Key 只写保存与不回声、缺 workspaceId 的 Host 报错与引导按钮、待配置 chip、工具 updateCheck 分发）

## 1.3.4 — 2026-11-01

（当日已发布版本：v1.2.2 / v1.3.0 / v1.3.1 / v1.3.3 / v1.3.4；v1.3.2 因仓库迁移未发布）

- feat(update): 「启动时检查更新」改为**默认开启**（可在插件设置关闭）；启动时向 npm registry 查询一次 latest 版本号，不携带凭据 / 账号 / 用量，失败只记录错误、不阻塞启动
- feat(ui): 详情弹窗（统计首页）右下角的**插件版本处**显示更新状态——有新版本时显示「有新版本 vX」并可点击打开 npm；无新版本时显示「已是最新版本」；检查失败或关闭检查时不显示
- feat(update): 供应商管理页「插件设置 → 更新检查」保留开关、隐私提示、状态行（尚未检查 / 正在检查 / 已是最新 / 发现新版本 / 检查失败可重试）与「立即检查」；并发检查单飞，仅在开关关→开时补查
- feat(wire): `hello` / `providers` 携带 `update`（`UpdateInfo`）与 `updatePackageUrl`；`settings.updateCheck` 默认 `true`；新增 bridge action `updateCheck`（Agent 工具同步支持）
- fix(workspaces): 修复「工作区悬浮卡片不显示 Token 明细」——Host 裁剪本地路径时把 `path` 误删成空串，默认工作区等「界面标题 ≠ 统计标签」的场景匹配失败；现只下发文件夹名 basename，客户端标题匹配大小写不敏感并兼容旧 Host
- chore(repo): 仓库迁移到 **senyingxidi/dsh-tokenlens**（原作者账号改名）；同步更新 `package.json` 的 repository/homepage/bugs、README 徽章与 7 张截图、`market/index.json`、CONTRIBUTING / SECURITY / CODE_OF_CONDUCT / Issue 模板与 LICENSE 署名；旧 GitHub 地址会 301 重定向，旧市场索引 raw 地址继续可用
- fix(ui): 插件版本处自愈——页面在插件更新前加载时，`hello` 的旧版本号不再覆盖新的 Host 版本（取 hello / providers / 更新检查 `current` 中最新的版本），无需刷新页面即可显示正确版本
- docs: README 增加「用 `link:` 安装的插件不要从插件市场重复安装/升级」的 Windows pnpm EPERM 排错说明；CHANGELOG 改为按发布日合并
- test(ci): 修复 Windows CI 偶发失败——倒计时测试 fixture 增加 30 秒余量，慢机器上「2 小时 30 分后重置」不再跨成 29 分（CI #26 / #28 的偶发红均属这类跨分钟/小时边界）
- 测试：280 个自动化用例（版本比较/检查/并发、设置开关、状态行、图表下钻与窗口、工作区 wire 回归）

## 1.2.1 — 2026-10-31

（当日已发布版本：v1.2.0 / v1.2.1）

- feat(chart): 图表模式点击某一天的柱子可下钻查看**当天 24 小时**的 Token 消耗（横轴 00:00–23:00，悬浮显示小时与占比，回车/空格可操作，返回或再次点击回到日趋势）
- feat(chart): 小时数据覆盖全部 5 个本机 harness（DSH、ZCode、OpenCode CLI、WorkBuddy、Qoder）；无小时数据的旧日期不可下钻，不伪造全零序列
- feat(chart): 明细三张环形图（按 Harness / 按供应商 / Top 模型）支持 **今日 / 最近7天 / 最近X天（或最近30天）/ 总计** 窗口切换，默认总计，缺失窗口自动隐藏
- feat(settings): 明细窗口选择持久化到插件设置——点击 pill 立即保存，重开弹窗、切换供应商或重启 DSH 后仍保留，窗口不可用时回落到总计
- feat(wire): `stats.daily[]` 新增 `hours` 与 `providers[pid].hours`（24 个本地小时 Token 整数）；`settings.detailsWindow`
- 修复：请求进行中连续点击窗口只保留最后一次选择（单定时器 200ms 重试）；「恢复默认设置」同时把窗口重置为总计
- 测试：250 → 255（小时聚合、外部 harness 小时分组、下钻交互、窗口切换与持久化回归）

## 1.1.0 — 2026-10-30

- feat(providers): 接入 Open Design（OpenDesign）只读额度查询——Design Plan 的 5 小时 / 7 天窗口已用百分比与重置时间，以及独立的钱包 USD 余额
- feat(providers): Open Design 使用工作区 `workspaceId` + Control Key（`OPENDESIGN_CONTROL_KEY` / `VELA_CONTROL_KEY`）鉴权；推理 API Key 不能查询计费接口
- feat(ui): `windows` 快照可附带钱包余额——详情弹窗在额度窗口下方多一行「账户余额」，chip 悬浮提示追加金额
- docs: 中英 README 与 PROTOCOL 补充 Open Design；说明其余仅元数据供应商没有可用 API Key 查询的公开用量接口（千问/百炼额度仅官方 CLI 可查，腾讯混元/百度千帆只有云账户余额 API）

## 1.0.9 — 2026-10-29

（当日已发布版本：v1.0.3 / v1.0.4 / v1.0.5 / v1.0.6 / v1.0.7 / v1.0.8 / v1.0.9）

- feat(market): 提供 DSH 插件市场索引（`market/index.json` + icon）并支持发布后自动同步；README 增加从 DSH 市场安装的说明
- feat: 插件市场元数据（`dsh-plugin` 关键词、`engines.dsh`）与 GitHub 源安装说明
- fix(stats): 逐帧解压 zstd，兼容 Node >= 24.22（尾部撕裂帧不再拖垮整份日志，修复 CI 三平台失败）
- fix(market): 发布后等待 npm registry 同步再写索引（自动重试，`PUBLISH_TIMESTAMP` 回退）；补录历史版本到索引
- ci: 发布改用 npm Trusted Publishing（OIDC），不再依赖仓库令牌；GitHub Actions 升级到 v7
- docs: 归并 1.0.0 之前版本历史并修订文档措辞

## 1.0.2 — 2026-10-28

（当日已发布版本：v1.0.0 / v1.0.1 / v1.0.2）

- fix(security+privacy): 安全 / 隐私审计加固——OpenCode key 作用域、工作区徽标观察器循环、缓存 canonical、统计路径与自由文本脱敏、baseURL HTTPS 校验、effective-day 全历史、原型污染防护、WorkBuddy 去重、0600 原子写、DST 窗口、控制台链接、管理页滚动；截图脱敏（账号 / 本机路径）
- fix(privacy): 状态文件 / 诊断 / 管理页路径脱敏（`~`）、状态文件 0600、网络错误 URL 去凭据 / 查询串；测试 fixture 与公开文档去除个人邮箱
- 首个公开版本（v1.0.0）：插件定名 **dsh-TokenLens · 词元透镜**，包名与内部标识统一为 `dsh-tokenlens` / `tokenlens`，以 MIT 许可开源；本版本合并了此前 0.1.0–0.36.3 的全部开发历史：
  - **供应商与套餐容量**：OpenCode（Go 套餐窗口）、Command Code、DeepSeek / DeepSeek Account、OpenRouter、Moonshot / Kimi、SiliconFlow、StepFun、Novita、Hyperbolic、DeepInfra、Z.ai GLM、MiniMax、智谱国内版、火山引擎 Coding / Agent Plan；内置 25 家供应商元数据池；按 DSH 模型设置自动发现路由并继承凭据
  - **本机 Token 统计**：接入 5 个 harness（DSH、ZCode、OpenCode CLI、WorkBuddy / CodeBuddy CLI、Qoder CN CLI）；跨 harness 按供应商合并；窗口 今日 / 最近 7 天 / 最近 30 天 / 总计 与订阅供应商「最近 X 天」、滚动 5 小时；按 Harness / 供应商 / Top 模型 / 工作区拆分
  - **界面**：输入框下方用量 chip（跟随当前供应商）与详情弹窗（套餐容量 vs 本机 Token 分区）、数据 / 图表两种模式、供应商管理页与插件设置页
  - **工程**：Host ↔ Client bridge 协议 v3、`planUsage` 服务、`tokenlens_usage` Agent 工具、配置覆盖、统计缓存、诊断与状态文件、231 个自动化测试、零运行时依赖、Node ≥ 24
