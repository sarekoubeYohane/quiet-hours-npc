# #290：當前進度另存與簡單刪除

母規格 #281。T9 開始時重新讀取最新票文／留言（0）與原生 blocked-by，唯一前置 #283 已於 2026-11-09 12:17:21Z closed；獨立 worktree 自 integration `0f279ca` 開始。產品提交 `c98ed80`、帳務缺口與模型偏好修正 `d407ab7`；本票真頁 runtime 固定 `4401504`。

後續整合審查重新開啟 #283（帳號玩家預算權威 P1），因此本票保持未結案，交唯一 review 修復者接合；本文件不是整份 #281 完成宣告。

## 逐項驗收

| #290 條件 | 證據與結果 |
| --- | --- |
| 承接完整已存生活，不重骰／不推進 | 透過真正人物、場景與城市產品 API 建世界，開始一個正常活動後另存；比較人物、記憶、需求、電量、物件、活動與所有故事欄位，只有 `aiUsage` 不複製。副本維持同一回合及時間，只有使用者下一回合才前進。沒有重新呼叫建角或五步流程。 |
| 原始開局與另存時間點分清 | `original_opening` 按原存檔原值獨立承接；`saved_from` 另外保存來源 id、名稱、版本、回合及時間。舊檔原開局缺失仍明示不可用，不從現況補造。新原始開局的完整正向旅程待 T7 提供真正保存接點後做整合回歸。 |
| 獨立引用、刪來源後仍可續玩 | 全份已存生活 JSON 自足，不引用來源世界的存活。人物的真實長期記憶先由正常模型決策選留，再正常 recall 形成來源索引；另存後刪來源及其向量，副本仍以自己的 storage scope 正常重新索引並回想原文。不是安裝人物／記憶 fixture 冒充此旅程。 |
| 不複製 Key、實際用量、請求或回條 | 副本沒有來源 `aiUsage`，新世界 row 使用空 journal／lease，沒有複製 private decision traces 或外部 index manifest；Key 從帳號範圍使用，期限不變。副本正常活動與既存結果保留，沒有重送原來的模型請求。 |
| 不抹掉已花費用 | 即使 RECALL_ENABLED=false，刪除也把原 `aiUsage`、已知成本及未確定用量原子保存至帳號 `deleted_world_usage`。純讀彙總以同一 SQLite snapshot 讀 active、account authoring 及 deleted records，避免刪除同刻重複統計。一次受控呼叫／已知單價在另存及刪來源後仍維持同一帳號總量。這個彙總目前不是玩家派送停止權威；P1 由唯一修復者收斂。 |
| 重送、回覆遺失、版本及未完成操作 | copy/delete 使用 owner+原 operationId 的獨立 durable receipt；同 id 不同內容回 409。世界／映射／receipt／刪除帳務在 D1 batch 同時提交；提交前失敗不留半份，提交後回覆遺失沿原 id 找回。active lease 或 pending journal 先恢復原操作，未複製／丟棄進行中請求。來源版本變更明示 409。 |
| 永久刪除與一次確認 | 真頁確認包含名稱、回合、時間與無法復原；沒有回收桶、保留期或多層確認。刪目前檔返回選檔，刪最後一檔顯示空狀態。最終真頁共刪三份，每份各一個確認。 |
| 來源刪後副本、其他世界及資產保留 | 刪除只操作原 storage namespace；實際來源世界刪除後關閉 server、重啟同一磁碟 SQLite，副本可再進一回合，另一份仍為零回合。人物庫及場景庫前後重讀完全一致。 |
| 模型偏好與帳號分離 | copy 在同一 transaction 將來源 `save:<id>` 的已存偏好獨立複製到新 target；重送或後來修改來源不改副本。delete 只刪該 save target，帳號預設、其他檔與共用 Key 都保留。與 T4 API 相容測試通過。 |

`save_tombstones` 防止已刪存檔因舊 create 回覆遺失而被重新建立；copy receipt 也不會把使用者後來刪除的副本復活。它們只有技術去重身份，不能還原故事。

## 終局未知帳務反例

已具體驗證歷史 fault：真產品 API 建立世界後，在 SQLite 設置已終局 uncertain、空 `usage` marker、無 durable trace 的舊資料。原操作 POST 重送回 502，GET `usageRecovery` 仍為 pending／unknownRange；它確實無法 finalize。初版刪除在這裡回 409，因此不能把它說成完整可恢復。

修正後，刪前沿原 marker 嘗試套用已存在且可確認的 paid evidence，完全不派模型。仍未知的 marker、eviction 範圍與白名單 accounting facts 會隨原實際用量原子留在帳號 archive；不保存 prompt、candidate、人物記憶／世界 snapshot 或 Key。故事可刪除，帳號讀回仍明示 `unknownAccountingRanges`，刪除回條亦顯示 `unknownRange` 與保留的操作數。沒有把未知費用說成零，也沒有永久禁止刪除已確認保存的故事。

外部索引清理有十秒有界等待及同一原操作回條。刪除世界／manifest 後清理失敗會明示 `externalCleanup: pending`；原操作恢復可完成同一批向量清理，不復活世界、不重派模型。測試覆蓋先失敗、再恢復及副本新 scope 回想。

## 執行證據

- copy 的 RED 為 `/api/saves` 回 400；實作後獨立副本 201、重送同一 id 200。
- delete 的 RED 為操作不支援；實作後來源 404，副本正常續玩，資產保留。
- 模型偏好 RED 為副本回 `source: account`；修正後為獨立 `source: save`，且來源變更不覆寫副本。
- legacy terminal uncertain 的 RED 為永遠 409；修正後可刪且未知帳務仍可讀。
- `node tests/run-activities.mjs tests/save-management-api.test.cjs tests/world-saves-api.test.cjs tests/operations-api.test.cjs tests/recall-api.test.cjs`：**64/64**，其中 T9 **8/8**。
- `node --test tests/model-settings.test.mjs`：**4/4**（其後 T4 純補證再加入同源版本失效反例，最終整合另驗）。
- `npm run typecheck` 通過；`npm run lint` **0 errors／4 既有 warnings**；`npm run build:test` 通過；`git diff --check` 通過。
- `PLAYWRIGHT_MODULE=/tmp/quiet-hours-browser/node_modules/playwright CHROMIUM_EXECUTABLE=/tmp/chromium node tooling/verification/browser-save-management-290.mjs`：**通過**，5 組真路由、3 次刪除各一次確認、0 模型呼叫、0 page errors、磁碟 SQLite 重啟。

真頁路徑：實際 API 建兩世界 → 首頁選檔 → 第一回合 → UI 另存並在 commit 後丟回覆 → UI 恢復原操作、只出現一份副本 → 一次確認刪來源 → SQLite restart → 副本續玩 → 觀察內刪當前檔回選檔 → 刪最後檔回空狀態，原人物／場景保留。

首兩次 browser 試跑在刪除完成的轉頁期間讀取舊 execution context 而中斷；沒有判為產品刪除失敗。runner 改為等待來源管理區塊 detach 及新頁資料完成，最終上述完整試次通過。

[機器證據](assets/save-management-290/evidence.json) 保存 origin、URL、title／h1、確認全文及版本。

- [另存接續同一進度](assets/save-management-290/copied-progress.png)
- [來源刪除、其他檔與副本保留](assets/save-management-290/source-deleted-copy-independent.png)
- [最後一檔刪除後空狀態](assets/save-management-290/last-save-deleted-assets-retained.png)

## 遷移、回退及待接合項目

`0015_save_management.sql` 新增操作去重回條、刪除後帳務與 tombstone；只在本機隔離資料庫執行。`0016_model_preferences.sql` 由 T4 提供，copy/delete 的偏好與故事在同一 transaction 接合。未執行正式 migration、合併 main、部署、正式世界推進／刪除或付費模型。

刪除是單向操作，故事沒有回收或還原能力。回退程式必須保留新存檔映射、去重／tombstone、帳務 archive 及未知證據，不能 drop 新表後宣稱無損回退；舊程式也無法完整呈現多檔或新的帳務範圍。

目前交付為 ready-for-fix 接合，未關票：

1. #283 P1 帳號玩家預算／用量停止權威由唯一修復者處理，不能把本票只讀費用彙總冒充該權威。
2. 待唯一修復者處理的 UI finding：copy 在受理前斷線、頁面重載、來源再變更，恢復得到 409 後 pending 清除，input 會退回預設名稱，雖 error 字串仍有原名。應保留成可編輯 draft；本票的已 commit 回覆遺失恢復真頁已通過，未把它當成此反例也已通過。
3. T7 完成後需用完成卡／五步建立替換現有城市建立測試來源，回歸正向原始開局的另存及重開；本次沒有用測試捷徑安裝世界冒充建立成功。

受控 transport 僅證明採納、持久化及隔離，不代表真實模型語義品質已驗收；瀏覽器是本機 auth cookie boundary，沒有冒充正式登入或正式站驗收。

## 完整腳本與舊檔 fixture 修復紀錄

固定 runtime `4401504` 執行 `npm test`，第一組 core **1264 項、1261 通過、3 失敗**，耗時約 872 秒，exit 1 後依現行 runner 停止，後續各組未在該次執行。三個失敗全部是既有 file-SQLite 測試／研究 runtime 假設空帳號 GET 會建立 seed：人物形成、d100 保存及正式精神電量 close/reopen。新選檔規格正確回 409，該舊前提已不成立。

沒有為讓測試通過恢復產品的隱式種子。另建隔離 validation worktree，將 `pursuit-runtime-228.mjs` 加入明示 `legacySeed` fixture 選項，僅舊檔相容測試及原研究 runner／exporter 採用；readonly 模式與產品真路由不會建種子。既有 row 亦不被重新播種。這些研究 fixture 不計入本票建立世界的產品旅程證據。

- `node tests/run-activities.mjs tests/character-attributes-api.test.cjs tests/d100-api.test.cjs tests/formal-mental-enable-api.test.cjs`：修復組 **38/38**，包含原三個失敗。
- `node --test tooling/experiments/pursuit-runner-228.test.mjs`：**21/21**，source-pin 反例完成並還原。受控 forwarded journey 10 trials／80 advances、真 SQLite reopen、realPaidDispatches=0。

fixture 修復提交原為 validation branch `5caf6f0`，已 cherry-pick 為本分支 `bf337cd`。原 T9 worktree 的 full run 與先前真頁 pin 在 fixture 修復期間保持 tracked source 不變；source-pin 測試在另一個 validation worktree 執行。full run 結束後才合修復並再次合最新 integration。

本段不把「原失敗組修復通過」改寫成完整 `npm test` 已全綠；整合 P1／後續票完成後仍須在最終 integration 執行全套。
