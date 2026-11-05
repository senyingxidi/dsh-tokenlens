# Plan usage plugin — Host ↔ Client protocol (v3, capacity vs local usage)

This file is the frozen contract between the Host half (`index.js` + `lib/`) and the
Client half (`client.js`). Both halves must agree on it; change it in one commit.

v3 adds: provider-native capacity amounts on windows (`used`/`cap`/`unit`), the
`version` field in the `hello` envelope, and the dialog split into
「套餐容量」(server-side) vs 「本机 Token 用量」(DSH session logs).

## Package

- name: `dsh-tokenlens`
- Host entry: `index.js` (cordis plugin, `apply(ctx, config)`)
- Client entry: `client.js` (browser module, `window.__ModuleLoader__.load`)
- Locale namespace: `dsh-tokenlens`

## Bridge route

The Client calls a Host-side Connection Fetch route (same mechanism as
`dsh-session-rollback`):

```
POST /api/tokenlens
Content-Type: application/json
```

The client uses a **document-relative** URL: `fetch('api/tokenlens', …)`
(never a hard-coded `http://127.0.0.1:<port>`; the desktop shell serves the page
from `dsh-app://app/` and forwards non-asset paths to the Host).

### Request

```jsonc
{
  "action": "snapshot" | "refresh" | "hello" | "stats" | "diagnostics" |
            "providers" | "providerUpdate" | "providerTest" | "settingsUpdate" |
            "customProviderSave" | "customProviderDelete" | "updateCheck",
  "providerId": "opencode-go",   // optional; defaults to the active provider
  "fresh": false,                 // stats only: bypass the scan TTL
  "origin": "dsh-app://app",      // hello only, optional
  "primitives": 290,              // hello only, optional (seeded primitives count)
  "locale": "zh-CN",              // hello only, optional
  "settings": { /* settingsUpdate only */ },
  "update": { /* providerUpdate only */ }
}
```

- `snapshot` — cached usage for `providerId`, refreshed when older than the TTL.
- `refresh` — force a fresh upstream read for `providerId`.
- `hello` — client announces itself (and its current provider); Host records it and
  answers with a snapshot so the first paint needs one round trip.
- `stats` — today/all-time token statistics folded from the local session logs.
- `diagnostics` — config/cache/error state (verification aid, no secrets).
- `updateCheck` — v1.3.0: run the optional npm-registry update check right now and
  answer `{ ok: true, update: <UpdateInfo> }`. It is also run once at activation
  when `settings.updateCheck` is enabled; disabled by default.
- Unknown action → HTTP 400 `{ "ok": false, "error": { "code": "unknown-action", … } }`.

### Response envelope

```jsonc
{ "ok": true,  "snapshot": <Snapshot> }            // snapshot / refresh / hello
{ "ok": true,  "stats": <Stats> }                  // stats
{ "ok": true,  "update": <UpdateInfo> }            // updateCheck
{ "ok": false, "error": <Error>, "snapshot": <Snapshot|null> }
```

`hello` answers `{ ok: true, plugin, version, bridge, pid, update: <UpdateInfo|null>, …snapshotResult }`.

## Snapshot (wire shape, v3)

```jsonc
{
  "ok": true,
  "version": 3,
  "provider": { "id": "opencode-go", "label": "OpenCode", "kind": "windows" },
  "plan": { "id": "individual-go-v1", "label": "Go" } | null,
  "windows": {                               // canonical ids, display order
    "rolling": { "id": "rolling", "percent": 8, "status": "ok",
                 "resetsAt": "2026-10-25T11:31:25.000Z", "remainingMs": 123456,
                 "startedAt": "2026-10-25T06:31:25.000Z",   // v1.5.2, when reported
                 "used": 0.5, "cap": 2.5, "unit": "USD" } | null,
    "weekly":  { … } | null,
    "monthly": { … } | null
  } | null,                                  // null for balance-only providers
  "balance": { "amount": 2.26, "currency": "CNY", "granted": 0, "toppedUp": 2.26 } | null,
  "credits": { "remaining": 4.5, "granted": 10, "purchased": 0 } | null,
  "account": { "name": "…", "userName": "…" } | null,   // non-secret display info
  "links": { "console": "https://opencode.ai/console" } | null,  // provider-owned web page, follows the selection
  "fetchedAt": "2026-10-25T09:03:00.000Z",
  "ageMs": 1200,
  "stale": false,
  "latencyMs": 87,
  "source": "api" | "cache" | "stale-cache",
  "key": { "ref": "OPENCODE_GO_API_KEY", "source": "credentials", "detail": "file" }
}
```

Provider semantics:

| provider id | kind | windows | extra |
|---|---|---|---|
| `opencode-go` | `windows` | rolling/weekly/monthly percentages | — |
| `commandcode` | `windows` | rolling = 5-hour `used/cap`, weekly = `used/cap`, monthly = `used/granted` where `granted` is the API-reported grant, else `credits.monthlyCredits + /alpha/usage/summary.totalMonthlyCredits` (v1.6.6) | `plan`, `credits` (USD), `account` |
| `deepseek` (picker id `deepseek-official`) | `balance` | `null` | `balance` (API-key account balance, CNY/USD) |
| `deepseek-account` | `balance` | `null` | `balance` from the composed Platform account service (signed-in wallets) |
| `open-design` | `windows` | rolling = 5-hour Design Plan window, weekly = 7-day window, monthly = 30-day window when reported (used / limit credits, capped at 100%) | `balance` (independent wallet balance, USD) |

`balance` is `{ amount, currency }` plus, for the account provider,
`wallets: [{currency, amount}]` and `bonus: [{currency, amount}]`.

### Command Code's monthly percentage (v1.6.6)

`commandcode` reads four routes: `/alpha/billing/credits`, `/alpha/billing/subscriptions`,
`/alpha/whoami`, and `/alpha/usage/summary` — the last one is the aggregate the provider's
own console renders, and it is what makes the monthly percentage computable, because a paid
plan does **not** send `monthlyCreditsGranted`:

```
granted = credits.monthlyCredits (remaining) + usage.totalMonthlyCredits (period spend)
```

Verified live on `individual-goat`: `69.1272003646 + 0.8727996354 = 70.0000000000`, and the
console's own bundle declares `totalCredits: 70` for that plan. The only imprecision is that
`/alpha/usage/summary` lags by a fraction of a cent, so the derived grant can read ~$0.003
under the pool for a moment; it self-corrects on the next poll. A reported grant always wins
over the derivation, and when neither is available the monthly `percent` stays `null` — the
plugin never sizes a month from a plan catalog.

**The denominator is deliberately model-independent.** GOAT advertises "up to $100" and lists
per-model allowances ($100 on DeepSeek V4.1 Flash, $60 on several others) because the same
credits stretch further on a discounted model; the pool itself is one number. Letting the
picker change the denominator would move the meter while the account did not change, so
`parseCommandCode` takes no model input.

`windowLimits.limited` is a **capability flag** ("this plan paces you with rolling windows"),
not a state: the live payload carries `limited: true` together with `fiveHour.exceeded: false`.
Only a per-window `exceeded === true` produces a non-`ok` status, because the client renders
any other status as an alert (which made a 6%-used account look critical before v1.6.6).

A `windows` snapshot may also carry a non-null `balance` (Open Design reports
allowance windows and a wallet independently); the Client renders it as one extra
row at the end of the capacity card and appends the amount to the chip tooltip.

`open-design` needs a **Control Key** (the `profiles.prod.controlKey` the desktop
app / `vela login` writes to `~/.amr/config.json`). The inference key from the
Cloud API Keys page answers HTTP 401 on the billing endpoints, so it cannot be
used here. A missing Control Key is a `missing-key` error.

**The workspace id is optional (v1.5.3).** A Control Key identifies the workspace
it belongs to, so the plugin discovers it:

1. `GET /api/v1/workspaces/current` — the key's active workspace
   (`workspaceId`, else `activeWorkspaceId`); this is the normal path.
2. `GET /api/v1/workspaces` — fallback: accepted only when exactly one workspace
   is visible. Several visible workspaces with none marked active is a
   `missing-key` error rather than a guess, because picking the wrong one would
   report another team's usage as this account's.

A configured id always wins over discovery (management page → 工作区 ID, persisted
in `providers.json`; or `OPENDESIGN_WORKSPACE_ID`), which is how a multi-workspace
account selects one. The Control Key is written through the same `apiKey` override
field the store already supported (write-only — the Host never returns it, only
`hasKey`/`keySource`). `OPENDESIGN_CONTROL_KEY` / `VELA_CONTROL_KEY` are still
honoured and the page override wins.

Reads, in independent layers (v1.4.0) — each may fail without voiding the others:

| read | path | provides |
|---|---|---|
| wallet | `GET /api/v1/workspaces/{id}/wallet/balance` | `balance` (USD, authoritative) |
| plan windows | `GET /api/v1/workspaces/{id}/billing/funding-check` | `windows` from its nested `codingPlan` (`eligible`, `tier`, 5h/7d credit windows) |
| plan tier | `GET /api/v1/billing/summary` | `plan` from `membershipTier` (`go` → `GO`) |

`billing/coding-plan-usage` carries the same plan document at the top level but is
served by the console's **cookie-authenticated** route: a Control Key always gets
HTTP 401 there (the console UI itself authenticates with a session cookie), so it
is only a fallback. The wallet is therefore always read first; the plan endpoint
must not turn a readable balance into a hard error.

### Design Plan period estimate (v1.5.0, open-design only)

Open Design publishes a **monthly** cap (Go: $120/month = 4 × the $30 weekly
window) but serves no "used this period" endpoint — not even cookie-free reads
(`/billing/usage` and `/billing/coding-plan-usage` both answer 401 to a Control
Key). So `snapshot.designPlan` (v4 wire) is a **local estimate** the Host derives
by observing the weekly windows it sees:

```jsonc
"designPlan": {
  "periodStart": "2026-11-02T09:53:18.000Z",   // billing period (billing/summary)
  "periodEnd":   "2026-12-02T09:53:18.000Z",
  "usedCredits": 142090,                        // Σ final+current weekly windows
  "estimatedUsd": 27.31,                        // v1.6.0: documented list-price cost
  "creditsUsd": 14.209,                         // the OLD (1x-assuming) conversion
  "monthlyCapUsd": 120,                         // documented cap for this model mix
  "multiplier": 0.5,                            // worst documented multiplier seen
  "capPercent": 22.76,                          // estimatedUsd / monthlyCapUsd
  "windows": 1,                                 // weekly windows observed
  "complete": true,                             // earliest window starts at periodStart
  "since": "2026-11-02T09:53:18.000Z",          // first window actually observed
  "limitPerWindow": 150000,                     // the account's real weekly cap
  "periodLimitCredits": 600000,                 // limitPerWindow * 4
  "percent": 23.68                              // usedCredits / periodLimitCredits
}
```

### Why `estimatedUsd` is not `usedCredits / creditsPerUsd` (v1.6.0)

Open Design bills **credits**, but the pricing page states every cap in
**list-price dollars** and assigns each model a credit-burn **multiplier**:

| model | multiplier | monthly cap it unlocks |
|---|---|---|
| DeepSeek V4.1 Flash | 0.5× | $120 (the whole Go cap) |
| MiMo V2.6 Flash / DeepSeek V4 Pro / GLM-5.3 Flash … | 1× | $60 |
| Claude Haiku 5.5 / GLM-5.3 Flash-X | 2× | $30 |
| GPT-6 Luna | 4× | $15 |

So `usedCredits / creditsPerUsd` silently assumes a 1× burn: it reports **half** the
true list-price value for a 0.5× model and **4× too much** for a 4× model. The
account's own windows confirm the unit (`50,000` credits per 5h = the documented
$10, `150,000` per 7d = $30, i.e. 5,000 credits per list-price dollar), which is
why `creditsPerUsd` is 10,000 — two credits per list-price dollar at 0.5×.

`estimatedUsd` is therefore computed from the tokens actually consumed:

```
cost = Σ per model ( input×p_in + output×p_out + cacheRead×p_read ) / 1e6
```

with the prices transcribed from the same page. Verified against one real console
receipt: input 311 + output 2,610 + cacheRead 258,560 on DeepSeek V4.1 Flash gives
`$0.0048` list price, ×0.5 multiplier = `$0.0024` charged — exactly what the usage
table shows. Note the table's "input" column is non-cached + cache, so `input` in
this formula **excludes** `cacheRead` or the cache bytes would be billed twice.

The cap uses the **highest** multiplier in the mix, not an average: a 4× model
consumes its share four times faster, so it binds. `creditsUsd` keeps the old
number on the wire for comparison; a client showing the old figure can migrate
without a wire break.

`windows.monthly` is then filled from that estimate (v1.5.1), with `resetsAt` taken
from `periodEnd`, so the existing monthly row and the chip's `月 N%` piece carry it
without a second UI. The ×4 monthly-to-weekly ratio is documented too: the pricing
table states the monthly cap as exactly four weekly windows for every tier (Go
$120/$30, Plus $160/$40, Pro $360/$90, Max $600/$150). A partial estimate still
reports a percentage but sets the window `status` to `unknown`, so it can never
paint a warning/critical dot.

Rules the Host guarantees:

- **Only the 7-day window is counted.** The 5-hour window measures the same spend
  (live: both report identical `usedCredits`), so summing them double-counts.
- Within one window instance (`windowStart`) the stored `usedCredits` only ever
  grows to the **maximum** observed; a transient smaller read never lowers it.
- A window that disappears from the upstream payload keeps its last (final) value.
- `complete` is true only when the earliest observed window starts at
  `periodStart`. Otherwise earlier windows of the period were never seen and the
  number is a **lower bound** — the UI must say so.
- Persisted in `$DSH_HOME/dsh-tokenlens/design-plan-ledger.json` (atomic, 0600,
  numbers/timestamps only, 6 periods retained). A write failure degrades to an
  in-memory fold and never fails the usage read.
- The raw upstream window rows never cross the wire; only the summary above does.
- `designPlan` is absent on every other provider and on an older Host.

Note the account's real caps may differ from the public pricing table (this
machine reports 50,000 credits per 5h / 150,000 per 7d = $5 / $15 at
`creditsPerUsd: 10000`, half of the advertised $10 / $30), so the summary reports
`limitPerWindow` as returned rather than assuming a published number.

Rules:

- `percent` is clamped to `0..100`; an unknown percentage is `null` (render "—"), never a fake 0.
- `status` is the upstream status string; anything not `"ok"` is rendered as a warning.
- Times are ISO-8601 UTC strings; `remainingMs` is computed by the Host.
- `source` is `api` (fresh), `cache` (TTL hit, `latencyMs: null`) or `stale-cache`
  (refresh failed, `stale: true`, paired with an error envelope).
- The model picker emits `deepseek-official` / `deepseek-account`, never a bare
  `deepseek`: the Host aliases `deepseek-official` onto the `deepseek` adapter.
  A provider without an adapter answers `unsupported-provider`.
- **`startedAt` (v1.5.2) is the window instance's own start**, not "now minus the
  window length". Design Plan windows are anchored to the subscription time
  (`resetMode: "anchored_recurring"`), so a window can begin at 09:53 and reset at
  14:53 regardless of the current clock. A client that wants to describe a window
  in local tokens MUST sum the interval `[startedAt, resetsAt)`; using a trailing
  "last N hours" slice mixes in the previous window and keeps reporting consumed
  tokens after a reset. Omitted when the upstream reports no `windowStart`.
- **Plan capacity vs local usage (v3 split):** the snapshot above is the
  server-side **plan capacity** (provider-native units). `used` / `cap` / `unit`
  appear only for providers that report their allowance in a native unit
  (Command Code: USD); OpenCode reports percentages only; balance providers
  report `balance`. The dialog must label this section as coming from the
  provider API. Local token totals come from the separate `stats` action and must
  be labeled as DSH session records, never as the plan allowance.

## Stats (wire shape, v3)

Token statistics are **provider-scoped across all local harnesses** and reported
in three windows: **今日** (`today`), **最近 30 天** (`last30Days`, rolling 30
calendar days including today) and **总计** (`allTime`). `harnesses[]` is an
extensible list (currently DSH, ZCode, OpenCode CLI; more adapters can be added
without a wire change), and a harness's own provider ids are mapped onto the
canonical DSH provider ids so that, e.g., ZCode usage on `opencode-go-chat`
counts toward the `opencode-go` provider selected in DSH.

v3 additionally carries the rolling **最近 7 天** window (`last7Days`), the
provider effective-date fallback (`effectiveDay`, `effectiveDays`,
`sinceEffective`), per-workspace totals (`workspaces[]`: `workspaceId`, `label`,
`total`, `messages`, `today`/`last7Days`/`last30Days`, and `path` — only the
folder basename, used by the client to match a sidebar hover card; the full
`cwd` is Host-only and never sent on the wire), the rolling 5-hour local window
(`fiveHours`, DSH-only because external harnesses are day-granular), and the
bounded `daily[]` series used by the chart view. Absolute local paths are
stripped from the wire; free-form error messages have path substrings replaced
with `[path]`.

```jsonc
{
  "ok": true,
  "stats": {
    "version": 3,
    "generatedAt": "2026-10-25T13:20:00.000Z",
    "timezone": "Asia/Shanghai",
    "day": "2026-10-25",                       // the local day "today" means here
    "last30DaysStart": "2026-09-26",           // rolling window start (inclusive)
    "today":      { …bucket… },                // all harnesses, all providers
    "last30Days": { …bucket… },
    "allTime":    { …bucket… },
    "harnesses": [                              // extensible: any adapter may appear
      { "harnessId": "dsh",   "label": "DSH",
        "today": { …bucket… }, "last30Days": { …bucket… }, "allTime": { …bucket… } },
      { "harnessId": "zcode", "label": "ZCode",
        "today": { …bucket… }, "last30Days": { …bucket… }, "allTime": { …bucket… },
        "error": null },                        // `{code:"stats-unavailable",…}` when the DB is unusable
      { "harnessId": "opencode", "label": "OpenCode",
        "today": { …bucket… }, "last30Days": { …bucket… }, "allTime": { …bucket… },
        "error": null },                        // same degradation contract
      { "harnessId": "workbuddy", "label": "WorkBuddy", "today": … },
      { "harnessId": "qoder", "label": "Qoder", "today": … }
    ],
    "missingHarnesses": [],                     // uninstalled harness ids (hidden from harnesses[] by default)
    "providers": [                              // canonical provider id, ALL harnesses
      { "providerId": "opencode-go", "label": "OpenCode",
        "today": { …bucket… }, "last30Days": { …bucket… }, "allTime": { …bucket… },
        "harnesses": {                          // per-harness split for this provider (arbitrary keys)
          "dsh":   { "today": { …bucket… }, "last30Days": { …bucket… }, "allTime": { …bucket… } },
          "zcode": { "today": { …bucket… }, "last30Days": { …bucket… }, "allTime": { …bucket… } },
          "opencode": { "today": { …bucket… }, "last30Days": { …bucket… }, "allTime": { …bucket… } }
        } }
    ],
    "models": [                                 // DSH-only top 12 by all-time total
      { "key": "opencode-go/deepseek-v4.1-flash", "providerId": "opencode-go",
        "modelId": "deepseek-v4.1-flash",
        "today": { "total": …, "messages": … },
        "last7Days": { "total": …, "messages": … },
        "last30Days": { "total": …, "messages": … },
        "allTime": { "total": …, "messages": … } }
    ],
    "daily": [                                  // <=120 days, ascending; chart series
      { "day": "2026-10-25",
        "total": { "total": 123456, "messages": 42 },
        "hours": [0, 0, 0, 1234, 5678, …],      // 24 integers: local-hour token totals
        "providers": {
          "opencode-go": { "total": 1234, "messages": 5,
                           "hours": [0, 0, 0, 500, 734, …] }
        } }
    ],
    "zcode": {                                  // extra-harness detail
      "dbPath": "C:\\Users\\…\\.zcode\\cli\\db\\db.sqlite",
      "available": true, "error": null, "rows": 65, "cached": false,
      "providerAliases": { "opencode-go-chat": "opencode-go" },
      "mappedProviders": [                      // ZCode usage that reached a canonical provider
        { "providerId": "opencode-go", "label": "OpenCode",
          "today": { …bucket… }, "last30Days": { …bucket… }, "allTime": { …bucket… } }
      ],
      "unmapped": [                             // ZCode providers with no DSH counterpart
        { "providerId": "account:bigmodel-start-plan", "label": "BigModel Start Plan",
          "today": { …bucket… }, "last30Days": { …bucket… }, "allTime": { …bucket… } }
      ]
    },
    "opencode": {                               // same detail node shape as zcode
      "dbPath": "C:\\Users\\…\\.local\\share\\opencode\\opencode.db",
      "available": true, "error": null, "rows": 2, "cached": false,
      "providerAliases": {}, "mappedProviders": [ … ], "unmapped": [ … ]
    },
    "workbuddy": { "root": "C:\\Users\\…\\.workbuddy\\projects", "available": true, "rows": 29, "unmapped": [ … ] },
    "qoder": { "dbPath": "C:\\Users\\…\\.qoder-cn", "available": true, "rows": 3, "unmapped": [ … ] },
    "missingHarnesses": ["zcode"],               // enabled harnesses whose local store is gone
    "unmapped": [                               // combined, across every harness
      { "harnessId": "opencode", "harnessLabel": "OpenCode",
        "providerId": "opencode", "label": "opencode",
        "today": { …bucket… }, "last30Days": { …bucket… }, "allTime": { …bucket… } }
    ],
    "scan": { …DSH scan metadata…,
              "zcode": { "dbPath": "…", "available": true, "rows": 65,
                         "durationMs": 30, "cached": false, "error": null },
              "opencode": { "dbPath": "…", "available": true, "rows": 2,
                            "durationMs": 20, "cached": false, "error": null },
              "workbuddy": { "dbPath": "…", "available": true, "rows": 29,
                             "durationMs": 690, "cached": false, "error": null },
              "qoder": { "dbPath": "…", "available": true, "rows": 3,
                         "durationMs": 6500, "cached": false, "error": null } }
  }
}
```

- Buckets always have all six counters (`input`, `output`, `cacheRead`,
  `cacheWrite`, `total`, `messages`). DSH `input` excludes cache reads; ZCode's
  `input_tokens` include them, so the adapter normalizes
  `input = input_tokens - cache_read_input_tokens`; OpenCode CLI's
  `total = input + output + reasoning + cache.read`, so its adapter normalizes
  `output = output + reasoning` (DSH-style) and keeps `input` exclusive of cache.
  Both external harnesses' `total` includes cache.
- **Provider mapping (per harness):** that harness's `providerAliases` config is
  tried first; then an exact provider id; then a unique model-catalog match for
  vendor-namespaced model ids (the model id appears in exactly one DSH provider's
  installed model list). Unmapped providers stay out of `providers[]`, appear in
  the harness detail + the combined `unmapped` array, and only contribute to the
  all-harness buckets.
- A **missing** external harness store (uninstalled / deleted) is hidden from
  `harnesses[]` by default and listed in `missingHarnesses`: no permanent zero
  row. `stats.showUninstalled: true` (alias `showMissingHarnesses`) keeps the row
  with a non-retryable `harness-missing` error. A store that **exists** but cannot
  be read keeps an error row, so temporary locks remain actionable. In every case
  the other harnesses stay correct.
- The DSH scan is incremental (per session file `{mtimeMs,size}` cache) and
  on-demand; `fresh: true` forces a filesystem re-check, otherwise a
  `stats.ttlMs` cache is served. The ZCode query is memoized by the database/WAL
  generation.
- A forked session's **inherited prefix** (up to its last
  `session/end-seed {inherited:true}`) is excluded; its own events are real spend.
  Subagent sessions are included; zero-token retries are not counted.
- ZCode rows with `computed_total_tokens = 0` are excluded; day = local day of
  `completed_at`; `readOnly` database, counters only (no prompt/message content).
- A missing/unreadable ZCode database is **not** fatal: the ZCode harness row gets
  an `error`, DSH totals stay correct, and `providers[]` still carries DSH usage.
- Client tabs: default 「当前供应商 · 全部 Harness」 (cards = the matching
  `providers[]` row, i.e. the selected provider's tokens across every harness)
  and 「全部 Harness」 (cards = the top-level buckets); cards show 今日 / 最近30天 /
  总计. 「按 Harness」 iterates `stats.harnesses[]` in host order and renders each
  harness `label` (extensible list, not only DSH/ZCode); in the provider scope only
  harnesses whose `provider.harnesses[harness].last30Days.total > 0` are listed (a harness
  with no 30-day usage for that provider is omitted; an all-empty breakdown shows a hint);
  hidden/uninstalled harnesses are explained by a muted footnote from `stats.missingHarnesses`. The DSH provider
  breakdown and top models are labeled DSH-only.
- An unavailable/disabled statistics service answers
  `{ ok: false, error: { code: "stats-unavailable" } }`.
- **Hourly drill-down (v1.2.0)**: `daily[].hours` and
  `daily[].providers[id].hours` are 24-element arrays of local-hour token totals
  (`[0..23]`, rounded integers) used by the chart mode. Every bundled harness
  contributes when it exposes event timestamps; a day without the field is not
  drillable and the client must not invent an all-zero hour series. DST fall-back
  hours collapse into one local hour slot.

## Error shape

```jsonc
{
  "code": "missing-key" | "unsupported-provider" | "unauthorized" | "forbidden" |
          "network" | "timeout" | "http" | "parse" | "disabled" | "rate-limited" |
          "unknown-action" | "stats-unavailable" | "internal",
  "message": "human readable, English, no secrets",
  "status": 401,          // upstream HTTP status when applicable
  "retryable": true
}
```

Client behaviour:

- `missing-key`, `disabled` → hide the chip (silent).
- `unsupported-provider` (v1.6.5) → keep a 「仅本机统计 / Local stats only」 chip in a
  **normal** dot state. Rationale: the chip is the only entry point to the local
  token statistics, and those are collected for every harness regardless of
  whether an adapter exists. Hiding the chip made real data unreachable — the
  exact complaint in GitHub issue #1, where `xiaomi-token-plan-cn` had 319M
  tokens in `usage-cache.json` and no way to view them. The dialog's stats
  sections (`buildStatsSummary` / `buildStatsDetails`) do not depend on
  `snapshot`, so they render normally with `snapshot: null`.
- `missing-key` for a workspace-scoped provider (v1.3.5): a provider whose Host
  payload carries a `workspaceId` field (Open Design) keeps a 「待配置 / Needs setup」
  chip, because hiding it would leave no way to reach the dialog's configuration
  guidance.
- everything else → show the chip in a warning state with a retry action.

## Provider selection (client side)

The browser half learns the provider the user selected from the session projection
`modelSelection` (available to session-scoped slot entries as the `useProjection`
prop):

```js
const model = useProjection('modelSelection')
const selection = model?.next ?? model?.lastUsed   // { provider, model, reasoningEffort? }
const providerId = selection?.provider             // e.g. "opencode-go"
```

Send that `providerId` with every bridge call and re-request when it changes. The
Host returns the provider display label in `snapshot.provider.label`; the client
needs no provider catalog of its own.

## Provider management (v0.9.0, browser bridge)

The dialog 「供应商管理」 page talks to three additional actions:

- `{action:"providers"}` → `{ok:true, version, providers:[{providerId,label,shortLabel,kind,enabled,hasKey,keySource,apiKeyRef,baseURL,consoleUrl,workspaceId?,builtin,dshManaged,dshProviderId}], dshProviders:[{providerId,label,supported,usageProviderId}], settings:{labelStyle,defaultView,defaultScope,detailsExpanded,detailsWindow,updateCheck}, update:<UpdateInfo|null>, updatePackageUrl, storeFile, storeFileDisplay}`. `storeFile` is the real path (local tooling); `storeFileDisplay` replaces the user's home directory with `~` and is what the management page renders. `version` (v1.3.2) is the running Host version, so a page loaded before an in-place plugin update can refresh a stale `hello` label without a reload. `update` (v1.3.0) is the last update-check result and `updatePackageUrl` the npm page the management UI links to. `workspaceId` (v1.3.5) is present only on adapters whose defaults declare one (currently `open-design`); its mere presence is the capability flag for the management page's workspace-ID input, so a provider without it renders no such field.
- `{action:"providerUpdate", providerId, update:{enabled?,apiKey?,apiKeyRef?,baseURL?,workspaceId?,consoleUrl?,label?,shortLabel?}}` → same list payload;
  empty strings clear a stored value (falling back to the profile/default). `label` (全名, ≤40 chars) and
  `shortLabel` (短标签, ≤12 chars) let the management page rename a provider. `workspaceId` (v1.3.5, ≤120 chars,
  charset `[A-Za-z0-9._:@-]`) is the workspace-scoped identifier Open Design's read-only billing API needs; a
  value that is not identifier-shaped (slashes, whitespace, path traversal) answers `parse` and is never persisted.
  The shipped management page no longer edits API keys or base URLs: every provider inherits them from DSH model
  settings, and the page only saves enabled/consoleUrl/workspaceId/label/shortLabel. Overrides are persisted
  atomically to `$DSH_HOME/dsh-tokenlens/providers.json` (plugin-owned, not the profile patch); the same file also
- `{action:"providerTest", providerId}` → the normal snapshot envelope (`{ok,snapshot}` or `{ok:false,error}`), forcing one upstream read.
- `{action:"settingsUpdate", settings:{labelStyle?:"short"|"full", defaultView?:"chart"|"data", defaultScope?:"provider"|"all", detailsExpanded?:"auto"|"expanded"|"collapsed", detailsWindow?:"today"|"last7Days"|"second"|"total", updateCheck?:boolean}}` → the same providers payload; every field is optional and persisted in the store (`settings.*`). `labelStyle` controls whether the composer chip shows each provider's `shortLabel` or full `label`; `defaultView` / `defaultScope` / `detailsExpanded` are the usage-dialog defaults; `detailsWindow` (v1.2.1) is the remembered 明细 donut window (falls back visually to `total` when that window is unavailable on the current provider/host); `updateCheck` (v1.3.0, default `true` since v1.3.1) enables the startup update check — the off→on transition runs one check immediately. Invalid values answer `unsupported-provider`.

### Update check (v1.3.0, on by default since v1.3.1)

On by default: at activation the Host makes one HTTPS `GET` to the fixed endpoint
`https://registry.npmjs.org/dsh-tokenlens/latest`; the same request also runs on
the off→on transition of `settings.updateCheck` and on the `updateCheck` action.
Users can switch it off (`settings.updateCheck: false`) to keep the plugin fully
local-only. Concurrent checks are single-flight (one registry request shared by
every caller). Nothing but the request itself leaves the machine — no
credentials, identifiers or usage data.

```jsonc
// UpdateInfo (host → client)
{
  "current": "1.3.0",
  "latest": "1.3.1" | null,      // null when the answer was unusable/failed
  "available": true,             // strictly newer published version, error === null
  "checkedAt": "2026-11-02T00:00:00.000Z",
  "error": null | { "code": "network"|"timeout"|"http"|"parse", "message": "…", "retryable": true }
}
```

A failed check never throws and never blocks activation; the client explains the
error instead of inventing a version. The result lives in memory only and is
surfaced through `hello`, `providers` and `diagnostics`.

`dshProviders` lists every route registered in DSH model settings (in order) with a `supported` flag (whether a usage adapter exists); the shipped management page renders those routes as the primary list and keeps unconfigured preset adapters in a collapsed secondary section. `dshManaged`/`dshProviderId` tell the management page that the route already exists in DSH model settings
(opencode-go / commandcode / deepseek), so the page can inherit the key and base URL instead of asking for them
again; such providers can still be overridden explicitly from the page (the override wins).

### Signed quota adapters (v0.21.0)

- `zhipu-cn`: `GET https://open.bigmodel.cn/api/monitor/usage/quota/limit` with the profile API key;
  reuses the GLM Coding Plan parser (`windows`).
- `volcengine`: `POST https://open.volcengineapi.com/?Action=GetCodingPlanUsage&Version=2024-01-01`
  signed with Volcengine Signature V4 (service `ark`, region `cn-beijing`). The key pair is read from
  `VOLCENGINE_ACCESS_KEY_ID` / `VOLCENGINE_SECRET_ACCESS_KEY` (environment or credential service); an Ark
  API key cannot query plan quota. Responses (`Result.QuotaUsage[]` or `Result.AFP*`) normalize to the
  canonical 5h/weekly/monthly windows. Missing AK/SK produce a `missing-key` error, never a silent zero.
- `xiaomi-token-plan-cn` / `-ams` / `-sgp` (v1.6.5): the quota lives on Xiaomi's **console** host, not the
  inference host, and it authenticates with **browser session cookies only**:

  | route | returns |
  | --- | --- |
  | `GET https://platform.xiaomimimo.com/api/v1/tokenPlan/usage` | `data.usage.items[].plan_total_token` / `compensation_total_token` (`{used, limit, percent}`), `data.monthUsage.items[].month_total_token` |
  | `GET https://platform.xiaomimimo.com/api/v1/tokenPlan/detail` | `planCode`, `currentPeriodEnd`, `expired` |
  | `GET https://platform.xiaomimimo.com/api/v1/balance` | account balance (CNY) |

  The inference key (`tp-…`) is rejected with `401 {"code":401,"loginUrl":"https://account.xiaomi.com/pass/serviceLogin?...&sid=api-platform..."}` —
  verified live against all three routes (they exist; only the success shape is untested, since it needs a
  signed-in account). The cookie (`api-platform_serviceToken` + `userId`) is entered on the management page
  in the same write-only secret slot Open Design uses for its Control Key, labelled 控制台 Cookie, and lasts
  about 24 hours. `normalizeCookie` accepts a bare pair list, a `Cookie:` header, or a multi-line paste
  (newlines are collapsed, because a newline inside a header value is an injection hazard).

  Normalization rules: `monthUsage` wins as the monthly window; `resetsAt` comes from `currentPeriodEnd`;
  a `401` — whether from the HTTP status or from a `loginUrl` anywhere in the body — maps to
  `unauthorized` (not retryable) with paste instructions; no cookie produces `missing-key` **without any
  network read**; an unparsable payload produces `parse` naming the fields it did see. When Xiaomi lists
  several `plan_total_token` rows that all carry the same non-zero `limit` (one per day/model), the limit is
  counted once while `used` is summed — otherwise the allowance would be inflated. `rolling` and `weekly`
  stay `null`: Xiaomi reports one monthly allowance and the plugin never invents windows.

### Automatic DSH provider sync (v0.18.0)

The management page reads the providers actually saved in DSH model settings from the active profile
(`configEditor.configuration()` → `llm-pi-ai` entry → `config.providers`, plus the `deepseek-account`
account service when composed). Dynamic plugin channels registered through `ctx.llm.listProviders()` are
NOT treated as configured.

Each configured route is auto-mapped to a built-in usage adapter either by route id (built-in provider id
or alias) or by the hostname of its model `baseURL` (openrouter.ai, moonshot.ai/.cn, siliconflow.cn/.com,
stepfun.com/.ai, novita.ai, hyperbolic.xyz/.ai, deepinfra.com, z.ai/bigmodel.cn, minimax.io/.com/.chat,
deepseek.com, commandcode.ai, opencode.ai). The profile `apiKeyEnv` becomes the credential reference, so
no manual setup is needed. Auto-mapped routes appear in `providers[]` as virtual entries with
`autoMapped:true, dshManaged:true`; `dshProviders[]` reports `adapterId`, `autoMapped` and a `reason`
(`no-usage-adapter`) when no usage API is recognised. Profile changes invalidate cached snapshots.

### Custom usage adapters (v0.16.0)

A DSH route without a built-in adapter can be taught to the plugin from the management page with a
declarative definition stored in `providers.json` under `customProviders`:

- `{action:"customProviderSave", provider:{providerId, label, shortLabel?, kind:"balance"|"windows",
  apiKeyRef, baseURL, usagePath, consoleUrl?, note?, …}}` → the normal providers payload; the provider
  id must match `[a-z0-9][a-z0-9._-]{0,63}` and must not collide with a built-in adapter.
  - `kind:"balance"`: `amountPath` (required), `currency`, optional `grantedPath`/`toppedUpPath`; the
    adapter reads the JSON at `baseURL + usagePath` and resolves the paths (`data.balance`, `limits.0.used`).
  - `kind:"windows"`: `windows:{rolling?,weekly?,monthly?}` each `{percentPath, resetPath?}` (at least one)
    and `percentScale:"percent"|"fraction"`; `resetPath` may be epoch ms, seconds or an ISO string.
- `{action:"customProviderDelete", providerId}` → the normal providers payload.
- `providerTest` works for custom providers too (forces one read using the DSH-resolved credential
  `apiKeyRef`).

Custom providers appear in `providers[]` with `builtin:false, custom:true`; when their id matches a DSH
model-settings route they are reported as `supported` in `dshProviders`, so the chip works exactly like a
built-in provider (including the plan-capacity section and provider-scoped token statistics).

Effective provider config = built-in defaults ← profile `providers.<id>` ← store override. A provider without a
resolvable key answers `missing-key` and the chip hides (silent), exactly like before.

## Host config (`cordis.patch.yml` `config`, every field optional)

| field | default | meaning |
| --- | --- | --- |
| `enabled` | `true` | `false` unloads the bridge, tool, timer and stats |
| `defaultProvider` | `opencode-go` | fallback when the browser has not reported a selection |
| `minRefreshIntervalMs` | `20000` | cache TTL per provider |
| `timeoutMs` | `15000` | per-request timeout |
| `pollIntervalMs` | `120000` | background poll of the active provider; `0` disables |
| `statusFile` | `''` | diagnostics JSON (dev aid) |
| `providerStoreFile` | `''` | empty → `$DSH_HOME/dsh-tokenlens/providers.json` (provider-management overrides) |
| `stats.enabled` | `true` | token statistics service |
| `stats.ttlMs` | `30000` | scan answer TTL |
| `stats.cacheFile` | `''` | empty → `$DSH_HOME/dsh-tokenlens/usage-cache.json` |
| `stats.dshHome` | `''` | empty → `$DSH_HOME` |
| `stats.showUninstalled` | `false` | keep a hidden-able row for a harness whose local store is gone (diagnostics aid) |
| `stats.harnesses.dsh` | `true` | include DSH session logs |
| `stats.harnesses.zcode` | `true` | include the ZCode SQLite usage database |
| `stats.harnesses.opencode` | `true` | include the OpenCode CLI SQLite usage database |
| `stats.showUninstalled` | `false` | keep a row for a harness whose local store is missing (otherwise it is hidden + listed in `missingHarnesses`) |
| `stats.zcode.dbPath` | `''` | empty → `~/.zcode/cli/db/db.sqlite` (or `$ZCODE_DB_PATH`) |
| `stats.zcode.providerAliases` | `{ "opencode-go-chat": "opencode-go" }` | ZCode provider id → canonical DSH provider id |
| `stats.opencode.dbPath` | `''` | empty → `~/.local/share/opencode/opencode.db` (or `$OPENCODE_DB_PATH`) |
| `stats.opencode.providerAliases` | `{}` | OpenCode CLI provider id → canonical DSH provider id |
| `stats.harnesses.workbuddy` | `true` | include the WorkBuddy/CodeBuddy CLI JSONL transcripts |
| `stats.harnesses.qoder` | `true` | include the Qoder CN CLI JSONL transcripts |
| `stats.workbuddy.root` | `''` | empty → `~/.workbuddy/projects` (or `$WORKBUDDY_HOME/projects`) |
| `stats.workbuddy.providerAliases` | `{}` | WorkBuddy provider id → canonical DSH provider id (no provider ids stored) |
| `stats.qoder.home` | `''` | empty → `~/.qoder-cn` (or `$QODER_HOME`) |
| `stats.qoder.providerAliases` | `{}` | Qoder provider id → canonical DSH provider id (after settings.json base-URL mapping) |
| `providers.<id>.enabled` | `true` | per-provider switch |
| `providers.<id>.apiKeyRef` | per provider | credential reference |
| `providers.<id>.baseURL` / path fields | per provider | endpoint overrides |
| `providers.<id>.consoleUrl` | per provider | provider web console/usage page for the dialog link |

Legacy v1 flat fields (`baseURL`, `usagePath`, `apiKeyRef`, `apiKey`) still
configure the `opencode-go` provider.

## Client surfaces (agreed UI contract)

1. **Composer dock chip** — slot `conversation.composer.dock`, order `5`, locale
   `dsh-tokenlens`. Compact: provider label + windows percentages, or the balance
   for balance providers. Click opens the detail modal. Hidden for
   `missing-key` / `unsupported-provider` / `disabled`.
2. **Detail modal** — slot `conversation.input.overlay`, id
   `dsh-tokenlens-dialog`, order `3`, locale `dsh-tokenlens`:
   - usage: provider + plan header, three window rows with bars/reset countdowns,
     or a balance card; Command Code also shows remaining/granted credits;
   - **token statistics**: tabs 「当前供应商 · 全部 Harness」 (default; cards = that
     provider's tokens across DSH + ZCode) / 「全部 Harness」 (all providers);
     cards show 今日 / 最近7天 / 最近X天(或最近30天) / 总计 (total tokens,
     input/output/cache, request count); a 「按 Harness」breakdown for the active
     scope; DSH provider breakdown and DSH top models; an unmapped-ZCode note when
     present;
   - **chart mode**: the daily bar chart, a click on a day bar drills into that
     day's 24 local-hour bars (when the Host delivers `daily[].hours`), and the
     明细 donuts switch between 今日 / 最近7天 / 最近X天 / 总计;
   - refresh (usage + stats), last-updated/stale line, error banners, console link;
   - when `update.available` is true (v1.3.0) the footer shows one muted line
     「发现新版本 vX · 打开 npm」 linking to `updatePackageUrl`.
3. **Provider management page** (same modal, 管理 tab) — when the optional update
   check is enabled the 插件设置 tab shows its toggle, the last result (up to date /
   new version / failed) and a 「立即检查」 action that sends `updateCheck`.
4. Everything client-side must work with only the shell's seeded modules
   (`react`, `react-dom`, `@deepseek-ai/dsh-client-ui-primitives`) — no build step.
