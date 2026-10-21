# #116 世界確認耗時驗證（2026-10-21）

起點 main `7e470ef`。本紀錄是明示模型傳輸替身、真實世界 API 與 SQLite JSON 保存的本機結果，不代表正式站真實模型已通過。

## TDD 與重現

已確認測試邊界：世界 API `POST` 推進／`GET` 重讀及操作重送；使用既有 SQLite 測試保存，只替代外部模型傳輸。未改動正式站資料。

1. 新增 `tests/activity-time-api.test.cjs` 第一條跨回合案例。在未修復程式，以舊核准回覆（沒有新 timings）及一般估時15重現 HTTP502、`泡茶活動至少需要三十分鐘。`，turn0、未提交規則與物件。
2. 帶整組 timings 的新契約先得到 HTTP502 格式拒絕。修改首次核准、已存規則重用、活動與階段安排後，同一 API 案例通過：茶30完成後咖啡45，2次NPC、1次裁定，共3次實際派送；重送與讀取不增加派送。
3. 逐步補上短時間／對齊、非法候選、保存故障、其他活動完整效果與整組核准資料驗證。每次沿同一 API 邊界重讀，未測私有 helper。

## 可重現命令與結果

- `node tests/run-activities.mjs tests/activity-time-api.test.cjs`：6/6 通過。
- `node tests/run-activities.mjs tests/activity-time-api.test.cjs tests/routine-api.test.cjs tests/routine-first-approval-api.test.cjs tests/routine-sharing-api.test.cjs`：此前新增前4項時44/44通過；新增2項另已執行通過。
- `pnpm test`：新增前5項時，活動318、auth32、真實Workers/D1 10，全數通過。新增第6項另已執行通過；最終整合仍須重跑完整套件。
- `pnpm typecheck`：通過。
- `pnpm lint`：0錯誤，4項既有警告（img與useEffect dependency）。
- `git diff --check`：通過。

## 已觀察結果

- 估15／確認30可開始、完成前只有準備狀態，到期重讀有完整飲品；估60／確認15在15完成。
- 5→15、20→30、90→90；0、負數、91、null、字串、缺少分鐘均HTTP502原子拒絕，保存已知2次付費派送且同操作重送不再呼叫。
- 首次 offer 不含預設 minutes；完整咖啡館6項耗時一併保存，重讀後新咖啡活動重用45，無裁定。
- 飲用、清洗、歸還、簡餐確認30時首回合不提前完成，第二回合完成；整串5次NPC、1次裁定。
- 缺整組timings、缺項、重複項或多餘欄位均原子拒絕。
- 後續咖啡回合保存故障保留先前已完成茶、原規則、原物件與供應；重送不再付費。

## 待整合驗證

#117 明確上限、#118 開放式語意、#119 續做中斷／控制入口及應用瀏覽器驗證由下游整合。正式站需部署本次版本後核對版本再驗收，不自行合併或部署。
