# 活動耗時契約整合驗證（#115–#119）

本次以 `7e470ef3c90aefb804712016d84665ed4ac2f477` 為比較基準，依 #116 → #117／#118 → #119 整合。各工作票在獨立 worktree 遵守 TDD，再由 merger 整合至同一分支；沒有合併 main、部署或重置正式世界。

## 驗收範圍與證據

主要 seam 為既有世界 GET／POST、實際 JSON 序列化及測試 SQLite 保存。Chromium 使用真正 WorldApp 與世界 API，只有登入、Worker bindings、模型傳輸及可控時鐘為明示 fixture。所有下列 fixture 派送數均為測試呼叫，不是真實模型的 tokens 或費用。

| #115 驗收項目 | 可重現證據 |
| --- | --- |
| 原故障與可變耗時 | `activity-time-api.test.cjs`、`browser116.mjs`：一般估時 15／世界確認 30；另一組 5→15，另含 15／20→30／90。未到期無完整飲品。 |
| 一般估時不是上限 | 同上：估時 60／確認 5→15；明確上限另由 `timeIntent.maxMinutes` 表達。 |
| 整組首次確認及跨活動重用 | 同上：咖啡館全部六項時間一次保存；茶完成後咖啡 45 分鐘，經重讀／reload，新增裁定為 0。住宅維持較窄範圍。 |
| 所有完整效果按時生效 | `activity-time-api.test.cjs`：簡餐、飲用、清洗、放回均驗證 30 分鐘完成，第一個單位沒有提前套用完整效果。 |
| 對齊與明確上限 | `activity-time-limit-api.test.cjs`、`activity-semantics-api.test.cjs`：合理 20→安排 30，上限 20 不放大；等於安排可開始。非法值不截短或默認補值。 |
| 上限不足正常提交及重新安排 | `activity-time-limit-api.test.cjs`、`browser117.mjs`：首次不足保存規則，沒有活動、物件或消耗；reload 後下一次 NPC 輸入取得可知回饋；自主放寬後重用完成。 |
| 開放式與完成目標 | `activity-semantics-api.test.cjs`、`browser118.mjs`：自行選定 30 分鐘時段對照世界確認 45 分鐘的受支援餐點目標；不新增書籍／章節模型或假成果。 |
| 續做、到期與中斷 | `activity-lifecycle-api.test.cjs`：長活動保持原起點、完成時點、語意與 cursor；切換取消未執行候選，保留已提交物件與中間成果。 |
| 目標前提改變及資訊邊界 | 同上：他人實際取得並攜離物件後，過時階段不執行；原角色下一次輸入不洩露未知位置或持有人。 |
| 規則與權限邊界 | 既有 `routine-sharing-api.test.cjs`、`routine-obstacles-api.test.cjs`、`routine-first-approval-api.test.cjs` 等回歸：知情、能力、權限、有限供應、例外與住宅範圍。 |
| 派送、重送、預算及保存故障 | 三組時間 API 與生命週期 API 加既有 operations／budgets 回歸：分別計數 NPC／裁定；純推進、GET、重送不重複派送；技術故障原子回復，已知用量及早先成果保留。 |
| 直接控制與規則模式 | `activity-lifecycle-api.test.cjs`：已確認泡茶規則經單次指定、暫時接管及規則模式依確認時間推進；未知規則不暗加裁定或宣稱完成。 |

各項 red／green、命令及 fixture 限制見 [#116](activity-time-116-2026-10-21.md)、[#117](activity-time-117-2026-10-21.md)、[#118](activity-time-118-2026-10-21.md)、[#119](activity-time-119-2026-10-21.md)，以及相應 `activity-time-browser-*.md`。

## 正式站：待新版部署後驗證

2026-10-21 台北 13:33–13:34 的正式站 read-only 查核：實際瀏覽器登入頁顯示 **版本 `7e470ef`，建置於 2026-10-18 14:13 台北**。它是本次修正前版本；目前瀏覽器停在登入頁。本次沒有為驗收登入、重置、推進正式世界或呼叫付費模型。

因此，本次沒有新的正式站／真實模型通過紀錄，沒有可回報的正式測試模型、起點、物件結果或新增 tokens。不能以本機 fixture 結果替代。

使用者合併並完成部署後，仍須：

1. 從正式站版本資訊核對實際部署 SHA 確實包含本 PR，記錄 NPC／裁定模型與用量起點。
2. 沿既有明確重置操作建立新世界，執行有界真實模型驗收：首次確認→按期完成→另一日常活動重用→reload→續做，重讀世界及物件，分別記錄 NPC／裁定呼叫與 tokens。
3. 到達時再驗明確上限不足後重新安排、開放式到期、中斷及目標前提改變；真實 NPC 可拒絕或延後，未到達與失敗分開記錄。遇技術錯誤保存診斷並停止，不無界重試。

本輪不遷移舊固定耗時日常規則、不自動清空玩家世界；新世界內新規則的保存與重用已由上述真實測試保存邊界驗證。

## 最終工程檢查

整合 `238553b`（含全部 runtime 審查修正）由主流程實際執行：

- `pnpm test`：**390／390 通過**（348 活動／API、32 auth、10 Workers／migration）；預設硬性拒絕外部測試網路。
- `pnpm typecheck`：通過。
- `pnpm lint`：0 errors、4 個既有 img／hook warnings，與修改前基準相同。
- `pnpm build`：通過，五階段全部完成並輸出 `Build complete`。未部署成品。
- [兩軸審查](activity-time-review-2026-10-21.md)：Standards、Spec 各 0 項未解決；[7 項審查回歸](activity-time-review-fixes-2026-10-21.md) 已包含在 390 項內。

應用測試細節與實際執行範圍見 [browser116](activity-time-browser-116-2026-10-21.md)、[browser117](activity-time-browser-117-2026-10-21.md)、[browser118](activity-time-browser-118-2026-10-21.md)、[browser119](activity-time-browser-119-2026-10-21.md)；修正後[最終瀏覽器回歸](activity-time-browser-final-2026-10-21.md)已逐情境核對 PASS 標記，包含 116–119、112、110 及 browser100 標準／舊茶入口。正式站待驗範圍不因本節通過而取消。
