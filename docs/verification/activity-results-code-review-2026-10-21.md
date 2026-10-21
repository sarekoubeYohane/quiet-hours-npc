# 活動結果整合：雙軸 code review 與修正

來源：[主規格 #125](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/125)、[#126](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/126) → [#127](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/127) → [#128](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/128) → [#129](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/129)。兩位獨立唯讀 reviewer 比較本機整合 `10f8e5f` 與固定 main `a7644bc`，Standards 與 Spec 分開執行。該 main 已包含 PR #140；本輪未重做或關閉其獨立工作票。

## Standards：初始報告

文件規範硬性違反：**0 項**。判斷性 smell：**1 項 P3**。

**Possible Duplicated Code**：`lib/activity-lifecycle.ts` 的取消與 `lib/world-effects.ts` 的未選分支，各自維護相同 pending 供應清理政策：僅刪除本候選尚未具體化的供應，保留已有 `object.source` 的事實。依 `codebase-design` locality 原則，重複 predicate 有日後只修其中一路的維護風險；未發現現行行為錯誤。

已核對活動模組不派送模型、不寫資料庫，新測試沿已授權世界 API／SQLite／Chromium seam，術語與文件區分已實作與未驗證能力。Standards 最高為 P3，無硬性規範違反。

## Spec：初始報告

**2 項 P2**，未發現其他具體 scope creep。

1. **必要工具實質改變仍沿用舊失敗。** #127 要求「不更動……重試資格」；#125 只要求「同方法同前提重試」保留判定。首次凍結範圍只收效果引用，漏掉已確認階段前提物件。真實世界 API 重現：先失敗，再由另一項合法活動將必要工具 basic 改為 improved，重新嘗試仍只有一骰。首次合法 preconditions 應納入凍結範圍，後續仍不可追加引用洗骰。
2. **相容 v1 核准覆寫 v2 時間，卻保留舊程序。** #128 要求「不讓兩種契約互相矛盾或偷改意義」。既有 v2 泡茶程序 30 分鐘；後續長句取得 v1 核准、對齊時間 15 分鐘時，只更新 templates 而保留 30 分鐘 programs。API 200 保存時已到 plan.until，杯子仍是水且階段為 `[15,30]`。應拒絕不相容跨版覆寫，或採一致且明確的版本承接。

PR #140 對新 branches／programs 的投影目前明示 `truncated`，且本票報告已承認限制；reviewer 未將此直接列成本規格違反，亦未把摘要冒充完整成功候選。

## 單一 implementer 的修正與 red → green

以下透過正式世界 GET／POST handler、SQLite 保存重讀與 transport fixture 驗證，不以私有 helper 順序作驗收。原 reviewer 的暫存重現已納入 repository 測試，重現不依賴 `/tmp` 檔案存續。

| 發現 | 已提交的回歸與 red | 修正及 green |
| --- | --- | --- |
| Spec P2：工具前提 | [activity-results-api.test.cjs](../../tests/activity-results-api.test.cjs)：實際工具改善後預期兩骰，修正前為 `1 !== 2` | 首次合法階段前提 ID 一併納入凍結 footprint。合法活動真的改善工具後取得新骰；後續僅追加新前提仍不能擴大既有 footprint。該檔 11/11 通過 |
| Spec P2：跨版時間 | [routine-program-api.test.cjs](../../tests/routine-program-api.test.cjs)：不相容 v1 覆寫預期拒絕，修正前為 `200 !== 502` | v1 若要改寫既有 v2 的範圍或對齊耗時，原子拒絕，保留原規則／物件／時間與已知用量；重送仍拒絕且不再派送。原 30 分鐘程序後續免費完成；相同範圍及耗時的 v1 可保留既有 v2 程序。該檔 12/12 通過 |
| Standards P3：重複清理 | 既有取消與未選分支的 API 情境覆蓋本候選、無關 pending 與已有實物來源 | `discardPendingSupplies` 統一安全清理 predicate，兩個入口各自提供應清除的候選 ID。不改供應權限、物件身份或既有成果 |

相容策略僅拒絕會令 v2 程序與時間／範圍矛盾的覆寫，不一律拒絕 v1。舊世界、舊核准及 v1 程序仍沿原有路徑；不自動遷移、重置或重寫歷史判定。本次未新增方法分類器、D20 引擎、效果種類或額外模型派送。

## 實際回歸結果

針對活動結果、日常程序／分支、生命週期、自由活動、#122／#123、操作重送與保存衝突的九份 API／SQLite 測試 **101/101 通過**。typecheck、變更檔 ESLint、diff-check 通過。

由 repo 根目錄可重現：

```sh
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-activities.mjs \
  tests/activity-results-api.test.cjs tests/routine-program-api.test.cjs \
  tests/routine-results-api.test.cjs tests/activity-lifecycle-api.test.cjs \
  tests/free-actions-api.test.cjs tests/routine-contract-api.test.cjs \
  tests/routine-objects-api.test.cjs tests/operations-api.test.cjs tests/conflict-api.test.cjs
```

依 [瀏覽器環境說明](../../tooling/verification/README.md) 設定當地 Playwright／Chromium 後，另跑兩組真實應用 smoke：

- `node tooling/verification/browser127-case.mjs continue`：原結果與時鐘保留，完成作品；**2 NPC／1 裁定／1 骰**，API／SQLite／UI 重載與重送通過。
- `node tooling/verification/browser129-case.mjs flow`：免費新活動、continue、新杯接管取消及交還；**4 NPC／1 裁定／3 骰**，材料、杯子與保存狀態一致。

這些是本機 fixture 的實際 handler／SQLite／Chromium 驗收，並非真實模型或正式站驗收。修正 implementer 未推送、合併 PR、部署或重置正式世界。

## 修正後獨立覆核

Standards 原 reviewer：原 P3 已解決，剩餘 0 項，未發現新增問題。兩個入口僅提供候選 ID，共用函式保留非 pending 供應與已有實體來源的事實；未增加派送、資料庫寫入或測試介面。

Spec 原 reviewer：兩項 P2 均 resolved，無新增 Spec 問題。首次合法工具前提真實改善可取得新骰，後續追加無關前提仍不洗骰；不相容跨版核准原子拒絕，相同時間可沿用 v2，舊 v1 路徑保持。獨立重跑兩份 API／SQLite 測試 23/23 通過，未修改檔案或讀取 Standards 報告。

父流程合併至本機 `ceb35fd` 後，完整 `pnpm test` 451/451、typecheck、變更檔 lint、production build 與產物設定核對通過。完整證據與限制見 [最終整合驗證](activity-results-integration-2026-10-21.md)。初始發現數字與修正後剩餘數字分開記錄，不把已修正寫成「從未發現問題」。
