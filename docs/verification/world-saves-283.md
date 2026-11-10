# #283：選檔、切換及舊世界承接

本票依 #281 的已確認接點實作；程式提交 `7345944`，查核基準 `249f20c3723d46f1ad7ce3d5ace11be6d575697e`。開始時原生 blocked-by 為空；沒有開始任何仍受阻的後續票。

## 可觀察交付與逐項證據

| #283 驗收條件 | 實作與驗收證據 |
| --- | --- |
| 舊世界與已形成值承接、空帳號空狀態 | `0014_world_saves.sql` 只增加 owner/save/storage identity 映射，不改既有 state、journal、version、lease。隔離 SQLite 升級逐位元比較通過；產品 API 重讀既有回合與事件。空帳號首頁及未選世界 GET 不建立種子。 |
| 共同導覽、未選檔禁止觀察／分析 | 首頁改為存檔頁，沒有假新開按鈕；共同導覽為存檔／人物／場景／觀察／分析／設定，無存檔時觀察與分析明示不可用。真正 `/observe?save=…` 路由要求帳號對該存檔有權限。T7 接入常駐新開入口。 |
| 登入先選檔、選定直接觀察、重載保留 | OAuth 成功仍導向 `/`，該頁現在為選檔；選檔連結直接到對應觀察。真頁面點兩份存檔、各自下一回合、頁面重載及 SQLite process restart 都通過。 |
| 讀寫／租約／恢復與來源存檔綁定，切換停自動 | 每個請求由固定 URL `save` 與原帳號解析到 storage identity；所有 lease、journal、trace、usage recovery、外部記憶仍使用該 identity。client pending sessionStorage 亦按該 scope 保存。慢回覆期間讀另一世界並推進、原操作恢復、錯 scope 拒絕及另一檔查不到原 receipt 均通過。真瀏覽器開始自動後切檔，快轉 browser clock 31 秒，原檔沒有新增回合；另一檔仍須明示下一回合。 |
| 兩存檔與跨帳號隔離 | 從真正人物／場景產品 API 保存來源，再由既有城市契約經 `/api/saves` 建立兩個獨立世界；沒有安裝世界 fixture。實際首頁選用、重載、各自續玩；另一帳號 API 404、觀察路由返回空選檔頁。 |
| 規則模式保存同檔、名稱一致、不自動推進 | 兩份都從 0 回合開始，選檔／重載／重新選用不變；各自明示下一回合後為 1。header 顯示所選存檔名稱。 |

新增保存邊界以 client 持續保留的 UUID 去重，`worlds` 與 `world_saves` 經同一 D1 batch 原子提交。相同 id、不同內容回 409；提交前故障不留下半份存檔；提交後回覆遺失以原 id 找回同份屬性／容量，不重新形成。這些故障另外經真 SQLite API 測試。

模型 Key 與站主／玩家 dispatch 計數維持真帳號範圍，不因每檔不同 storage identity 重置。reservation id 包含存檔 scope。兩檔使用同帳號 Key、各自一次受控呼叫後，每檔帳號用量均顯示 2，故事自己的實際呼叫各為 1。

## 命令與結果

- RED：`node tests/run-activities.mjs tests/world-saves-api.test.cjs` 初次因缺少 saves API 失敗；加入列檔後通過舊故事；下一 slice 因缺少 `saves.POST` 失敗，再實作原子建立與恢復。
- 最終本票：同命令 **8/8**（含慢回覆、原操作恢復、跨帳號、原子建立及帳號用量）。
- 周邊 regression：`node tests/run-activities.mjs tests/world-saves-api.test.cjs tests/operations-api.test.cjs tests/city-creation-api.test.cjs tests/recall-api.test.cjs` **64/64**；當時本票 7 項，其後只增加帳號用量測試。
- `node tests/run-auth.mjs` **38/38**。既有 auth／Key／reset 案例現在明示載入既存舊世界資料；新增新帳號登入後仍沒有世界的反例。這些相容 fixture 不作為建立成功證據。
- `node --test tests/model-keys-workerd.test.mjs` **1/1**，實際 Workers/D1 Key 與大型 backup 相容。
- `node --test tests/world-saves-migration.test.mjs` **1/1**，既有隔離 SQLite 逐位元升級。
- `npm run typecheck` 通過；`npm run lint` **0 errors／4 既有 warnings**；`npm run build:test` 通過；`git diff --check` 通過。
- `PLAYWRIGHT_MODULE=/tmp/quiet-hours-browser/node_modules/playwright CHROMIUM_EXECUTABLE=/tmp/chromium node tooling/verification/browser-world-saves-283.mjs` 通過：6 組真路由觀察、兩份存檔、切檔停止自動、磁碟 SQLite 重啟、0 模型呼叫、0 page errors。

曾誤把需 `QUIET_HOURS_AUTH_BUILD` 的 `model-keys-api.test.cjs` 傳給 activities runner，因此該次 64/65，失敗為載入參數而非產品斷言。已改用正確 auth runner，38/38；上列 regression 亦重新執行 64/64。

## 畫面與版本

[機器證據](assets/world-saves-283/evidence.json) 記錄每次實際 origin、URL、頁面 title／h1、建立 API HTTP status、runtime commit `7345944` 與本機登入替身條件。關閉並重啟 server 時 origin port 改變；同一磁碟 SQLite 保留。

- [空存檔首頁](assets/world-saves-283/empty-saves.png)
- [河岸存檔第一回合](assets/world-saves-283/first-world.png)
- [山城存檔獨立第一回合](assets/world-saves-283/second-world.png)

## 範圍與後續接點

這是 T2 交付，不代表 #281 全部完成：五步開局、完成卡及原始開局屬 T5–T7，另存／刪除屬 T9，模型帳號預設與原流程面板屬 T4。

`/api/saves` 暫沿既有城市來源契約承接真產品建立邊界；T7 必須換接完成卡／已確認開局，不能把此處舊尺度形成當作新建角規格已完成。來源更新不會變更任何已保存世界；建立重試先查同 id 的 durable 結果，才讀來源。

獨立建角暫沿 `/api/world?workspace=account` 的明示帳號 operation namespace，consumer 為 T3。它只承接製作及模型設定操作，沒有種子人物、事件、世界存檔或生活推進能力；T4 負責把帳號模型預設與這個接點整合。非法／跨站 POST 在初始化前拒絕。一般無選檔讀取不進此 namespace。

`0014` 在本機新建及升級隔離 SQLite 已驗收，未跑正式 migration。回退程式必須保留 `world_saves` 映射及新 storage rows；舊程式只認原帳號 row，無法完整呈現新增存檔。不可 drop 新表後宣稱可無損回退。這次未改寫／刪除舊世界。

本票沒有付費模型、正式世界操作、正式遷移、合併 main 或部署；瀏覽器使用本機 auth cookie boundary，沒有以它冒充真實 OAuth 或正式站驗收。受控 transport 測試不代表真實模型語義品質已驗收。
