# 驗收場景大型世界備份修正

日期：2026-10-16（Asia/Taipei）。基準 main：`d18ce8a9cf883d39f4e6fca37e704e00598cf5c2`（PR #102）。來源：使用者要求修正 [正式站複測的暫存容量阻擋](minimal-acceptance-production-2026-10-16.md)。契約見 [最小場景設計](../design/minimal-acceptance-scene.md)。

## 問題與修正

正式世界第 123 回合、D3 03:45，原始故事 JSON 超過舊 512 KiB 上限，無法進入驗收。此上限是應用程式對未壓縮備份所設，不是 D1 拒絕。未讀取正式資料庫或原始 payload，實際正式世界大小仍未知。

改用版本化 `gzip-base64-v1` 無損備份，512 KiB 上限計算保存的 base64 字串。原始／串流解壓限制為 2,000,000 bytes；超限或壓縮／解壓／格式錯誤時保留原資料並拒絕切換。新備份沒有裁切故事、角色、記憶或活動；共用帳號設定及已付用量仍沿原契約保存。同一世界列、租約、版本及操作日誌仍做原子提交，沒有 schema migration 或新服務。API、模型輸入及日誌回覆均不包含備份。舊版 `acceptance.original` 仍可返回。

## Red → Green 與判別

以已批准的世界 GET／POST seam 執行：

```sh
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-activities.mjs tests/acceptance-scene-api.test.cjs
```

- 新增大世界進入／重讀／返回測試：初次 6 pass、1 fail，HTTP `502 !== 200`，錯誤與正式站相同；完成修正後定向 9／9 通過。
- 最小重現只增加種子世界一個事件的 UTF-8 文字，重現不依賴角色模型、網路或歷史操作日誌。純文字 1,278,000 bytes，gzip／base64 約 5,932 bytes；證明未壓縮上限擋住可完整壓入的小備份。中文按 UTF-8 計量本身正確，不應以 JS 字數放寬；日誌不含備份，因此不是備份重複導致此拒絕。
- 原故事含換行與 emoji，返回後逐欄核對事件及角色完全相同、時間／回合／預算／裁定保留；測試故事事件不混入。
- 新邊界覆蓋原始超限、高熵資料壓縮後超限、非法 base64／非 gzip／解壓超限／不支援格式，以及舊版未壓縮備份返回並保留 paid calls 與 savedDecisions。

## 驗證

- `pnpm test`：299／299 通過（世界／活動 257、身份／API 32、Workers／D1／遷移 10）。
- 真實 Workers／D1：超過 512 KiB、含 6,000 組不同 SHA-256 片段及中文／emoji 的故事，透過真實 POST 進入、第二 session GET 重讀、POST 返回、再次 GET，完整事件／角色及已付用量相同。此為合成 fixture，不是正式世界副本。測試中的兩次失敗先後是 fixture 大小不足與漏填既有必填 mode，已更正；不是 runtime 缺陷。
- 真實 Chromium／WorldApp／API／SQLite：超過 1 MiB 原世界，五組 PASS。涵蓋取消、跨分頁、餐點消耗／重載、店主授權／借杯／攜帶／洗淨／歸還、中間水／中斷、返回完整原世界及保留 paid usage。桌機及 390px 無 pageerror／橫向溢出。
- TypeScript 通過；變更檔 ESLint 通過，0 warnings。
- Production build 成功，輸出 `quiet-hours-npc`／`APP_ENV=production`。
- Standards 初審 0 項問題。Spec 初審發現有效 gzip 包住 `{}` 時被誤當世界、退出會遺失備份；補上必要故事結構檢查（進入及解壓／舊備份返回前皆驗證，不用種子或 normalize 修補）與真 API 回歸。新增 malformed JSON shape case 初次 `200 !== 502`；修正後 9／9 通過。最後完整重跑 299／299 通過；Standards 與 Spec 覆核各 0 項未解。Spec 另重跑原真 API probe，確認 502、原場景與備份保留、GET 200。

## 限制與發布

未部署、未改正式資料、未呼叫付費模型。正式世界是否可壓入需合併部署後再驗證；不可宣稱正式站已修復。極端高熵資料仍可能超過 512 KiB 壓縮備份上限；D1 整列（含其他用量、操作日誌）的既有容量限制也仍生效。

回退至不認得壓縮備份的舊版前，必須先結束驗收返回原世界。若新備份損壞，不得用種子覆蓋原世界。新版可讀回舊版未壓縮備份，沒有強制轉換舊資料。
