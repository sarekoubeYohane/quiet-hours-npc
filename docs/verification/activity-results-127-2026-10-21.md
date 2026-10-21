# #127 自由活動結果分支驗證

依 [#125](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/125) 與 [#127](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/127)，延續 #126 集中生命週期。實作提交 `f6f9922`，已合併整合分支 `9f02ae4`（含最新 main 與 #122／#123）。本票不建立永久日常規則、不部署、不重置正式世界，未呼叫真實付費模型。

## 新能力與契約

一般完成活動可回傳 `branches`（1–5 組、唯一涵蓋既有五段級別）；多級別共用後果，確定活動僅一組且不擲骰。頂層 effects/stages 必須空，避免雙重效果。所有分支先經既有效果驗證器模擬，再由原 D20 選一組；選定結果與完整 Resolution 隨活動計畫保存，階段推進不重選或再裁定。空失敗分支仍花確認時間，正常提交遊戲內失敗。

`branches=null`／缺少欄位保留舊效果契約；舊 v1 日常核准仍為空效果、空階段、null check/completionMinutes，完整 timings 是時間來源。沒有把舊候選補成模型確認的失敗分支。

後續 #128／#129 可沿 `EffectCandidate.branches`、`SelectedResult` 及共用 `validateResultBranches`／`commitFreeAction` 承接。內部 `trialBinding` 預留受信任日常綁定的 operation/subject/當前 references，不接受模型自訂方法 ID 或歷史骰子作規則。日常模型確認規則仍屬後續票，未由本票完成。

## API、SQLite 與退化證據

透過真實世界 GET/POST handler 與實際 SQLite adapter 保存、API 重讀；僅模型 transport 與 Math.random 可控。驗收介面沿使用者已確認 API／SQLite／實際應用瀏覽器。

- 接手時 worktree 已有未提交實作及測試，無可驗證的原始逐片 TDD 紀錄；沒有把事後重跑稱為當時的 red-green。將新測試放入實作前 `af4c9d3` 的暫存原始碼快照重跑：10 項中 9 fail、1 pass，主要失敗是分支候選被拒絕（502），可證測試對新增行為敏感。
- 新增 `tests/activity-results-api.test.cjs`：10/10 通過；五段與共用分支、失敗消耗無成品、部分成果、空失敗、所有未選分支也驗證、上限不足零骰、確定活動零骰、重送／重載／continue、接管／物件移走、保存衝突／故障／提交不明、已知用量、schema/prompt 與舊候選相容。
- 完整活動 API runner：369/369 通過，0 fail／skip。包含 #126、#115–#119、#122 契約與 #123 工具／容器回歸。合併最新整合分支後，本票加 #122／#123 相關三檔 20/20 通過。
- typecheck、變更檔 ESLint、`git diff --check` 通過。

### 重試身份的保守界線

不以候選內容、分支順序／分組、DC、能力名稱、措辭、物件改名或單純 revision 變動取得新骰。首次驗證以具體可知 target 與受限物件 footprint 凍結 scope；後續候選不能靠附加無關效果擴大它。角色位置、實際物件語義狀態／材料單位、供應餘量／序號及既有可信研究資訊的真正改變可形成新嘗試。測試證明同前提改寫保持一骰，而獨立材料單位各有新骰。

泛用自由提案沒有可信的自然語言「方法實質不同」分類器；僅改寫方法說明不足以證明新嘗試。現行實作保守重用判定，未宣稱辨識任意自然語言的新方法，也沒有新增分類模型或洗骰用 methodId。

## 真實應用瀏覽器

`tooling/verification/browser127.mjs` 逐組啟動真實 Chromium、WorldApp、正式世界 handler 與 SQLite。測試使用明示模型 fixture；頁面正常下一回合、加入事件、暫時接管、分析分頁及重載，沒有測試專用 UI。每組核對物件狀態、計畫、事件 D20、重送與重載；未新增日常規則。部分成果畫面已人工檢視。

| 情境 | NPC／裁定／D20 | 最終外部狀態 |
| --- | --- | --- |
| 大成功、成功 | 各 1／1／1 | 作品 complete，材料 active |
| 部分成功 | 1／1／1 | 作品 partial，材料 active |
| 失敗、大失敗 | 各 1／1／1 | 作品 raw，材料 consumed |
| 新消息後 continue | 2／1／1 | 原起點／完成時間／結果保留，最後 complete |
| 接管中斷 | 1／1／1 | 保留已提交 partial，停止未來 complete |

重現環境變數沿 `tooling/verification/README.md` 的 Playwright／Chromium 設定，執行 `node tooling/verification/browser127.mjs`。截圖位於 [部分成功](assets/activity-results-127/mixed.png)、[失敗](assets/activity-results-127/failure.png)。所有呼叫次數都是 fixture 派送，不代表真實供應商輸出品質或正式站驗收。

## 限制

本票驗證自由活動結果分支，不代表 #128／#129 日常模型規則完成。真實模型能否持續生成合理後果、正式站部署及實際世界場景尚未驗證；沒有以 HTTP 200、保存候選或本地 fixture 通過宣稱完成。整合後仍須獨立 code review 與整合 build。
