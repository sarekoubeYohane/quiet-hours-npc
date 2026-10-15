# 記憶與信念核心：三票整合驗證

此紀錄描述供審閱的整合版本，**不表示三張 PR 已合併、網站已部署或正式服務已驗收**。交付仍為 [#53／PR #63](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/63)、[#54／PR #64](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/64)、[#55／PR #68](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/68) 三張獨立 PR。整合分支只保留可檢視的衝突解法與相容性測試，沒有整合 PR，也未移動 main。#56 唯讀 UI 未批准。

## 固定來源

基準為 main `26cfc8ae192f2f2d361c97284c3d6bcd1d3d303b`。本紀錄前最後一個 runtime 提交為 `396f78dc0c60db9e0b1013624c613512f1d340c8`，完整 tree 為 `69428d49f64c722b1e50e1fb86bc1a026cb9d821`；本紀錄本身只新增文件。

| 元件 | 本機／遠端 PR 來源提交 | 相同來源 tree |
| --- | --- | --- |
| #53 信念／關係標籤 | `1b172d6`／`1ce88751` | `a8da3fcf36bfce1a35c7014d345db3adffe90a21` |
| #54 摘要／遺忘 | `c97d83e`／`a9de084` | `1e4534e2d1a4629fa1b87f2148789ca5a84d8dc4` |
| #55 主動回想及後續修正 | `533252a`／`d227842c` | `290c7412d95f5a0acec89291970acabc8149af3e` |

PR 的提交 ID 可能因連接器上傳而不同；相同 tree 才是來源內容等價的證據。整合另外包含候選公平分配、完整召回投影及最終輸入重排等組合修正，不能宣稱三張 PR 原樣即可無衝突合併。

## 實際執行結果

外部聊天、Embedding 與向量傳輸使用可控替身；世界 API、JSON 序列化、SQLite 保存、租約／CAS／operationId 邊界實際執行。未呼叫付費模型或正式 Vectorize。

| 檢查 | 結果 |
| --- | --- |
| `npm test` | **216 通過、0 失敗**：190 世界 API＋24 auth/key＋2 Workers/D1 |
| `npm run typecheck` | exit 0 |
| 變更 runtime/tests ESLint | exit 0 |
| `npm run build:production` | exit 0 |
| `git diff --check` | exit 0 |

ESLint 範圍：`lib/activities.ts`、`lib/cognition.ts`、`lib/memory.ts`、`lib/models.ts`、`lib/world.ts`、`lib/recall.ts`、`lib/recall-services.ts`、`app/api/world/route.ts`、三份 cognition/maintenance/recall API 測試及其編譯 runner。沒有宣稱修復既有全域 UI lint。

## 整合接點與審查修復

最初 #53／#54 衝突在 README、記憶契約、activities、memory、models、world 及測試 runner；加入 #55 時另有三種 runner 的模組清單、回想迴圈與 memoryStateBytes 接點衝突。整合保留各票功能與既有世界租約、CAS、operationId 重放，不直接選一邊覆蓋另一票。

- 三類更新共用每次4項／8 KiB輸出、88 KiB輸入；記憶／認知／索引中介資料受208 KiB整體限制，兩種追溯共用24筆／12 KiB。
- 認知與記憶先組成完整候選再驗容量，允許同次明示釋放追溯後的合法淨結果；無效最終認知仍回復整回合。此修正亦獨立補入 #53。
- 記憶及認知整理候選合計最多8。記憶側4個名額以短期、長期、追溯輪流分配，每個非空類別至少保留一個，避免同時有認知壓力時追溯入口全部被截掉。
- 回想返回完整安全主觀投影，包含 `rememberedSources`／`unresolved`，排除 origin、reason、事件／診斷。完整召回優先保留於最終 `self.longTerm`；可選初始長期／認知按剩餘預算重新選入。全文僅送一次，回想完成訊息只帶 ID／版本 handle。
- 以實際最終模型輸入重建可引用記憶、認知及已知人物白名單。從未展示的來源、沒有召回的省略記憶，以及初始看過但最終省略的記憶，都不能提交修改。必要短期加完整召回本身超限時，第二次聊天前整回合回復，不簡化搜尋或略過回想。
- #55 付費 guard 不在邏輯回合中途重置每小時用量。所有世界提交以 manifest-aware 短期 FIFO 計入派生中介資料；不刪長期或增開模型呼叫。建立新 manifest 前同時檢查目前 NPC 及已提交快照的容量，保證稍後失敗時不會因保留派生 manifest 而改動應回復的短期。

Standards 初審的文件狀態矛盾已修正；非阻擋的取消等待 helper 重複建議保留。Spec 初審的追溯候選飢餓、召回來源引用未實際展示兩項缺陷已依 API Red→Green 修正並複審。後續 #55 跨小時預算、manifest 總容量與回復快照容量的實際缺陷亦有各自回歸；沒有把未重現的猜想列為已修缺陷。最終 runtime 固定點 `396f78dc` 已完成兩軸複審：Standards 0項文件規範違反、1項非阻擋 helper 重複建議；Spec 0項剩餘問題。

## 實際 Red → Green

| 案例 | Red | 最終 Green 證據 |
| --- | --- | --- |
| 24追溯滿額，同次認知更新及釋放記憶追溯 | 中間容量檢查回502 | 合法淨24筆可提交；無效最終認知仍拒絕／重放 |
| 三種記憶壓力加認知壓力 | 前4個候選全無trace，合法釋放回502 | short／long／trace各至少一個handle，合計≤8，合法淨容量成功 |
| 回想省略摘要及其未解來源 | lean回想沒展示必要來源，無法忠實濃縮 | 8個來源及unresolved真正出現在最終輸入，建立信念與版本+1摘要成功 |
| 主觀邊界負例 | Spec審查指出canonical驗證可能接受未展示來源；負例隨修正新增 | 猜測未知來源、未召回記憶及最終被省略記憶均502；整回合回復及精確重放 |
| 完整必要召回加短期超88 KiB | lean資料缺漏時錯誤200 | 第二次聊天前502，保留首次已知用量且重放不再dispatch |
| 回想跨每小時視窗 | 中途清掉token guard，近上限仍200 | 429、僅一次聊天、沒有Embedding；成功路徑兩次聊天tokens／重放正確 |
| 接管介入與64筆manifest逼近208 KiB | 合法500字介入後總量超限 | 只FIFO最舊短期及投影，長期不變、沒有模型呼叫 |
| 較早NPC讓後續NPC短期變小後回想失敗 | 派生manifest使回復快照被FIFO改動 | 派生副作用前以目前／已提交快照較大容量驗證，失敗完整回復 |

## 可重現入口

此版本沒有新增記憶 UI。未部署本整合版本時，不能靠線上畫面驗收新功能。

| 操作 | 預期與證據 |
| --- | --- |
| `node tests/run-activities.mjs tests/cognition-api.test.cjs` | 信念／關係、矛盾、可見引用、共享候選及追溯淨容量案例通過 |
| `node tests/run-activities.mjs tests/maintenance-api.test.cjs` | 主觀摘要、來源遺忘、容量與別名不復活案例通過 |
| `node tests/run-activities.mjs tests/recall-api.test.cjs` | 主動回想、完整來源投影、預算／水位／逾時／回復及重放案例通過 |
| `npm test` | 重現本紀錄216個案例，無需正式服務Key |
| 於已登入線上站執行 `fetch('/api/world').then(r=>r.json())` | 只讀自己的世界；檢查 `version`、`world.characters` 與 `recallUsage`。未部署時欄位可能缺少，不能視為新功能驗收 |
| 日後另獲授權部署後，檢查正常推進POST及重載GET | 有效候選的ID／版本／來源／追溯一致；相同operationId回覆重放。自然語言指示不能保證模型選擇特定整理操作 |

正式 Vectorize／Embedding 資源、非同步索引可查性、實際取消與帳單、付費 smoke、真人模型語意品質及正式站操作仍待另行驗收。沒有執行正式遷移、重置世界或開通付費服務。
