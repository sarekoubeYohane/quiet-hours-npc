# 活動耗時契約兩軸審查

比較基準為 `7e470ef3c90aefb804712016d84665ed4ac2f477`。Standards 與 Spec 由不同子代理並行審查；修正由同一實作者以 API TDD 完成，再分別複審。

初審 Standards 有 1 項重複驗證／對齊的判斷性 finding，沒有硬性規範違反；Spec 初審 2 項功能缺口，複審再發現同一提前完成問題對既有食物的等價繞路。全部已修正；具體 red／green 見 [修正驗證](activity-time-review-fixes-2026-10-21.md)。

## Standards

唯讀增量複審：`505e0f0..782dc47`，重點為 `lib/world-effects.ts` 新增既有食物生命週期比較，以及對應世界 API 回歸。未修改程式或執行測試。

`existingObjects` 從 ID 集合改成保存原生命週期的 map，`completedFood` 明確命名新產物、終止狀態變更與已驗證材料準備的判斷，仍集中於既有完成時間守門邊界。沒有新增另一套效果路徑、模型可控制的內部 metadata，亦沒有引入值得提出的 baseline smell。

新增測試從世界 GET／POST 的實際回應及重讀，驗證提前消耗／毀壞既有食物的候選被拒絕並保持原世界，符合已確認 TDD seam；沒有私有 helper 測試或內部 collaborator mock。文件同步說明成果時間邊界。

原先的重複驗證／對齊 finding 仍已由共用 `scheduleCompletionMinutes` 解決，投入上限沒有被對齊。

Standards：0 項未解決明文規範違反、0 項未解決判斷性 finding。

## Spec（最終複審）

原比較基準 `7e470ef3c90aefb804712016d84665ed4ac2f477`；最終檢查修正至 `782dc47`。**未解決 Spec 發現：0。**

- 原先即時完整成果搭配較晚階段的漏洞已修復：頂層最終效果統一排到確認完成時間；新食物即使於早期階段產生後 consume／destroy，也不再能隱藏提早完成。
- 既有食物的提前 consume／destroy 現依原 lifecycle 比較，視為非法候選並原子拒絕。外部 API 重現改驗正確契約後通過：502、turn 不前進、餐點保持原 active／revision、無活動計畫。未把它誤報正常時間不足。
- 原料準備例外僅能由日常 factory 的已驗證 raw supply 內部標記，且只容許 consumed 原料；模型回應 schema／parser 無法提供該標記。保留合法加水等部分階段，沒有擴成任意提早成果例外。
- 咖啡館首次整組確認現在另存本地範圍與各活動時間，後續優先重用已知本地規則；住宅窄範圍及原時間保持。確認茶60後咖啡45與再次茶60的測試證明跨活動重用只有首次裁定。
- 最終效果合併仍限制每階段4個效果、總4個階段；無法藉 normalization 繞過原候選上界。

實際複測：`tests/activity-time-review-api.test.cjs` **7／7 通過**（含 consume／destroy 子情境）；獨立外部世界 API／SQLite 重現 **1／1 通過**。輸出 `task-context/review-spec-resolved-test.log`、`review-spec-resolved-repro.log`。正式站新版未部署仍屬已明示待驗限制，不將 fixture 當成正式站通過。

最終：Standards 0 項未解決；Spec 0 項未解決。
