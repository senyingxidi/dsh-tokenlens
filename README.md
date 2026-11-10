# dsh-TokenLens · 词元透镜

[English](README.en.md) · **简体中文**

[![npm version](https://img.shields.io/npm/v/dsh-tokenlens.svg)](https://www.npmjs.com/package/dsh-tokenlens)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/senyingxidi/dsh-tokenlens/actions/workflows/ci.yml/badge.svg)](https://github.com/senyingxidi/dsh-tokenlens/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](package.json)

> **一眼看清你的用量**：在 DSH 输入框下方显示当前供应商的套餐容量，并汇总本机跨 Harness 的 Token 消耗。

**dsh-TokenLens（词元透镜）** 是 DSH（DeepSeek Harness）的用量插件（v1.3.4，公开版本）。它把两类数字**按不同口径**分开呈现：

- **套餐容量**（供应商服务端权威值）：百分比窗口、`已用 / 上限`、账户余额或剩余额度；
- **本机 Token 统计**（本机记录）：当前供应商在本机所有已接入 Harness 上的合计用量，也可切到「全部 Harness」看总账。

插件零运行时 npm 依赖，不需要外部数据库或云服务；所有统计都在本机完成。

## 目录

- [功能概览](#功能概览)
- [效果截图](#效果截图)
- [安装](#安装)
- [凭据](#凭据)
- [配置参考](#配置参考)
- [支持的供应商](#支持的供应商)
- [本机 Token 统计](#本机-token-统计)
- [架构](#架构)
- [Agent 工具](#agent-工具)
- [隐私与安全](#隐私与安全)
- [已知限制](#已知限制)
- [验证](#验证)
- [开发与贡献](#开发与贡献)
- [许可](#许可)

## 功能概览

- **用量 chip（输入框下方）**：跟随当前选中的模型供应商，显示该供应商的套餐容量（百分比窗口 / 美元额度 / 余额）；没有适配器或未配置凭据的供应商静默隐藏。
- **详情弹窗**（点击 chip 打开）：
  - **套餐容量**：5 小时 / 本周 / 本月等原生窗口的已用百分比、重置时间与绝对重置日期；余额类供应商显示余额。每个窗口附带一行 `已消耗 · 预计可消耗` 估算（由本机 Token 记录 ÷ 套餐百分比推算，仅供参考）。
  - **本机 Token 统计**：今日 / 最近 7 天 / 最近 30 天 / 总计（订阅类供应商显示「最近 X 天」生效窗口），可按「当前供应商 · 全部 Harness」与「全部 Harness」两个视角查看。
  - **明细与图表**：按 Harness、按供应商、Top 模型、未映射供应商分组；支持「数据」（表格）与「图表」两种模式切换。图表模式里点击某一天的柱子可下钻查看**当天 24 小时**的 Token 消耗，底部「明细」环形图支持 **今日 / 最近 7 天 / 最近 X 天（或最近 30 天）/ 总计** 窗口切换。
  - **工作区徽标**（实验性）：左侧工作区列表的名称旁显示该工作区的本机 Token 合计，悬浮卡片显示今日 / 7 天 / 30 天 / 总计；纯展示，找不到对应 UI 时自动降级。
- **供应商管理页**：「已配置 / 内置 / 全部」筛选、启用开关、凭据状态、控制台链接、短标签与全名编辑、测试连接、已订阅徽章；Open Design 额外提供「工作区 ID」输入（v1.3.5）；另有「插件设置」可配置标签样式、默认展示模式、默认统计范围、明细展开状态、图表「明细」环形图的默认窗口（今日 / 最近 7 天 / 最近 X 天 / 总计，记住上次选择）与「启动时检查更新」（默认开启，可关闭，也可手动立即检查）。
- **自动识别**：在 DSH「设置 → 模型服务」中配置过的供应商会自动出现在管理页，并按路由 id 或 baseURL 主机匹配内置用量适配器，自动继承 DSH 中的凭据，无需重复填写。
- **Agent 工具**：注册 `tokenlens_usage`，模型可以自行查询套餐容量与本机用量。

支持 5 个 Harness：**DSH、ZCode、OpenCode CLI、WorkBuddy / CodeBuddy CLI、Qoder CN CLI**；内置 28 家供应商元数据，其中 19 家带套餐 / 余额适配器。

## 效果截图

> 截图取自作者本机（DSH Desktop，深色主题），数值为真实统计结果；实际显示随所选供应商、窗口与主题变化。

### 输入框下方的用量 chip

![输入框下方的用量 chip](https://raw.githubusercontent.com/senyingxidi/dsh-tokenlens/main/docs/images/composer-chip.png)

### 工作区 Token 徽标与悬浮统计

![工作区 Token 徽标与悬浮统计](https://raw.githubusercontent.com/senyingxidi/dsh-tokenlens/main/docs/images/workspace-badge-hover.png)

### 用量详情弹窗

| 图表模式 | 数据模式 |
|:---:|:---:|
| ![统计弹窗 · 图表模式](https://raw.githubusercontent.com/senyingxidi/dsh-tokenlens/main/docs/images/stats-chart.png) | ![统计弹窗 · 数据模式](https://raw.githubusercontent.com/senyingxidi/dsh-tokenlens/main/docs/images/stats-data.png) |

### 供应商管理页

| 供应商配置 | 插件设置 |
|:---:|:---:|
| ![供应商配置](https://raw.githubusercontent.com/senyingxidi/dsh-tokenlens/main/docs/images/settings-providers.png) | ![插件设置](https://raw.githubusercontent.com/senyingxidi/dsh-tokenlens/main/docs/images/settings-plugin.png) |

### 内置供应商池

![内置供应商池](https://raw.githubusercontent.com/senyingxidi/dsh-tokenlens/main/docs/images/settings-builtin.png)

## 安装

### 前置条件

- **DSH Desktop**：插件在 DSH 内运行；DSH Desktop 自带 Node.js 24 运行时，无需另外安装 Node。
- **DSH 0.2.1-rc.3 或更新的 0.2.x**（插件声明 `engines.dsh: ">=0.2.1-rc.3 <0.3.0-0"`）。
- 一个可用的 DSH profile（下文的 `<profile>`，常见为 `desktop`）。
- `$DSH_HOME` 默认为 `~/.dsh`（Windows 下即 `%USERPROFILE%\.dsh`）。

| 安装方式 | 适用场景 |
|---|---|
| [方式 A：从 npm 安装](#方式-a从-npm-安装推荐) | 推荐；国内用户可选「中国大陆镜像源」 |
| [方式 B：从 GitHub 安装](#方式-b从-github-安装备用) | npm 不可用时，或想直接跟仓库最新代码 |
| [方式 C：本地源码 link](#方式-c本地开发从源码-link) | 开发者改代码 |
| [方式 D：从 DSH 插件市场安装](#方式-d从-dsh-插件市场安装) | 在 DSH「发现」页浏览/一键安装 |

### 方式 A：从 npm 安装（推荐）

`dsh-tokenlens` 已发布到 npm（最新版见 [npm](https://www.npmjs.com/package/dsh-tokenlens)）；国内网络可在 DSH 的安装源里选择「中国大陆镜像源」。

1. 用 DSH 自带的 `dsh` CLI 安装插件包：

```powershell
dsh plugin --profile <profile> add dsh-tokenlens
```

2. 确认 bundle 已登记。打开 `$DSH_HOME/profiles/<profile>/package.json`，检查 `dsh.profile.bundles` 数组是否包含 `"dsh-tokenlens"`，没有则追加：

```jsonc
{
  "dependencies": {
    "dsh-tokenlens": "^1.3.4"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "…已有的其它插件…",
        "dsh-tokenlens"
      ]
    }
  }
}
```

3. **重启 DSH**，或等待 profile 热重组完成；若界面没有变化，刷新页面或重启应用即可。输入框下方出现用量 chip 即表示安装成功。

> 不同 DSH 版本的 `plugin add` 可能已自动写入 `dependencies` 与 `bundles`；已存在时跳过对应步骤即可。

### 方式 B：从 GitHub 安装（备用）

无法访问 npm（或想直接跟踪仓库最新代码）时，可以用仓库地址安装（需要能访问 GitHub）：

1. DSH → 侧边栏「插件」→「添加插件」；
2. 输入 `https://github.com/senyingxidi/dsh-tokenlens`（或 `github:senyingxidi/dsh-tokenlens`），选择安装源后点「安装」；
3. 安装完成后 DSH 会把它选入 profile 的 `dsh.profile.bundles` 并默认启用；若界面没有变化，重启 DSH。

等价的 CLI 写法（只安装依赖，仍需手动把 `dsh-tokenlens` 加入 `dsh.profile.bundles`）：

```powershell
dsh plugin --profile <profile> add "github:senyingxidi/dsh-tokenlens"
```

> 注意：GitHub 源安装的是**默认分支最新提交**（不是 tag），DSH 不支持原地升级，升级时先卸载再安装。国内网络访问 GitHub 可能不稳定；插件发布到 npm 后建议改用方式 A。

### 方式 C：本地开发（从源码 link）

克隆仓库后，把 profile 的依赖指向本地目录（`link:` 形式，仅开发者使用）：

```powershell
dsh plugin --profile <profile> add "link:<path-to-dsh-tokenlens>"
```

`<path-to-dsh-tokenlens>` 换成你 clone 下来的仓库绝对路径，例如 `link:D:/code/dsh-tokenlens`。等价的 profile `package.json` 写法：

```jsonc
"dependencies": { "dsh-tokenlens": "link:D:/code/dsh-tokenlens" },
"dsh": { "profile": { "bundles": ["…", "dsh-tokenlens"] } }
```

本地开发时，Host 端（`index.js` / `lib/`）改动需要重启或重新加载 profile 才能生效；浏览器端 `client.js` 的改动可能被客户端热替换。

> ⚠️ **不要混用 link 安装与市场安装**：用 `link:` 装好的 profile 里再从市场点「安装/升级」会失败（Windows 下 pnpm 无法用 npm 包覆盖目录链接，报 `EPERM ... rename`）。需要切换时，先卸载 link（退出 DSH 后删除 `profiles/<profile>/node_modules/dsh-tokenlens` 这个链接——junction 请用 `cmd /c rmdir`，不要用 `Remove-Item -Recurse` 以免误删源码——并从 profile 的 `package.json` 删掉 `"dsh-tokenlens": "link:..."` 这一行），再从市场安装。

### 方式 D：从 DSH 插件市场安装

本仓库维护了一份 DSH 插件市场索引（[`market/index.json`](market/index.json)），在 DSH 里添加一次索引源，就能在「发现」页搜索、查看并一键安装：

1. 打开 DSH → 侧边栏「插件」→「实验性插件」旁的「更多」→ 打开 **自定义插件市场**；
2. 「已安装」旁出现 **发现** 标签 → 点 **添加索引源**，粘贴：
   ```
   https://raw.githubusercontent.com/senyingxidi/dsh-tokenlens/main/market/index.json
   ```
3. 在「发现」里搜索 `TokenLens`（或浏览 `dsh-TokenLens` 卡片）→ 安装。

> 索引通过 GitHub raw 分发；无法访问 GitHub 的网络环境请改用[方式 A](#方式-a从-npm-安装推荐)。索引里的版本信息由 release workflow 在每次发布后自动更新。

### 验证安装

- 输入框下方出现用量 chip（未配置凭据的供应商会被隐藏，属正常现象）；
- 点击 chip 能打开详情弹窗，点「管理」能看到供应商管理页；
- 也可以在 DSH 对话中让 Agent 调用 `tokenlens_usage` 查询一次。

### 卸载

```powershell
dsh plugin --profile <profile> remove dsh-tokenlens
```

然后从 profile 的 `dsh.profile.bundles` 中移除 `"dsh-tokenlens"` 并重启 DSH。插件自身数据（管理页覆盖与统计缓存）位于 `$DSH_HOME/dsh-tokenlens/`，如不再使用可一并删除。

## 凭据

插件本身不需要你在 DSH 之外另填一遍 Key：

- 在 DSH「设置 → 模型服务」中配置过的供应商会被自动识别，插件按路由 id 或 baseURL 主机匹配内置适配器，并继承该路由的 `apiKeyEnv` 凭据。
- 也可以直接用环境变量提供，例如 `OPENCODE_GO_API_KEY`、`COMMANDCODE_API_KEY`、`DEEPSEEK_API_KEY`、`MOONSHOT_API_KEY` 等（每家供应商的引用见 `lib/providers.mjs`）。
- 或写入 `$DSH_HOME/.credentials.yaml` 的 `refs:` 映射（与 DSH 凭据服务同一份文档）。
- **Open Design（OpenDesign）** 的额度查询需要 OpenDesign Cloud 的 **workspace ID + Control Key**（`OPENDESIGN_CONTROL_KEY` 或 `VELA_CONTROL_KEY`），**不是** Cloud API Keys 页的推理 Key（推理 Key 只能调用模型）。workspace ID 可直接在[供应商管理页](#供应商管理)的 Open Design 卡片里填写（v1.3.5，保存在插件自己的配置里，重启后仍在），或写在 provider 配置里，或用 `OPENDESIGN_WORKSPACE_ID` 环境变量；Control Key 通过环境变量 / DSH 凭据 / 管理页的 Key 输入框提供。
- 配置不全时，详情弹窗会说明缺哪一项并提供「去配置」按钮，而不是只显示一个笼统的「没有找到该供应商的 API Key」。

### 拿到 Open Design 的 workspace ID 与 Control Key

这两样都**不在** Cloud 控制台的 API Keys 页面（那里只有推理 Key）。具体步骤：

**1. workspace ID**

这个控制台**没有单独一栏显示工作区 ID**（截图里的「套餐与余额」页只有额度、余额、充值），它只出现在两处：

- **地址栏**：在 Cloud 控制台里点进「套餐与余额」或「成员」等任意页面，地址会变成 `open-design.ai/cloud/dashboard?workspaceId=<这一串>`——`workspaceId=` 后面、`&` 之前的整段就是。这是最可靠的取法。
- **成员邀请预览页**：生成一条成员邀请并打开它，确认页会把「工作空间 ID」作为一条信息列出来。
- 装了桌面端的话，本机 `~/.amr/config.json` 只保存 `controlKey` / `runtimeKey` / `apiUrl` / `linkUrl`，**不含** workspace ID，别在这里找。

**2. Control Key**

Control Key 是 **Open Design 桌面端/CLI 登录时写入本机的会话凭据**，不是控制台上可以生成的一串字。它由桌面客户端或 `vela` CLI 在登录后写进 `~/.amr/config.json`：

```jsonc
// ~/.amr/config.json（Windows: C:\Users\<你>\.amr\config.json）
{
  "profiles": {
    "prod": {
      "controlKey": "……",   // ← 这就是额度查询要的 Control Key
      "runtimeKey": "……"
    }
  }
}
```

取得它的方式（任选一种）：

- **桌面端登录一次**：安装并启动 Open Design 桌面端 → 登录 Cloud 账号。客户端完成登录后会在本机写入 `~/.amr/config.json`（同时 CLI 也已就位）。
- **CLI 登录**：在装有 `vela` 命令的机器上执行 `vela login`，按终端提示打开激活链接、在浏览器里确认（"Approve CLI login"），完成后同样写入 `~/.amr/config.json`。
- 已有 `~/.amr/config.json` 的话直接打开取 `profiles.prod.controlKey` 即可。

拿到后两种放法：

- **最简单（推荐给不折腾的用户）**：全部在插件里填——用量弹窗 →「管理」→「供应商配置」→ 展开 **Open Design**：
  - 「工作区 ID」：直接粘贴控制台地址整条也行（`...?workspaceId=xxx` 会自动提取出 ID）；
  - 「Control Key」：粘贴后保存，输入框是密码型、保存后不再显示（Host 只回 `hasKey`，secret 永不下发浏览器）。
  保存后点「测试连接」，出现 5 小时 / 7 天百分比与钱包余额即成功。
- **或写配置文件**：Control Key 写进 `$DSH_HOME/.credentials.yaml` 的 `refs:` 下 `OPENDESIGN_CONTROL_KEY: <control key>`（或环境变量 `OPENDESIGN_CONTROL_KEY` / `VELA_CONTROL_KEY`）；workspace ID 用 `OPENDESIGN_WORKSPACE_ID` 环境变量或 profile 配置。

> 这也解释了最容易踩的坑：**用推理 Key 填 Control Key** 会让额度查询返回 401。插件已经区分这两种凭据，缺哪一项都会指名道姓地提示。

解析顺序（先命中先用）：DSH 凭据服务 → 环境变量 → `$DSH_HOME/.credentials.yaml` → OpenCode CLI 的 `auth.json`（仅默认的 `OPENCODE_GO_API_KEY` 引用）。

凭据只在 Host 进程内解析，**不会**下发到浏览器、**不会**写入日志或诊断输出（诊断只显示来源与引用名，不显示明文）。

## 配置参考

所有配置项均可选。以下示例写在 profile 的 `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 中，用于覆盖默认值：

```yaml
- id: dsh-tokenlens
  name: dsh-tokenlens
  config:
    enabled: true
    defaultProvider: opencode-go        # 浏览器尚未上报选择时的兜底供应商
    minRefreshIntervalMs: 20000         # 快照最短复用时间
    timeoutMs: 15000                    # 单次上游请求超时
    pollIntervalMs: 120000              # 后台轮询间隔（毫秒）；0 = 关闭轮询
    statusFile: ''                      # 诊断状态 JSON 路径；空 = 不写文件
    providerStoreFile: ''               # 空 = $DSH_HOME/dsh-tokenlens/providers.json
    designPlanLedgerFile: ''            # 空 = $DSH_HOME/dsh-tokenlens/design-plan-ledger.json
    stats:
      enabled: true
      ttlMs: 30000                      # 统计结果复用时长；fresh:true 强制重扫
      cacheFile: ''                     # 空 = $DSH_HOME/dsh-tokenlens/usage-cache.json
      dshHome: ''                       # 空 = $DSH_HOME（会话日志所在目录）
      harnesses:                        # 启用的本机数据源
        dsh: true
        zcode: true
        opencode: true
        workbuddy: true
        qoder: true
      showUninstalled: false            # 已卸载的 Harness 是否以「未安装」行显示
      zcode:
        dbPath: ''                      # 空 = ~/.zcode/cli/db/db.sqlite（或 $ZCODE_DB_PATH）
        providerAliases:                # ZCode 供应商 id → DSH 规范供应商
          opencode-go-chat: opencode-go
      opencode:
        dbPath: ''                      # 空 = ~/.local/share/opencode/opencode.db（或 $OPENCODE_DB_PATH）
        providerAliases: {}
      workbuddy:
        root: ''                        # 空 = ~/.workbuddy/projects（或 $WORKBUDDY_HOME/projects）
        providerAliases: {}
      qoder:
        home: ''                        # 空 = ~/.qoder-cn（或 $QODER_HOME）
        providerAliases: {}
    providers:                          # 按供应商覆盖（合并到内置默认值上）
      opencode-go: { enabled: true, apiKeyRef: OPENCODE_GO_API_KEY }
      commandcode: { enabled: true, apiKeyRef: COMMANDCODE_API_KEY }
      deepseek: { enabled: true, apiKeyRef: DEEPSEEK_API_KEY }
      open-design:                      # 额度查询需要工作区 + Control Key
        enabled: true
        workspaceId: '<open-design-workspace-id>'   # 空 = 环境变量 OPENDESIGN_WORKSPACE_ID
        controlKeyRef: OPENDESIGN_CONTROL_KEY        # 也可用 VELA_CONTROL_KEY
```

覆盖规则：

- 同 id 的配置行**整体替换**插件的默认配置，因此覆盖时请重述所有想保留的字段；
- `providers.<id>` 与 `stats.<zcode|opencode|workbuddy|qoder>` 内部按字段合并到默认值上；
- 供应商管理页保存的覆盖（启用状态、名称、控制台链接、Open Design 的工作区 ID 等）写入插件自己的 `$DSH_HOME/dsh-tokenlens/providers.json`（原子写入、仅本人可读），既不进 profile patch，也不会覆盖 DSH 模型设置；读取优先级为 **管理页覆盖 > profile 配置 > 内置默认**。
- `enabled: false` 会卸载 Host 半（bridge、Agent 工具与轮询一并停止），适合临时停用插件。

## 支持的供应商

### 套餐容量适配器

| 供应商 | 数据来源（Key 或服务） | 展示 |
|---|---|---|
| `opencode-go` / `opencode` | `GET https://opencode.ai/inference/go/v1/usage`（`OPENCODE_GO_API_KEY`） | 5 小时 / 本周 / 本月 已用百分比 + 重置时间 |
| `commandcode` | `api.commandcode.ai/alpha/billing/{credits,subscriptions}` + `/alpha/whoami` + `/alpha/usage/summary`（`COMMANDCODE_API_KEY`） | 5 小时 / 每周 `$已用 / $上限`；月度 `$已用 / $额度 · %`（v1.6.6）；方案名 |
| `deepseek`（选择器里的 `deepseek-official`） | `GET https://api.deepseek.com/user/balance`（`DEEPSEEK_API_KEY`） | 账户余额 |
| `deepseek-account` | DSH 组合内的 `deepseekAccount` 服务 | 钱包余额（含赠送） |
| `openrouter` | `GET https://openrouter.ai/api/v1/credits`（管理 Key；普通 Key 可用 `/api/v1/key`） | 剩余额度（USD） |
| `moonshot` | `GET https://api.moonshot.cn/v1/users/me/balance`（`MOONSHOT_API_KEY`；国际站改 `api.moonshot.ai`） | 余额（CNY / USD） |
| `siliconflow` | `GET https://api.siliconflow.cn/v1/user/info`（`SILICONFLOW_API_KEY`；国际站 `.com`） | 余额（CNY） |
| `stepfun` | `GET https://api.stepfun.com/v1/accounts`（`STEP_API_KEY`；国际站 `.ai` 为 USD） | 余额 + 赠金 / 现金 |
| `novita` | `GET https://api.novita.ai/openapi/v1/billing/balance/detail`（`NOVITA_API_KEY`） | 余额（USD，1/10000 单位换算） |
| `hyperbolic` | `GET https://api.hyperbolic.ai/v2/customer/balance`（`HYPERBOLIC_API_KEY`） | 余额（USD） |
| `deepinfra` | `GET https://api.deepinfra.com/payment/checklist?compute_owed=true`（`DEEPINFRA_API_KEY`，best-effort 内部接口） | 余额（USD）/ 欠费 |
| `zai` | `GET https://api.z.ai/api/monitor/usage/quota/limit`（GLM Coding Plan Key；国内站 `open.bigmodel.cn`） | 5 小时 / 每周 / 月度（MCP 预算）百分比（best-effort） |
| `minimax` | `GET https://api.minimax.io/v1/api/openplatform/coding_plan/remains`（订阅 Key；国内站 `api.minimaxi.com`） | 5 小时 / 每周 已用百分比（best-effort） |
| `zhipu-cn` | `GET https://open.bigmodel.cn/api/monitor/usage/quota/limit`（`ZHIPU_API_KEY`） | GLM Coding Plan：5 小时 / 本周 / 每月 百分比 + 方案 |
| `volcengine` | Coding Plan / AgentPlan：`POST https://open.volcengineapi.com/?Action=GetCodingPlanUsage&Version=2024-01-01`（Signature V4，`VOLCENGINE_ACCESS_KEY_ID` + `VOLCENGINE_SECRET_ACCESS_KEY`） | 5 小时 / 本周 / 每月 百分比 + 档位 |
| `open-design` | 只读计费接口：`GET …/api/v1/workspaces/{workspaceId}/wallet/balance`（钱包）+ `…/billing/funding-check`（Design Plan 窗口，位于 `codingPlan` 内）+ `/api/v1/billing/summary`（套餐档位），workspace ID + Control Key：`OPENDESIGN_CONTROL_KEY` / `VELA_CONTROL_KEY`，非推理 Key | Design Plan 的 5 小时 / 7 天 已用百分比 + 重置时间；套餐档位；钱包余额（USD） |
| `xiaomi-token-plan-cn` / `-ams` / `-sgp` | 控制台额度接口：`GET https://platform.xiaomimimo.com/api/v1/tokenPlan/usage` + `/tokenPlan/detail`（周期结束时间、方案码）+ `/api/v1/balance`（人民币余额）。**只认控制台 Cookie**（`XIAOMI_MIMO_COOKIE`），推理 Key 一律 401 | Token Plan 的每月 已用百分比 + 重置时间；方案码；账户余额（CNY） |

- OpenCode 的额度定义见[官方文档](https://opencode.ai/docs/go/#usage-limits)（5h = 月度额度的 20%、周 = 50%、月 = 100%）；接口只返回百分比，插件也只画百分比。
- Command Code 的 `/alpha/*` 是官方 CLI 自用的私有计费路由；免费 / 无方案账户返回空窗口（显示 `—`），插件不会用方案目录猜额度。**月度百分比**（v1.6.6）在套餐不下发额度时由 `credits.monthlyCredits（余额）+ /alpha/usage/summary 的 totalMonthlyCredits（本期消费）` 反推额度后计算，实测与该平台控制台一致；分母是**固定的额度池，不随所选模型变化**——GOAT 宣传的「Up to $100」与按模型额度（DeepSeek V4.1 Flash $100）只是同一份额度在折价模型上的等效值，若让分母跟随模型，切换模型时百分比会跳动而账户未变。
- **「有限额」不等于「已超限」**（v1.6.6）。Command Code 的 `windowLimits.limited` 是「本套餐带滚动窗口」的能力标志，真正的状态在同层 `exceeded`；插件此前把它当状态输出，会让用量仅 6% 的三个窗口全被涂成告警色，现已只有 `exceeded === true` 才告警。
- Open Design 的窗口按账户实际返回的时长渲染：Go 同时有 5 小时和 7 天窗口，Plus / Pro / Max 只有 7 天窗口；钱包余额是独立于窗口的 USD 额度，用尽后继续扣钱包。查询要求工作区权限，鉴权失败会明确显示错误而不是 0。**只需填一个 Control Key**：工作区 ID 是可选项（v1.5.3），插件会用 Key 调 `/api/v1/workspaces/current` 自动识别你的工作区；只有账号有多个工作区、需要指定其中一个时才在管理页填「工作区 ID」。真正缺 Key 时弹窗会指出并给出「去配置」入口。窗口、余额、套餐档位是**三层独立读取**（v1.4.0）：任一接口不可用时只少那一块数据，不会整套报错。
- **chip 的「月 N%」与「本期 Design Plan 累计」是插件本机算的估算值**（v1.5.0 / v1.6.0）。Open Design 有月度额度（Go 为每月 $120 = 4 × 每周 $30），但**没有「本账期已用」接口**——控制台的 `/billing/usage`、`/billing/coding-plan-usage` 都靠浏览器 Cookie 鉴权，Control Key 一律 401。于是插件累加它观测到的 **7 天窗口**（只记 7 天，因为 5 小时窗口测量的是同一笔消耗，相加会重复计数）。
- **金额按服务端 credits 反推，只统计 Design Plan 额度消耗**（v1.6.4）。钱包扣费不消耗 credits，只扣 `balanceUsd`，所以「本期 Design Plan 累计」= `usedCredits ÷ creditsPerUsd ÷ 倍率`——实测 `150,005 ÷ 10,000 ÷ 0.5 = $30.00`，与「周额度 $30 × 已用 100%」交叉验证一致。含钱包付费的本机估算另存为 `localPricedUsd`，高于前者时弹窗追加「另有 $X 由账户余额支付，未计入」，两个口径都清楚可查。
- **月额度的分母随倍率变化**（v1.6.0 / v1.6.2）。官方定价表把月额度写成**列表价美元**且按倍率消耗：只用 0.5× 模型（如 DeepSeek V4.1 Flash）可动用**完整 $120**，1× 用 $60，2× 用 $30，4× 用 $15。混合用量按实际消耗的 credits 加权取等效倍率（`$60 ÷ m_eff`），而不是简单取最高倍率——否则偶尔用一次 4× 模型就会把额度误报成 $15。弹窗注明「按 X× 倍率模型计价」以及覆盖情况（「已覆盖本账期全部窗口」或「仅统计已观测的 N 个窗口」）；覆盖不完整时百分比仍显示但**不会触发告警配色**。
- **没有额度适配器的供应商也会保留芯片**（v1.6.5）。`unsupported-provider` 原本静默隐藏芯片，但芯片是本机 Token 统计的唯一入口，于是「有数据却看不到」（如小米 MiMo 账户里有 3 亿 Token 却无处可查）。现在这类供应商显示「**仅本机统计**」芯片，点开即见统计区；本机统计对所有 Harness 都会采集，与该供应商有没有额度接口无关。
- **小米 MiMo 的额度接口只认控制台 Cookie**（v1.6.5）。推理 Key（`tp-…`）读不到额度接口，插件复用「写一次、永不回显」的密码输入位保存 Cookie，并明确提示约 24 小时过期。会话过期会显示可操作的中文指引，而不是报错码；未配置 Cookie 时不发任何网络请求。
- 未配置凭据的供应商 chip 静默隐藏；`zai`、`minimax`、`deepinfra` 属 best-effort 适配（未公开接口，失败时按可重试错误优雅降级）。
- 各供应商的元数据（`kind` / `label` / `shortLabel` / `baseURL` / `apiKeyRef` / `consoleUrl`）集中在 `lib/providers.mjs` 的 `PROVIDER_DEFAULTS` 与 `ADAPTERS` 中，新增适配器只需在该文件登记并补测试。

另有 9 家**仅元数据**的内置供应商（管理页「内置」中可见）：`sensenova`（商汤 SenseNova）、`qwen`（通义千问）、`qianfan`（百度千帆）、`intern-ai`、`agnes-ai`、`hunyuan`（腾讯混元）、`spark`（讯飞星火）、`yi`（零一万物）、`baichuan`（百川智能）。它们没有可用 API Key 查询的公开套餐 / 余额接口：千问 / 百炼的订阅额度只能通过官方 CLI 的控制台登录查询，腾讯混元 / 百度千帆只有云账户余额 API（需云账号 AK/SK），其余供应商仅控制台可见。chip 对它们静默隐藏，后续有稳定接口时再补适配器。

### 自动识别 DSH 模型设置

在 DSH「设置 → 模型服务」中配置供应商后，插件会自动发现该路由并映射到内置适配器：先按路由 id，再按模型 baseURL 主机名（OpenRouter、Moonshot / Kimi、SiliconFlow、StepFun、Novita、Hyperbolic、DeepInfra、Z.ai、智谱国内版、MiniMax、DeepSeek、Command Code、OpenCode 等）。已配置但暂无适配器的路由会在管理页显示提示，不会报错。

## 本机 Token 统计

### 数据源

| Harness | 数据源 | 读取方式 |
|---|---|---|
| **DSH** | `$DSH_HOME/sessions/**/session.v4.jsonl.zstd` | 逐条 `assistant/message` 的 usage，归因到 provider / model；增量缓存 |
| **ZCode** | `~/.zcode/cli/db/db.sqlite` → `model_usage` | `node:sqlite` 只读连接，按日 / 供应商 / 模型聚合 token 计数 |
| **OpenCode CLI** | `~/.local/share/opencode/opencode.db` → `message` | 只读 SQLite，只取 assistant 消息的 token 字段，不读正文 |
| **WorkBuddy / CodeBuddy CLI** | `~/.workbuddy/projects/**/*.jsonl` | 只读 JSONL，取 `providerData.rawUsage` 的 prompt / completion 计数 |
| **Qoder CN CLI** | `~/.qoder-cn/projects/**/*.jsonl` | 只读 JSONL，取 `message.usage` 并按 `message.id` 去重；自定义 provider 先按 `settings.json` 的 baseUrl 映射 |

每个 harness 的路径都可用配置覆盖；本地存储不存在（未安装 / 已卸载）时默认隐藏该行，存储存在但被锁或损坏时显示可重试的错误行，不影响其它数据源。

### 口径说明（两块数字不要混用）

| 区块 | 是什么 | 数据来源 |
|---|---|---|
| 套餐容量 | 供应商套餐 / 余额的**服务端权威值**（百分比 / 美元已用-上限 / 余额） | 各供应商套餐接口 |
| 本机 Token 用量 | **本机已接入 harness** 的 token 消耗，按「当前 DSH 供应商」过滤后跨 harness 合计 | DSH 会话日志 + 各 harness 本地数据库 / JSONL |

- 套餐接口本身**不提供 token 用量**，所以「套餐内 token 容量」并不存在；套餐容量按供应商原生单位展示，token 统计另起一块并明确标注本机口径。
- 本机 Token 用量**只统计本机、只统计已接入 harness**，不含云端或其它机器，也不含未落盘的调用。
- 今日 / 最近 7 天 / 最近 30 天按**结算事件时间**的本地日历日归属；跨午夜请求归入落盘那天。
- 选中某个供应商时，第二列显示「最近 X 天」（X = 该供应商在本机最早出现用量的日期到今天，含首日）；余额 / 按量付费供应商保持最近 30 天；「全部 Harness」视角固定最近 30 天。
- 弹窗底部的控制台 / 用量页链接**跟随所选供应商**（OpenCode → opencode.ai/console；Command Code → 用量设置页；DeepSeek → platform.deepseek.com/usage），可用 `providers.<id>.consoleUrl` 覆盖。

### 供应商映射

外部 harness 的 provider id 会映射到 DSH 规范供应商，这样「选中某供应商 = 所有 harness 的该供应商用量」才成立：

1. `stats.<harness>.providerAliases` 显式映射（例如 ZCode 默认把 `opencode-go-chat` 映射到 `opencode-go`）；
2. provider id 与 DSH 供应商完全相同；
3. 通过 DSH 模型目录对 **vendor-namespaced 模型 id**（如 `deepseek/deepseek-v4.1-flash`）做唯一匹配。

裸模型名（被多家转售的名称）**不会**参与模型匹配，以免把其它套餐的用量错算进来；这些供应商留在「未映射」列表、只计入「全部 Harness」合计，可通过对应 harness 的 `providerAliases` 显式指定归属。

## 架构

```
浏览器端 client.js                                      Host 端 index.js + lib/
┌─────────────────────────────────┐  POST /api/tokenlens  ┌──────────────────────────────────────────┐
│ useProjection('modelSelection') │──────────────────────▶│ snapshot | refresh | hello | stats       │
│  → providerId                   │ {action, providerId}  │ providers | providerUpdate | …           │
│ composer dock chip              │◀───────────────────── │ ┌ 每供应商缓存 + 单飞刷新                 │
│  └ 详情：套餐容量 + 本机 Token   │ snapshot / stats      │ ├ lib/providers.mjs    供应商元数据/适配器 │
│  └ 供应商管理页 / 图表 / 工作区   │                       │ ├ lib/go-usage.mjs     窗口与估算         │
└─────────────────────────────────┘                       │ ├ lib/usage-stats.mjs  DSH 日志折叠       │
                                                          │ ├ lib/usage-zcode.mjs / usage-opencode.mjs│
                                                          │ ├ lib/usage-jsonl.mjs  其它 harness 读取   │
                                                          │ ├ lib/key-source.mjs   凭据解析           │
                                                          │ ├ lib/provider-store.mjs 管理页覆盖存储    │
                                                          │ ├ ctx.provide('tokenlens') / ('planUsage')│
                                                          │ ├ Agent 工具 tokenlens_usage              │
                                                          │ └ 可选状态文件（statusFile）              │
                                                          └──────────────────────────────────────────┘
```

- **Host 半（`index.js`）**：注册 `/api/tokenlens` bridge 路由、按供应商缓存与单飞刷新、调度套餐查询与统计服务、注册 Agent 工具、暴露 `tokenlens` / `planUsage` 服务；可选写诊断状态文件。
- **浏览器半（`client.js`）**：读取当前供应商选择、渲染输入框下方的 composer chip 与详情弹窗，提供数据 / 图表两种模式、供应商管理页与工作区徽标装饰器（实验）。
- **数据层（`lib/`）**：供应商元数据与适配器、窗口与估算计算、各 harness 只读读取器、凭据解析、管理页覆盖存储；统计结果跨 harness 合并、按窗口折叠并对未映射供应商单独留槽。

统计负载的字段与窗口契约见 [PROTOCOL.md](PROTOCOL.md)。

## Agent 工具

Host 半注册 `tokenlens_usage`，参数 `action`（默认 `snapshot`）与可选 `providerId`：

| action | 说明 |
|---|---|
| `snapshot` | 当前供应商的套餐容量快照（缓存优先） |
| `refresh` | 忽略缓存，强制向上游刷新一次 |
| `stats` | 本机跨 harness Token 统计（今日 / 7 天 / 30 天 / 总计，按 harness、供应商、模型、工作区拆分） |
| `diagnostics` | 插件自检：配置摘要、缓存状态、各数据源可用性、最近错误（不含任何 Key 明文） |

工具由模型按需调用，也可以在 DSH 对话里直接让它「用 tokenlens_usage 看看今天的用量」。

## 隐私与安全

- **只读**：插件只读取本机会话日志与各 harness 的本地数据库 / JSONL；SQLite 一律以只读方式打开，只取 token 计数、时间、provider / model 等字段，不读取对话正文。
- **凭据不出本机**：API Key 只在 Host 进程内从 DSH 凭据服务 / 环境变量 / `.credentials.yaml` / OpenCode CLI 登录文件解析，只发往对应供应商的官方 HTTPS 接口；不下发浏览器、不写日志、不进诊断输出。
- **无遥测**：插件不收集、不上传任何使用数据，不请求远程配置或 CDN 资源（图标均为内联 SVG）。唯一的外网请求是「启动时检查更新」（v1.3.0 引入，v1.3.1 起默认开启，可在插件设置关闭）：仅向 npm registry 查询一次最新版本号，不携带任何账号、凭据或用量信息。
- **覆盖文件仅本人可读**：供应商管理页的覆盖写入 `$DSH_HOME/dsh-tokenlens/providers.json`（原子写入，权限仅当前用户），不会改动 DSH 模型设置或 profile patch。
- **可控降级**：上游接口不可用时只影响对应 chip / 行，不影响 DSH 本身；`enabled: false` 可整体停用插件。

## 已知限制

- 各供应商的用量接口多为**未公开的私有接口**，可能随时变更；插件对此做了优雅降级（可重试错误、静默隐藏、行级降级），但不保证长期可用。
- 套餐容量只显示服务端原生数字：不做 token → 金额换算；Command Code 的月度百分比由「余额 + 本期消费」反推额度后计算（v1.6.6），两者都拿不到时才留空。
- 「预计可消耗」是基于本机 Token 与套餐百分比的**估算**，仅供参考，不代表供应商承诺的额度。
- 「启动时检查更新」默认开启（可在插件设置关闭），只对比 **npm 上的最新发布版本**；GitHub 仓库的提交更新不会被感知，需要卸载重装 git 安装的版本才会更新。
- 本机 Token 统计只覆盖**已接入 harness**（当前 DSH / ZCode / OpenCode CLI / WorkBuddy / Qoder CN），只统计本机的本地记录。
- Harness 卸载后其数据目录消失即判定为未安装，默认从弹窗隐藏（可用 `stats.showUninstalled: true` 显示「未安装」行）；数据目录仍在磁盘时按历史记录继续计入。
- ZCode 数据库通常很大且持续写入：插件只做聚合查询并缓存结果，数据库被锁时会短暂显示不可用。
- 供应商映射是启发式的（alias → 同 id → vendor-namespaced 模型唯一匹配）；语义模糊的 provider 会留在未映射列表，可用 `providerAliases` 指定。
- 工作区 Token 徽标/悬浮卡片为实验特性，依赖 DSH 侧栏的 DOM 结构；悬浮卡片按工作区标题（大小写不敏感）或文件夹名匹配，DSH 界面变化时可能自动降级为不显示（v1.2.2 修复了 Host 未下发文件夹名、导致标题与统计标签不一致时悬浮卡片不显示 Token 明细的问题）。
- 多个 composer 同时挂载时，详情对话框只归属发起点击的会话。

**商标声明**：OpenCode、Command Code、DeepSeek、ZCode、WorkBuddy、CodeBuddy、Qoder 等名称与商标归各自权利人所有。本插件为独立第三方项目，与上述公司无关联，也未获得其背书。

## 验证

- `node --test`：**380 个自动化用例**，覆盖 Host 数据层、供应商适配器（含小米 MiMo 控制台 Cookie 适配器、Command Code 月度额度反推）、统计折叠、各 harness 读取、Design Plan 周期账本与额度计价、TPS 速度序列、窗口锚点切片、工作区自动识别、插件集成与浏览器端渲染 / 交互。
- 在真实环境中验证过 **5 个 harness** 的数据源；本机统计与独立的 SQLite 查询、独立的日志解析逐项对账（差额为 0），跨 harness 合并与供应商映射算术自洽。
- 供应商接口按各官方文档与参考客户端行为验证；未配置凭据时 chip 静默隐藏，接口异常时按可重试错误降级。

## 开发与贡献

要求 **Node.js ≥ 24**（DSH Desktop 自带；用到 `node:sqlite` 与 zstd 解压），无运行时 npm 依赖：

```powershell
git clone https://github.com/senyingxidi/dsh-tokenlens.git
cd dsh-tokenlens
node --test        # 280 个用例
```

本地联调安装方式见[方式 C](#方式-c本地开发从源码-link)。

### 目录结构

```
index.js            Host 半：bridge 路由、供应商适配器调度、统计服务、Agent 工具
client.js           浏览器半：用量 chip、详情弹窗、数据/图表、供应商管理页、工作区徽标
lib/providers.mjs   供应商元数据与套餐/余额适配器
lib/go-usage.mjs    窗口、套餐容量与可消耗额度估算
lib/usage-stats.mjs DSH 会话日志折叠 + 跨 harness 统计
lib/usage-*.mjs     各 harness 只读读取器（ZCode / OpenCode / JSONL）
lib/key-source.mjs  凭据解析（环境变量 / DSH 凭据 / auth 文件）
lib/provider-store.mjs  管理页覆盖与插件设置存储
cordis.patch.yml    插件 bundle patch（Host 挂载与默认配置）
test/               node --test 用例
scripts/            发版脚本
docs/               文档与截图
```

### 发版规则

**每次有文件变更的改动都升一次版本号**：修复 = PATCH，新功能 = MINOR，不兼容 = MAJOR。版本号落在 `package.json`、`index.js` 的 `PLUGIN_VERSION`、`CHANGELOG.md`，并显示在状态文件、诊断与弹窗角落。一条命令完成：

```powershell
node scripts/bump-version.mjs <version> "<说明>"
```

提交前请跑通 `node --test`；贡献流程、如何新增供应商适配器等见 [CONTRIBUTING.md](CONTRIBUTING.md)；安全问题请按 [SECURITY.md](SECURITY.md) 私下报告；历史变更见 [CHANGELOG.md](CHANGELOG.md)。

## 许可

[MIT](LICENSE) © senyingxidi
