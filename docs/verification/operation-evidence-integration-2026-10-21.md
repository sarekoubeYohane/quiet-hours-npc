# 操作驗收證據整合驗證（2026-10-21）

規格 [#133](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/133)、工作票 [#134](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/134)、整合 [PR #140](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/140)。最初重現基準為 main `d2f3ec3`；已整合 main `9a5365a` 的裁定候選文件。本輪沒有合併 PR、部署、正式站操作或真實模型呼叫。

## 修正前後與判定界線

| 場景／證據 | 修正前 | 本輪結果 |
| --- | --- | --- |
| 正式站 c6e0e93 泡茶 | #132 已證明六項保存時間、原杯有茶、飲品與活動完成、UI/API 重讀一致 | 保留此結論；不是泡茶 runtime 失敗 |
| 該正式回合的 NPC 原長句、target、裁定候選及原始 timings | 沒有可重讀資料；現有 API、journal、metadata logs 與報告不能補回 | **仍未驗證，不能追補或由保存值倒推** |
| 新操作的成功／失敗證據 | 成功 settled 結果沒有候選；UI 移除 settled payload | **本機 fixture 通過**：有界 journal 證據、API/UI 重讀、原 ID 重送 |
| 新修正的正式站真實模型行為 | 尚未部署 | **正式站未驗證**；依 [部署後流程](operation-evidence-live-runbook.md) 執行 |
| 原驗收杯 drink→wash→同杯重用 | contents 沒有 dirty，但既有 drink 需要此轉換 | **場景準備不足，未執行此正式分支**；未補 dirty 或擴充正式物件 |
| 免費規則重用與原長句首次核准 | 是不同條件；普通已知短句可用既有規則，不能預設自由長句免費 | 本輪未做正式站品質驗收；runbook 分開記錄 NPC 與裁定派送 |

最小範圍、來源盤點及 journal 邊界詳見 [設計](../design/operation-evidence.md) 與 [ADR 0004](../adr/0004-operation-evidence-stays-outside-story.md)。既有同操作重送引擎可沿用，因此沒有新增 replay endpoint、測試後門、模型分類／修復呼叫、預算或活動／物件規則。

## Red → green

基準真實 API／SQLite 測試先得到 HTTP 200、settled，然後在 `settled success must expose original proposal and raw adjudication evidence` 斷言失敗。真實 WorldApp Chromium 也先在 `assert.ok(evidence)` 失敗；這兩者證實的是成功證據缺失。

實作後增加 14 項 API 維護測試，經相同 GET/POST、SQLite 與 journal 重讀驗證：

- 原 NPC 行動欄位、target、一般估時／投入上限；解析前裁定候選及六項未對齊時間；保存後規則、活動、杯子／飲品 ID。
- 契約錯誤、invalid JSON、transport 失敗與已知／未知 usage；提交前失敗、可能已提交後拋錯，不能將未提交候選當成果。
- 原 request／模型 request／部署 metadata 關聯；換部署後重送仍回原證據。
- 成功、失敗、重載、同 ID 重送保持版本、杯子、效果、用量與 transport 次數；其他帳號不能讀取；證據不進 NPC 上下文。
- 多位元字串、超大候選、40 個角色派送、32 筆明細限制與 64 KiB 證據上限；派送明細淘汰不將實際 counts 截成 32。
- Key／認證遮蔽、private NPC 欄位排除、結構化效果中的 credential；異常 cached usage 不擴散任意 metadata。
- 保存失敗後 journal 同樣遵守 500,000 bytes 淘汰目標與水位，遲到寫入不重插已淘汰操作。

整合驗證另外找到兩個回歸並修復：正常裁定 schema 超過新 scrub 深度，導致舊診斷誤標截短（`325c957`）；Workers 測試的明列模組須包含新 evidence/redaction 模組。規格 review 也先重現 Basic／Cookie／帶空白引號憑證的尾段外洩，補 API/SQLite 紅綠回歸並修正（`0a594b8`）。

## 真實應用瀏覽器與篩選產物

這裡的「真實」指實際 WorldApp、GET/POST handler、Node SQLite；認證、Worker bindings、模型 transport 是本機 fixture。沒有替換世界執行或持久化，也沒有呼叫付費服務。每個場景 1 次 NPC + 1 次裁定，共 8 次 fixture transport；重載及 UI 同 ID 重送均未新增派送。

| 場景 | 可重讀 JSON | UI 截圖 | 驗證 |
| --- | --- | --- | --- |
| 原杯成功 | [existing.json](assets/operation-evidence/existing.json) | [existing.png](assets/operation-evidence/existing.png) | 原長句、茶具 target、六項 raw 5/6/10/8/3/1 → 各 15 分鐘；原杯有茶、單一飲品、活動完成 |
| 未記錄杯成功 | [unrecorded.json](assets/operation-evidence/unrecorded.json) | [unrecorded.png](assets/operation-evidence/unrecorded.png) | 現有合法具體化路徑；一杯一飲品，重送不複製 |
| 矛盾裁定 | [contradictory.json](assets/operation-evidence/contradictory.json) | [contradictory.png](assets/operation-evidence/contradictory.png) | 原 completionMinutes=5 與 routine 同時存在；HTTP 502、世界回復、已知 usage 與候選保留 |
| 服務失敗 | [transport-failure.json](assets/operation-evidence/transport-failure.json) | [transport-failure.png](assets/operation-evidence/transport-failure.png) | HTTP 503 transport 導致技術回復；實際派送存在，但裁定候選不可得、usage=null，不補零 |

每組均實際重載 UI、GET 指定 operationId、按分析頁「重送同一操作」，核對原證據及原 requestId 不變、重送 HTTP requestId 不同、世界版本／物件／規則／事件／用量不變、無瀏覽器 pageerror。正常場景未截短也未遮蔽。產物只有篩選證據，沒有整份 World、原世界備份、scope、Cookie、Key 或 HAR。

瀏覽器 fixture 的部署為 local／unknown；部署 metadata 的捕獲及跨部署重送由 API fixture 使用明確 commit／builtAt 驗證，不能把它宣稱為正式部署驗證。

## 可重跑命令與驗證結果

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
git diff --check

PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
CHROMIUM_EXECUTABLE=/absolute/path/to/chromium \
BROWSER_FONT_DIR=/absolute/path/to/@fontsource/noto-sans-tc \
node tooling/verification/browser-operation-evidence.mjs
```

最終整合 `9e4d650`：`pnpm test` **414/414 通過**（活動/API 372、auth 32、Workers／migration 10）；typecheck、build、diff check 通過；lint **0 errors、4 個既有 warnings**（三個 img、一個 Hook dependency）。瀏覽器四場景全數通過，無 pageerror、8 次 fixture transport、0 次真實模型呼叫。

預設測試自動啟用 no-network preload；Miniflare 另拒絕外連。使用 Sparticuz Chromium 時加上 `CHROMIUM_MODULE`，環境細節見 [runner 說明](../../tooling/verification/README.md)。

## 保留限制

已定案證據跟隨最多八筆 journal；最新完整原回應超過 journal 目標時仍保留，是既有精確重放契約。單筆新證據仍有獨立 64 KiB 硬上限，超限／遮蔽會明示。只保留必要原欄位投影，不承諾原 HTTP 本文的逐 byte 備份。

受理前的認證／輸入拒絕不建立 journal。Worker 硬中斷或資料庫持續不可寫時，未保存候選及供應商用量仍可能不可得；沿用 pending／uncertain 與同 ID 不再執行保障，不假裝已取得所有證據。舊回合、淘汰及不明結果不能重建。

雙軸 review 的初始 finding 與修正覆核見 [code review](operation-evidence-code-review-2026-10-21.md)。#104、#106 保持開啟；後續正式站流程必須另外執行。
