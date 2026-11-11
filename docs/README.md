# 文件索引

這個目錄的文件大多是**寫下當時狀況的快照**。裡面的「尚未合併」「待實作」「本分支」描述的是寫作當下，不代表現況。要知道現在的程式長什麼樣，以程式碼與 [架構地圖](../ARCHITECTURE.md) 為準。

## 先讀哪些

| 想知道 | 讀 |
| --- | --- |
| 檔案在哪、模組怎麼分工 | [ARCHITECTURE.md](../ARCHITECTURE.md) |
| 怎麼跑測試、怎麼加測試 | [testing.md](testing.md) |
| 正式用語 | [GLOSSARY.md](../GLOSSARY.md) |
| 已接受的設計決策 | [adr/](adr/) |
| 工程流程與 issue 操作 | [agents/](agents/)、根目錄 `AGENTS.md` |
| 功能的歷史說明與進度快照 | [history.md](history.md) |

## 各目錄

### `adr/`

11 份，狀態都是 accepted。編號有兩個 `0002`（`activity-rules-and-lifecycle`、`bounded-activity-outcomes`），沒有 0010 與 0011。

### `design/`

設計契約、釐清紀錄與拆票計畫混在一起，用檔名分辨：

| 檔名樣式 | 性質 |
| --- | --- |
| `*-grill*.md` | 設計釐清的問答紀錄，是歷史 |
| `*-ticket-plan.md`、`docs/plans/` | 拆票當下的計畫，是歷史 |
| `*-baseline.md` | 工程基線，自述為非使用者確認的參數 |
| 其他 | 工程契約，多數仍對應現行程式 |

依主題找契約：

| 主題 | 文件 |
| --- | --- |
| 帳號、登入、部署 | `account-model-keys`、`github-login`、`test-site-deploy`、`recall-service-configuration` |
| 世界操作與回合時間 | `world-operations`、`round-time-budget`、`operation-evidence` |
| 裁定與世界效果 | `free-action-effects`、`world-changes-framework`、`natural-changes-time`、`world-discovery`、`object-observation`、`minimal-acceptance-scene` |
| 活動與日常 | `activity-lifecycle`、`activity-lifecycle-results`、`activity-time-contract`、`routine-discovery`、`method-assessment`、`method-reassessment-integration`、`last-known-state`、`demand-integration` |
| 自主生活 | `autonomous-life` 與五份 `life-*-baseline` |
| 安排與手機 | `flexible-arrangements`、`flexible-life`、`phone-baseline`、`phone-calendar` |
| 追求 | `layered-pursuits`、`pursuit-selection`、`pursuit-capacity` |
| 人物、檢定、精神電量 | `character-attributes`、`d100-checks`、`personal-body-needs`、`formal-mental-energy-policy`、`formal-mental-enablement`、`character-dice-energy-recommendation-2026-11-09`、`character-visual-assets` |
| 記憶 | `npc-memory-contract` |

已知與現行程式不一致的：

- `model-task-contract.md` 寫的是 `npc-decision.v1`，程式現在只接受 `npc-decision.v3`。
- `npc-perception-spec.md`、`npc-perception-ticket-plan.md` 寫 PR #47 尚未合併，實際已合併。
- `npc-action-model.md`、`npc-playbook.md` 是 2026-10-08 的版本。

開局精靈、存檔管理、人物卡與介面改版（#281–#296）沒有對應的 design 文件，說明在 [history.md](history.md) 與 `verification/`。

### `verification/`

驗證報告與證據，共約 690 個檔，全部是時間點證據。

- 頂層約 226 份報告，檔名是 `<主題>[-<issue>][-YYYY-MM-DD].md`。
- `assets/<主題>/` 放截圖與 JSON，多數由 `tooling/verification/` 的瀏覽器 runner 產生。
- `*-live-runbook.md` 是正式站的驗收流程。
- `full-regression-2026-11-03/` 等資料夾是單次完整回歸的整包紀錄。

搜尋程式用法時建議排除這個目錄，否則會被大量舊紀錄淹沒。

### `agents/`

| 檔案 | 內容 |
| --- | --- |
| `matt-pocock.md` | 工程技能的來源、載入方式與工作入口 |
| `issue-tracker.md` | GitHub Issues 的操作規則 |
| `domain.md` | 用語與 ADR 的維護方式 |
