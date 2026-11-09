# #281 帳號玩家預算與審查修正

狀態：P2 人物 AI 血緣、P3 輕量模型白名單已先行交付並獨立覆核；本文件記錄同一修復實作者的 P1 帳號預算及 T9 名稱恢復修正。**專票與接合驗證已完成；最終 integration 全套回歸由整合者收尾，不據此宣告 #281 完成。**

## 問題與結果

- P1 的原反例：甲世界達限後，乙世界仍回 200 並新增模型呼叫。產品 API／SQLite 測試先失敗，再確認第二檔回 429，實際 transport 仍只有一次。
- P2 的原反例：AI 背景清空保存再貼回標點變體，錯誤變為 user。另補重新 AI 補完、慢回覆及貼回更早 AI 文字的反例；現在保存 aiText／aiHistory，實質編輯仍保留 userText，標點與形式修改不轉換來源。提交 `3f06e8c`。
- P3：`lib/direct-models.ts` 成為保存及派送的輕量共用白名單，前端不引入 server 模型大模組。提交 `833dfd8`。
- T9 接合反例：未受理的另存請求重載後遇來源版本 409，名稱欄退回預設。真頁先重現 `甲世界 副本 != 保留可編輯的分岔名稱`，再確認原名可編輯、重載仍保留，重新核對後可另存。

## 帳號權威與派送責任

```text
帳號玩家預算／價格／原小時及累計
  → 檢查當前有效設定
  → 同帳號原子保留派送（原存檔＋操作＋requestId）
  → 真正 fetch-start／provider
  → 已知 usage 原子去重；未知結果保留缺口
  → 世界原租約／版本／journal 保存故事
```

`player_accounts` 是停止判斷、設定與費用的唯一權威；`player_dispatches` 保存有界單筆會計內容及原操作身分，沒有 Key、prompt、模型候選或故事。模型製作、NPC、後續聊天、接管感受與天上意志共用此路徑；原世界租約及精確 HTTP 回條保持隔離。未知 tokens 的進行中派送先占用同帳號保留點，其他世界不能在其回報前超賣；固定期限沿原 430 秒，沒有新增配額或自動付費重試。

原有世界的局部用量保留作故事診斷，提交前依同操作實際派送資料核對，沒有派送的失敗不冒充已花費。世界 API 的既有 `costSummary` 仍是該世界診斷，另明示 `accountPlayer`／`accountCostSummary`；產品預算及費用畫面採帳號權威。原 journal 的回覆不因帳號後續使用而改寫，前端沿既有重讀路徑取得當下帳號用量。

新帳號可直接從真正 `/settings` 調整原有預算選項及價格，不需先建世界。更新帶帳號範圍及設定版本；別帳號登入、舊版或同步失敗不靜默覆寫，輸入保留。保存不呼叫模型，也不重新送出在途請求。

## 既有費用、恢復與刪除

首次採納用單一 SQLite snapshot 讀既有世界、帳號製作空間及 `deleted_world_usage`，避免刪除搬移同刻重複計費；只初始化一次，之後的新檔與副本不再匯入故事中的帳單。預算優先保留原有 legacy 世界的明示設定；價格按既有保存時間選有效項。既有不一致的各檔小時合成最早仍有效的原起點，不藉採納延長計量小時；累計保留。

原未定案會計 marker 保留所屬來源及已入帳基礎，後續只採既有證據的差額。新的已知回覆先沿原 trace 保存，再入帳；帳號入帳暫時失敗時，以原 source／operation／requestId 核對一次，刪故事前先恢復可確認的已知費用。缺失、淘汰或 lateUsage 不補猜、不重送；未知範圍在刪來源後仍明示。T9 的 `accountSavedUsage` 讀此權威，不把它的封存資料再算第二次。

## 本機證據

- `node --test tests/model-settings.test.mjs tests/character-drafts.test.mjs`：**20/20**。涵蓋空帳號、設定提交前失敗／提交後回覆遺失、版本及帳號衝突、原小時、跨檔、另存／刪來源、新檔、並行保留、同 ID 回放、known／unknown 失敗、已知用量恢復及無派送不造局部費用。
- `tooling/verification/browser-review-account-281.mjs`：真 App Router 設定、空狀態、兩世界、受控呼叫、另存未受理→重載→409→名稱保留→重新確認、刪來源、SQLite 真正關閉重開通過；受控 transport 1 次、實付 0。固定 runtime `a84ff96` 覆驗通過：[機器紀錄](assets/player-account-review-281/evidence.json)、[帳號權威](assets/player-account-review-281/account-authority.png)、[衝突後名稱保留](assets/player-account-review-281/copy-conflict-input-retained.png)。
- 新舊成本及恢復窄覆核 **4/4**，舊完整回合／預算／正式啟用／SQLite 窄覆核 **4/4**；兩條既有 UI 回歸修正後 **2/2**，派送保存點覆核 **1/1**。完整 suite 的先前候選發現這些回歸，已保留原失敗 log 並停止過時執行，不把中途結果列為全套通過。
- typecheck 通過；lint 0 errors／4 既有 warnings；獨立本機 D1 路徑 `/tmp/quiet-hours-review-migration-281-final` 的全部 migration（含 0018）成功。第一次完整回歸由 `a84ff96` 啟動，core 先複製該版；其後 `f2d9e2e`／`0165c2d` 是窄設定欄位及 UI 變更，後續 UI 測試會動態讀來源，故不稱整份固定 a84 回歸。core 得 **1258/1264**，6 個失敗後 runner 退出，auth／Worker／source-pin 尚未執行；原 log 保留。6 個窄反例修正後 **6/6**：跨帳號 SQLite hosting fixture 改成 hook 在交易前等待、BEGIN 至 COMMIT 同步執行，普通 first/run/all 不能插進半個 batch；邏輯回合另保留原帳號 guard，新操作才可進新小時；慢實錄保存與已收到 usage 同步開始，兩者均等待，原 deadline／lateUsage 邊界不變。
- `prepared-save` 的受控 transport 實際 **0 次**，現在中央及世界診斷共同斷言 **0 次**，取代舊測試在未派送就記 unknown 1 的期望。此改動僅精確描述新操作前置失敗，不重算既存 unknown 歷史。
- 真 API 建世界後載入歷史 uncertain receipt、以產品 API 刪來源，再進另一真正 `/observe?save=…`：red 時 compact 宣稱 `估算 USD 0.00`；green 時 compact 與 CostPanel 均明示未知範圍，帳號缺口為 1、當前世界 unresolved 為 false。受控呼叫總數維持 1、實付 0。證據 `/tmp/quiet-hours-context/review-cost-browser-{red,green2}.log`。
- 修正後帳號／草稿 API **20/20**、typecheck 再過；Forecast 真頁使用帳號先存單價、新世界無 `world.modelPrices`，真正自動完成 2 回合／61 秒；中途另一世界以同模型受控製作新增約 USD 10。帳號累計 USD 10.00003、當前世界 USD 0.00002、前景一小時預估 USD 0.0012，沒有混入他檔費用，受控呼叫 2／實付 0。腳本 `browser-review-forecast-281.mjs`。本次兩支新真頁證據採 `0165c2d` 上的未提交修正工作樹，僅為 red→green；最後固定整合 tip 將再覆驗，不冒充已固定來源。
- 固定 `2355317`：API **32/32**；六回歸＋T9 **14/14**；typecheck、lint（0 errors／4 既有 warnings）、build 均通過。帳號真頁 **1** 次受控呼叫、形成真頁 **2** 次、Forecast 真頁 **2** 次均通過；帳號及 Forecast 機器證據記錄 `2355317`。fresh 本機 D1 路徑 `/tmp/quiet-hours-review-final-migrations-281` 全部 migration（含 0017／0018）成功。整份 integration 全套回歸仍由整合者最後固定來源執行。必要命令與 log 保存於 `/tmp/quiet-hours-context/review-*`。

## 遷移與回退

新增 `0018_player_account_budget.sql`，使用獨立本機 D1 路徑驗證，沒有 `--remote`、正式資料遷移或部署。正式使用前須另行套用新 schema；回退只能使用仍理解帳號權威的程式，不能回到依存檔給新額度的版本，也不能刪掉中央帳單再從各故事重建。原世界、T9 刪除會計封存及模型 Key 不移入帳號故事副本。

本輪不呼叫付費模型、不推進或刪除正式世界；受控測試不驗收真實模型語義品質。#282 的正式瀏覽器阻擋與其餘未交付工作維持原狀。
