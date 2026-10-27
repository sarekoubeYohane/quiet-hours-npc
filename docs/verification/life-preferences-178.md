# #178 主觀喜好驗證（2026-10-27）

本地模型 transport fixture；沒有付費模型、正式世界操作、合併或部署。工程參數先記錄於 [基線](../design/life-preferences-baseline.md)，不冒充使用者已確認值。

## 紅綠與回歸

- 第一個世界 API 垂直案例原本因無法處理 `preferenceUpdates` 而回覆 502；接入正常決策、來源驗證、整輪提交、SQLite 保存及下次投影後通過。四角色一輪仍只派送四次 NPC 決策，沒有額外評價呼叫；原操作 ID 重送不重複更新。
- `node tests/run-activities.mjs tests/preferences-api.test.cjs`：7 個案例涵蓋形成／修改／保留／撤回、本人與他人輸入邊界、相同合法活動的不同喜惡、純 interpretation 不持久化、外來／過期／不存在／世界秘密引用拒絕、共同 4 項上限、較後角色失敗整輪回復、保存前後故障與版本衝突、舊世界、現行容量交換與 trace 釋放缺口。
- 聯合回歸 `preferences-api`、`cognition-api`、`model-contract-api`、`life-needs-api` 在整合 #173／#175 後通過 35／35（其後新增的同活動不同喜惡案例另外通過）。保留既有認知來源、記憶及模型契約。
- TypeScript、變更範圍 ESLint、`git diff --check` 通過。

## 真實應用瀏覽器

`tooling/verification/browser-preferences.mjs` 使用 Chromium 143、真實 WorldApp、世界 GET／POST、實際 JSON／SQLite 保存，僅替換模型 transport。兩輪四角色共 8 次正常決策，沒有獨立喜好模型呼叫；核對分析入口的主觀喜好、情境、來源理由、保存重載、撤回、有限痕跡及 console 無錯誤。

證據：`assets/life-preferences-178/preference-saved.png`、`preference-withdrawn.png`、`evidence.json`。程式優先使用既有 browser-runtime 環境變數；本次環境的 `/tmp/chromium` 是空檔，改用有效的獨立 runtime 路徑，沒有改應用處理或伺服器期限。runner 補送既有回合政策 header，沿用瀏覽器 fixture 修正後的 SQLite 時鐘。

## Review 與限制

自查來源一律在派送時可見本人記憶集合核對，撤回痕跡不進 NPC input；同情境主題優先更新原身份。將現行喜好投影計入原 88 KiB，保存資料計入原 208 KiB；滿現行容量只可明示撤回，trace 有界淘汰明示計數。整合分支另由總體雙軸 code review 核對跨票接線。

trace 最多 24 筆／16 KiB，來源文字可以隨既有記憶消退；UI 明示缺失，不重建心理史。固定 transport 只證明機制接受角色主觀評價，不證明真實 NPC 自然形成喜好、不證明正式站已驗收，也不關閉泡茶 loop 相關票。
