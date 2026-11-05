# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/)：修复 = PATCH，新功能 = MINOR，不兼容变更 = MAJOR。发布时同步更新 `package.json` 的 `version`、`index.js` 的 `PLUGIN_VERSION` 与本文件（`node scripts/bump-version.mjs <version> "<note>"`）。

**版本记录约定**：同一发布日只保留一个章节，标题取当日**最后一个**已发布版本号；当日多次发布的改动合并到该章节，并在标题下注明当日实际发布过的版本号（npm 上仍可安装这些独立版本）。若当日已有发布，后续小改动不再单独增加版本号，而是并入下一篇日志。这样日志按天规整、不出现同日多个小版本。

## 1.7.1 — 2026-11-06

（当日已发布版本：v1.6.5 / v1.6.6 / v1.6.7 / v1.7.0 / v1.7.1）

- **fix(ui): 未最大化窗口时芯片悬停导致整个对话区闪烁**——`Tooltip` 的气泡锚在芯片右缘，窗口变窄时会溢出 dock，撑出**对话区底部的横向滚动条**；滚动条又挤压布局、导致 hover 被反复触发，于是整片区域持续重绘。芯片改用**原生 `title`**：不产生任何 DOM，不可能影响布局。v1.7.0 只去掉原生 `title` 保留 Tooltip，方向反了——真正的成因是 Tooltip 本身
- **feat(ui): TPS 趋势图由柱状改为曲线**——速率是连续量，折线比逐日立柱更易读。改为单条 `polyline` 曲线 + 淡色面积填充；每天一个透明命中列承载 `title`，鼠标移上去显示「日期 · 速率（输出 ÷ 耗时）」
- fix(ui): **TPS 卡片宽度与「明细」卡片一致**（`flex: 1 1 100%`）——此前它没有 flex 规则，宽度收缩到内容宽
- 测试：363 → 364（芯片不再包 Tooltip、标题为原生字符串、速度卡片满宽、曲线为 polyline+area 且不填充线体、透明命中列携带日期与速率）

## 1.7.0 — 2026-11-06

（当日已发布版本：v1.6.5 / v1.6.6 / v1.6.7 / v1.7.0）

- **fix(ui): 弹窗改为 portal 到 `<body>`，恢复视口居中**——DSH 0.2.2-rc.1 里 `conversation.input.overlay` 槽位的祖先建立了包含块（transform / filter / contain），`position: fixed` 因此相对「对话区」解析，弹窗只能贴在对话区底部。改用 `react-dom` 的 `createPortal` 挂到 `document.body`，彻底脱离该祖先链。`react-dom` 缺失时（含 Node 测试环境）自动回退为原地渲染，绝不抛错
- **fix(ui): 芯片悬停不再让整个对话区闪烁**（v1.7.1 进一步修正为改用原生 `title`）——v1.7.0 曾移除冗余的原生 `title` 并保留平台 `Tooltip`，但窄窗口下成因其实是 Tooltip 气泡溢出
- **feat(ui): 新增「输出速度（TPS）」趋势图**，位于明细下方、独占整行——输出 Token ÷ 模型自身耗时（`step/start` → `assistant/message`）。工具调用发生在消息之后，因此等待时间不被计入；输出 Token 含思考 Token，弹窗提示已说明
- feat(stats): Host 侧新增 `speed` 序列（顶层为全 Harness 合计，每个 provider 行另有自己的序列，跟随作用域切换）；按天聚合 `{day, outputTokens, seconds, tps, steps}`，无正耗时的日期直接跳过而不是给出无限速率。缓存 schema 升至 6，首次会重扫
- **fix(stats): 「最近X天」封顶 30 天**——此前 provider 首次出现超过 30 天时会报「最近90天」，而同期所有其他数字与图表都只覆盖 30 天。现在 `effectiveDays` 封顶 30，且 `sinceEffective` 在超窗时改用 30 天桶，保证**标签与数字描述同一区间**；`daily` 序列尾部由 120 天收敛为 30 天
- 测试：357 → 363（TPS 配对与未配对步骤跳过、零耗时日期跳过、provider 作用域序列、30 天封顶与标签/数据一致、弹窗 portal 与无 react-dom 回退、TPS 图表与空态）

## 1.7.0 之前的同日版本见下方各节

## 1.6.7 — 2026-11-05

（当日已发布版本：v1.6.5 / v1.6.6 / v1.6.7）

- **fix(commandcode): 用实时窗口用量校正滞后的 `usage summary`**——`/alpha/usage/summary` 是聚合接口，比滚动窗口**滞后几美分**（实测 summary `$1.1248` vs 实时 `$1.2802`），直接拿它反推会让额度偏小、百分比偏低约 0.2 个百分点。现在取「summary 与实时窗口用量」中的**最大值**作为本期消费下界——summary 提供锚点，实时窗口只会把估计值推向真值。实测修正后月额度精确回到 **$70.00**、百分比 `1.85%`，与该平台控制台一致
- fix(commandcode): **仅在 summary 存在时才用窗口用量校正**——没有 summary 就没有锚点，此时周窗口可能并不覆盖整个账期，用它反推会把额度放大、百分比压向 0，因此该情况仍保持 `null`

### v1.6.6 同日内容

- **feat(commandcode): 补上月用量百分比**——该平台付费套餐**不下发** `monthlyCreditsGranted`（额度分母），此前月窗口只能是 `unknown`。现在同时读 `GET /alpha/usage/summary`（控制台自己用的那个接口），用两个字段反推额度：`grant = credits.monthlyCredits（余额）+ totalMonthlyCredits（本期消费）`。实测 `69.1272003646 + 0.8727996354 = 70.0000000000`（多时点复核均精确 70），与控制台前端内置的 `totalCredits: 70` 一致
- feat(commandcode): 月窗口因此同时具备**已用 / 额度 / 百分比 / 重置时间**（`$0.99 / $70.00 · 1.4%`），与 5 小时、每周两个窗口口径一致
- **fix(commandcode): 不再把 `windowLimits.limited` 当作告警状态**——它是「本套餐带滚动窗口限制」的**能力标志**，同层另有 `exceeded`。原来映射成 `status: "limited"`，而客户端把任何非 `ok` 状态渲染为告警，导致用量仅 6% 时三个窗口全被涂成红色。现在只有各窗口 `exceeded === true` 才置为非 `ok`，其余按百分比自身分级
- feat(commandcode): 套餐名映射补全 `individual-goat → GOAT`、`individual-pro/v1 → Pro`、`individual-max → Max`、`individual-ultra → Ultra`（此前 GOAT 直接显示原始 id）
- **口径说明**：月额度分母**不随所选模型变化**。GOAT 宣传「Up to $100」并给出按模型额度（DeepSeek V4.1 Flash 为 $100），那是同一份额度在折价模型上的「等效可用金额」，额度池始终是 `totalCredits: 70` 这一个数。若让分母跟随所选模型，切换模型时百分比会跳动而账户并未变化，故按固定池计算
- 测试：352 → 355（月额度反推、分母不随模型变化、已上报额度优先于反推、`limited` 是能力标志而非状态、月窗口渲染与配色）

### v1.6.5 同日内容（修复 GitHub issue #1）

- **fix(ui): 没有额度适配器的供应商不再隐藏芯片**——`unsupported-provider` 按协议会静默隐藏芯片，但芯片同时是**本机 Token 统计的唯一入口**，于是「有数据却永远看不到」：选中 `xiaomi-token-plan-cn` 时 `usage-cache.json` 里躺着 3.19 亿 Token 却无处可查（issue #1 的核心投诉）。现在这类供应商保留一个「**仅本机统计**」芯片（圆点为正常态而非告警），点开即见统计区——统计区本就不依赖快照
- **feat(providers): 新增小米 MiMo「Token Plan」额度适配器**（`xiaomi-token-plan-cn` / `-ams` / `-sgp` 三个区域）——额度接口在控制台域 `platform.xiaomimimo.com`：`/api/v1/tokenPlan/usage`（`plan_total_token` 与 `monthUsage`）、`/api/v1/tokenPlan/detail`（`planCode`、`currentPeriodEnd`）、`/api/v1/balance`（人民币余额）
- feat(providers): **该接口只认控制台 Cookie**，推理 Key（`tp-…`）一律 401 + `loginUrl`。插件复用 Open Design 那套「写一次、永不回显」的密码输入位来存 Cookie，文案明确告知「推理 Key 读不到额度接口」与「Cookie 约 24 小时过期」
- feat(providers): 会话过期映射为 `unauthorized`（不可重试）并给出可操作指引；未配置 Cookie 时**不发任何网络请求**，直接 `missing-key`
- feat(providers): 同日多条 `plan_total_token` 共享同一份额度时只计一次（避免把额度翻倍），用量按条累加；无法识别的报文降级为 `parse` 并回显**实际看到的字段名**便于排查
- feat(providers): 月度窗口优先取 `monthUsage`，`resetsAt` 取 `currentPeriodEnd`，**绝不凭空编造 5 小时/周窗口**；余额读取失败只影响余额本身，不影响额度
- 测试：336 → 352（Cookie 归一化含多行注入折叠、信封解析、共享额度不翻倍、401/`loginUrl` 双路识别、缺 Cookie 零请求、未知报文降级、控制台 Cookie 输入框渲染与写一次、无适配器芯片可见且统计区可达）
- **实测确认**（本机 2026-11-05）：三个端点均真实存在（非 404），匿名请求返回文档记载的 `{"code":401,"loginUrl":…}`，适配器正确映射为可操作指引。**成功响应的字段解析无法实测**（本机无小米账号），仅按两份独立实现（OmniRoute #14834、CodexBar `docs/mimo.md`）转录

## 1.6.4 — 2026-11-04

（当日已发布版本：v1.6.2 / v1.6.4。v1.6.1 的混合模型修复未单独发版，已并入本节）

- **fix(open-design): 「本期 Design Plan 累计」改为只统计 Design Plan 额度消耗，排除钱包余额付费**——钱包扣费不消耗 credits（只扣 `balanceUsd`），所以改由**服务端 credits 反推**金额：`usedCredits ÷ creditsPerUsd ÷ 倍率`。实测 150,005 credits ÷ 10,000 ÷ 0.5 = **$30.00**，与「周额度 $30 × 已用比例」交叉验证一致（$30 × 100% = $30.00）。此前按本机 Token × 单价计价，会把钱包付费的调用也算进去，导致两个口径混淆
- feat(open-design): 新增 `localPricedUsd`（含钱包付费的本机估算）单独保留；当它高于 Design Plan 金额时，弹窗追加「另有 $X 由账户余额支付，未计入」，两个口径都清楚可查
- **fix(ui): 图表模式日期标签对不齐柱子**——原来把第一个标签钉在左边缘、最后一个钉在右边缘，而柱子是等分 flex 单元格居中的：只有 3 天数据时第一个标签在 0% 而柱子中心在 16.7%，标签整体漂移。改为每个标签居中于**自己那根柱子**的正下方（`(i+0.5)/n`），并放开 x 轴 `overflow` 让边缘标签不被裁掉
- 测试：332 → 335（Design Plan 金额来自 credits 且低于含钱包的本机估算、无倍率时回退到 credits 面值、3 根柱时标签中心为 16.7%/50%/83.3% 且不贴边）

## 1.6.2 — 2026-11-04

（当日已发布版本：v1.6.2。v1.6.1 的混合模型修复未单独发版，已并入本节）

- **fix(open-design): 混合模型按 credits 加权取额度，不再取最高倍率**——原实现取「用过的最高倍率」当口径，实测 0.5× 与 4× 各占一半 credits 时会把月额度报成 $15（正确应为 **$67.50**），严重低估。现改为按实际消耗加权的调和平均：`m_eff = Σcredits / Σ(credits/m)`，`月额度 = $60 / m_eff`。90% credits 走 0.5× 时是 **$97.89**，99% 时 **$117.92**，偶尔用一次 4× 模型不再摧毁额度
- fix(open-design): 单一模型时加权公式**精确退化**为官方表格值（0.5×→$120、1×→$60、2×→$30、4×→$15），纯模型场景不受影响
- fix(open-design): 无消费权重（仅知道模型列表）时回退到最高倍率，即保守口径（承诺最少剩余额度）
- **fix(open-design): 未收录价格的模型不再静默少算金额**——`unpricedModels` 此前算出来却没有用上，含未知模型时金额会**偏低却不提示**。现在置 `partial: true`，弹窗显示「含未收录价格的模型，金额为下限」，绝不把下限当完整值
- 测试：328 → 332（切换模型时金额与额度反向变化、未收录模型使金额成为下限、加权混合三种比例、单一模型退化、无权重回退最高倍率）
- 备注：`600,000 credits/月` 是插件由「7 天窗口上限 × 4」推算的值（官方定价表月/周 = $120/$30 = 4），**不是服务端字段**；服务端只返回 5 小时 50,000 与 7 天 150,000 两个窗口

## 1.6.0 — 2026-11-03

- **feat(open-design): 「本期 Design Plan 累计」改按官方定价表的模型单价计算**——原来是 `usedCredits ÷ creditsPerUsd`，这个算法隐含「按 1× 倍率消耗」的假设，而官方倍率表跨度 0.25×–4×：对 DeepSeek V4.1 Flash（0.5×）会**少算一半**，对 GPT-6 Luna（4×）会**多算 4 倍**。现在按每个模型的实际 Token × 官方单价（输入/输出/缓存读分别计价）累加，结果可直接与定价表比对
- **feat(open-design): 给出与倍率匹配的月额度**——定价表里 $120 是**列表价**口径且按倍率消耗：只用 0.5× 模型（DeepSeek V4.1 Flash）可动用**完整 $120**，1× 用 $60，2× 用 $30，4× 用 $15。弹窗改为显示「**已用 / 月额度 + 百分比**」（如 `$27.31 / $120.00  22.8%`），并注明「按 0.5× 倍率模型计价」
- feat(open-design): 混合模型取额度口径（v1.6.2 修正为按 credits 加权，不再是最高倍率）
- feat(wire): `designPlan` 新增 `monthlyCapUsd` / `capPercent` / `multiplier` / `creditsUsd`；`estimatedUsd` 语义改为「官方单价口径的消费额」，旧算法结果保留在 `creditsUsd` 便于对照
- feat(stats): `models[].last30Days` 增加 `input` / `output` / `cacheRead` / `cacheWrite` 拆分，供按单价计价使用（此前只有 total）
- fix(open-design): 单价表按官方文档转录 13 个 Design Plan 模型；`hunyuan-h4-preview` / `glm-5.3-flash-x` 不在公开价目接口里，价格缺失时按「未定价」处理并如实上报，绝不臆造
- 测试：318 → 328（倍率阶梯 0.5×→$120 / 1×→$60 / 2×→$30 / 4×→$15、未知模型不臆造倍率与额度、按 token 种类计价、**用控制台真实账单核对：$0.0048 列表价 × 0.5 = $0.0024 实扣**、未定价模型上报）

## 1.5.3 — 2026-11-03

- **feat(open-design): 初次配置只需一个 Control Key**——工作区 ID 改为**可选**。Control Key 本身就能确定它属于哪个工作区，插件改用 `GET /api/v1/workspaces/current` 自动识别（回退 `GET /api/v1/workspaces`，仅当可见工作区恰好一个时采纳）
- feat(open-design): **多工作区不猜**——`/workspaces/current` 没有 active 且有多个可见工作区时返回 `missing-key` 并提示手动填写「工作区 ID」，因为猜错会把别的团队的用量当成自己的
- feat(open-design): 显式配置的工作区 ID 优先于自动识别（管理页 / `providers.open-design.workspaceId` / `OPENDESIGN_WORKSPACE_ID`），多工作区账号据此指定目标
- feat(ui): 管理页「工作区 ID」文案改为可选，说明留空即自动识别、仅在多工作区时需要填
- 测试：317 → 318（仅凭 Key 自动识别工作区并用于后续所有计费读取、多工作区拒绝猜测）

## 1.5.2 — 2026-11-02

（当日已发布版本：v1.3.5 / v1.3.6 / v1.3.7 / v1.3.8 / v1.3.9 / v1.4.0 / v1.5.0 / v1.5.1 / v1.5.2）

- **fix(open-design): 窗口重置后「已消耗」不归零**——Design Plan 的窗口是**锚定**的（从订阅时间起算，每 5 小时 / 7 天翻篇），但弹窗一直按「最近 5 小时 / 最近 7 天」从本机日志切片，两者根本不是同一区间。于是 5 小时窗口重置后仍把上一轮的量算进来，`已消耗` 居高不下、`预计可消耗` 被放大（实测 96.4% → 7.3% 时估算从 766M 暴涨到 10.1B）
- **fix(open-design): 7 天窗口存在同一问题**——已一并修复，不是只修 5 小时
- fix(wire): 窗口对象新增 `startedAt`（上游 `windowStart`），客户端据此按窗口真实 `[startedAt, resetsAt)` 区间累加本机每小时 Token，只统计完整落在区间内的小时；窗口边界落在整点内时不计该小时，宁可少算也不按比例猜
- fix(ui): 无法确定窗口区间时才回退到原来的滚动桶（旧 Host 没下发 `startedAt`），因此旧版本 Host 仍能工作，不会显示空白
- 测试：314 → 317（5h 重置后只统计新窗口的回归测试、7d 中途重置的锚点切片、Host 下发 `startedAt`）

## 1.5.1 — 2026-11-02

（当日已发布版本：v1.3.5 / v1.3.6 / v1.3.7 / v1.3.8 / v1.3.9 / v1.4.0 / v1.5.0 / v1.5.1）

- **feat(open-design): chip 直接显示月用量%**——官方没有月窗口，但**月度额度是 4 × 7 天窗口**（定价表全档位一致：Go $120 vs $30、Plus $160 vs $40、Pro $360 vs $90、Max $600 vs $150）。Host 据此把周期估算填进 `windows.monthly`，chip 沿用现有「月 N%」槽位显示，无需第二套 UI
- feat(open-design): `designPlan` 增加 `periodLimitCredits`（= 周上限 × 4）与 `percent`；`limitPerWindow` 用账号**实测**上限而非公开价目表（本机 Go 实为 5h $5 / 7d $15，只有官方标价的一半），避免百分比整体偏大
- fix(open-design): **部分覆盖的估算不冒充完整值**——`complete: false` 时月窗口 `status` 置为 `unknown`，百分比仍显示但**永不触发黄色/红色告警**，避免把下限当满额报警
- feat(open-design): 月窗口的重置时间取账期结束（`subscriptionCurrentPeriodEnd`），与 5 小时 / 7 天窗口的倒计时并列显示
- 测试：307 → 314（月额度 = 4 × 周窗口、31 天账期 5 个窗口时封顶 100%、无周上限时不臆造百分比、部分覆盖状态为 unknown、Host 推导月度窗口与 designPlan 一致、chip 显示「月 8.8%」）

## 1.5.0 — 2026-11-02

（当日已发布版本：v1.3.5 / v1.3.6 / v1.3.7 / v1.3.8 / v1.3.9 / v1.4.0 / v1.5.0）

- **feat(open-design): 本机累加 Design Plan 周期用量估算**——Open Design 只提供滚动的 5 小时 / 7 天窗口，**没有「本账期已用」接口**（控制台的 `/billing/usage`、`/billing/coding-plan-usage` 都是 cookie 会话鉴权，Control Key 一律 401）。插件改为累加它观测到的 7 天窗口：每个窗口实例记录历史最大 `usedCredits`，把同一账期内已完成 + 当前的窗口相加，再按 `creditsPerUsd` 折算成美元
- feat(open-design): **只统计 7 天窗口**——5 小时窗口测量的是同一笔消耗（实测两者 `usedCredits` 完全相同），相加会双重计数
- feat(open-design): 估算带**覆盖率标注**——`complete: true` 仅当最早观测到的窗口起点等于账期起点；否则显示「仅统计已观测的 N 个窗口」，绝不把下限当完整值
- feat(wire): snapshot 升到 v4，新增可选 `designPlan: {periodStart, periodEnd, usedCredits, estimatedUsd, windows, complete, since, limitPerWindow}`（仅 open-design）；原始上游窗口行不下发
- feat(storage): 新增 `$DSH_HOME/dsh-tokenlens/design-plan-ledger.json`（原子写、0600、仅数字与时间戳、保留 6 个账期）；写入失败只降级为内存折叠，绝不影响用量读取
- feat(ui): 容量卡片新增一行「本期 Design Plan 累计 $X（≈ N 个周额度 · 已覆盖本账期全部窗口 / 仅统计已观测的 N 个窗口）」，悬浮说明「Open Design 没有月度用量接口，此值由本机累加观测得出，仅供参考」
- feat(config): `designPlanLedgerFile` 可配置（空 = 默认路径）
- 测试：292 → 307（ledger 单测 10 个：只记周窗口不双计、同窗口取最大值、跨窗口累加、完整性判定、账期切换清零、磁盘往返与历史上限；Host 端到端：三次读累积与瞬时回落不降值、原始行不下发、写入失败仍出估算；客户端：完整/部分两种覆盖率渲染、其它供应商不渲染该行）

## 1.4.0 — 2026-11-02

（当日已发布版本：v1.3.5 / v1.3.6 / v1.3.7 / v1.3.8 / v1.3.9 / v1.4.0）

- feat(ui): 供应商管理页可为 **Open Design** 填写「工作区 ID」并持久化到插件配置——此前 workspaceId 只能在 profile patch 或 `OPENDESIGN_WORKSPACE_ID` 里设置，用推理 Key 配好供应商后额度卡片仍报错却无处可改
- feat(ui): **Control Key 也能在弹窗里直接填**——Open Design 卡片新增密码型输入框，粘贴保存即写入插件自己的 store；输入框是只写的（Host 只回 `hasKey` / `keySource`，secret 永不下发浏览器），保存成功后自动清空并改用「已保存；要替换请重新粘贴」占位提示。小白用户不再需要手改 `.credentials.yaml`
- feat(ui): 「工作区 ID」输入框支持**直接粘贴整条控制台地址**——`https://open-design.ai/cloud/dashboard?workspaceId=ws_x&tab=billing` 会自动提取出 `ws_x`，避免用户复制整条 URL 后被校验拒绝
- **fix(open-design): 修掉「配好了仍报错」**——额度窗口原来只查 `billing/coding-plan-usage`，而那条路由由控制台的浏览器 Cookie 会话鉴权，**任何 Control Key 都会被 401**（控制台前端自己也走 cookie）。现在改用**同样接受 Control Key** 的 `billing/funding-check`，Design Plan 的 5 小时 / 7 天窗口正常读出
- fix(open-design): 改为钱包、窗口、套餐三层**互相独立降级**——先读 `wallet/balance`（余额）与 `billing/summary`（套餐档位，如 GO / PLUS），窗口再由 funding-check 补齐；任一路由不可用只少一块数据，不再整条报错。旧版会把 quota 的 401 当成整体失败，导致钱包也读不到
- feat(wire): `billing/summary` 的 `membershipTier` 映射为 `plan`（`GO` / `PLUS` / `PRO` / `MAX`），弹窗标题行显示「套餐：GO」
- feat(ui): Open Design 额度失败时的引导——详情弹窗的错误条说明「额度查询需要工作区 ID 与 Control Key（不是推理 Key）」，并提供「去配置」按钮直接跳到供应商管理页
- feat(host): Host 侧错误文案更具体（区分缺 workspaceId / 缺 Control Key，并指向管理页）；`providerUpdate` 接受 `workspaceId`，校验为 1–120 位标识符字符（字母、数字、`. _ : @ -`），路径穿越/空格/超长一律拒绝
- feat(wire): `providers[]` 仅对声明了 workspace 的适配器（Open Design）下发 `workspaceId` 字段；其余供应商不下发，客户端据此决定是否渲染输入框（旧 Host 无此字段 ⇒ 不渲染，自然降级）
- feat(ui): Open Design 缺配置时 chip 不再按 `missing-key` 静默隐藏，而是显示「待配置」并可点进详情看引导——否则用户既看不到提示也没有入口
- fix(tool): Agent 工具 `tokenlens_usage` 的 `updateCheck` 动作此前虽在枚举里却会落到用量读取分支，返回当前供应商的用量或错误；现在正确执行更新检查并返回 `UpdateInfo`
- docs: 中英 README 补充 **workspace ID 与 Control Key 到底在哪里取**——控制台的「套餐与余额」页没有独立的 ID 字段，workspace ID 取自地址栏的 `?workspaceId=`（成员邀请预览页也会显示「工作空间 ID」），而 `~/.amr/config.json` 只存 `controlKey` / `runtimeKey` / `apiUrl` / `linkUrl`、不含 workspace ID；Control Key 是桌面端 / `vela login` 写入该文件的 `profiles.prod.controlKey`，用推理 Key 冒充会得到 401
- 测试：280 → 292（workspace ID 校验/持久化/清空与 URL 提取、Control Key 只写保存与不回声、funding-check 嵌套文档解析、窗口不可用时的钱包降级、summary 缺失时不臆造档位、待配置 chip、工具 updateCheck 分发）

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
