# #82 已發生費用估算驗證

測試介面沿用已確認的世界 API＋瀏覽器；API 使用真正的路由、SQLite 暫存資料庫、可控 Date.now 與邊界 fetch 模擬模型，不使用即時報價或真實 API。

## TDD 記錄

- `node tests/run-activities.mjs tests/costs-api.test.cjs`：先新增保存零價與來源讀回案例，Red 400 !== 200；實作 set-price 與保存，Green 1/1。
- 加 immutable cohort／快取／hour rollover／重播／重置案例，Red 0 !== 8；實作派送與回報費用，Green 2/2。
- 加已知價格失敗與 confirmed-CAS 保存案例，Red 2 !== 10；擴充既有單一 SQL paid delta 合併，Green。重播使用保留 durable journal 的衝突 fixture，避免以外部抹除 journal 的非法 fixture 期待重播契約。
- 加混合模型、未知與舊統計、零價、浮點溢位、競爭 hourly window 案例後 Green 6/6。
- 加 HTTP429 自帶 usage 案例，Red 0 !== 2；先保留可解析 usage 再拋出原供應商錯誤，Green 7/7。

固定數值：每次輸入 1,000,000、輸出 500,000 tokens；輸入 USD1／輸出 USD2 每百萬時每次 USD2，四名角色合計 USD8。更新為輸入3／輸出4／快取0.5、快取輸入200,000後每次4.5，四次18，累計26。缺快取價時已知小計每次1.8，整輪7.2且標記部分未知。

每個已發生價格版本的 cohort 有供應商、模型、不可變單價／來源／日期、calls、輸入／輸出／快取 tokens、已知小計、未知次數、最後派送時間。hour與total分開保存，costSummary可由世界API回應觀察。confirmed-CAS衝突將同一價格版本的本操作差額與既有計數放在同一SQL更新，不覆寫競爭世界或租約。

瀏覽器驗證與整合全套檢查見後續整合驗證紀錄；本文件不把未運行項目宣稱通過。沒有正式資料庫操作或真實付費壓測。

## 實際結果（2026-10-16）

- API regression：`node tests/run-activities.mjs` **213/213通過**；`node tests/run-auth.mjs` **32/32通過**。
- `npm run typecheck`、`npm run build`、新增成本檔案的 ESLint 與 `git diff --check` 通過。
- `npm test` 首次在 Workers 固定模組清單漏載新 costs.js 而啟動失敗；已補齊測試 fixture 模組，單獨 `node --test tests/model-keys-workerd.test.mjs` 1/1通過，再執行完整 `npm test` **255/255通過（213＋32＋10）**。全repo lint仍有既存pixel-world/world-app規則錯誤，新增成本模組／介面／測試針對檢查通過。
- 真正 Chromium **PASS**：`tooling/verification/browser82.mjs` 操作真實 WorldApp→世界API→SQLite；驗證空白／負值／Infinity／NaN／來源／日期拒絕且無mutation、明示零價、小數保存、取消、reload、當時來源與日期不變、部分快取價、missing usage未知、失敗有用量仍累計、實際切換另一模型且無價格、站主未知費用分列。固定UI案例已知小計 USD0.003→USD0.00375→失敗後USD0.005，與API讀回一致。腳本可依tooling README重現，未使用真實付費API。

補充硬化：兩個競爭寫入各自合法但總和超出浮點範圍時，SQLite加總溢位經後續JSON保存可能變null；新增世界API重現案例先Red（錯誤標完整），再將非有限／null費用依據轉明確未知，8/8成本測試Green。避免極大合法單價在CAS衝突後被誤顯示免費。padding修正後再跑完整Chromium82全部PASS，並目視確認內距。

最終硬化後再執行 `npm test` **256/256通過（214＋32＋10）**、`npm run typecheck` 通過。
