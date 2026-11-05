# 精神電量起點 #257

此切片實作權威電量、清醒自然消耗、實際睡眠暫停與觀察。正式政策仍受 #256/#263 阻擋，沒有正式數值預設；本文件不代表真實模型心理語義已驗收。

## 明示隔離測試

僅 `APP_ENV=local` 或 `test` 可設定 `MENTAL_ENERGY_TEST_POLICY` JSON。全部欄位必填，沒有 fallback：

```json
{"version":1,"kind":"test","id":"isolated-energy-257","initial":10,"maximum":20,"awakePerHour":12,"regulationCost":7,"lowAt":10}
```

上述全部數字均為測試參數，不是產品平衡。首次成功 `advance` 才保存每位角色的 policy、唯一 value、activatedAt 與 updatedAt。後續環境 binding 更改不覆寫已保存政策；GET 不回填。沿原 operation journal 與世界 JSON 原子提交，沒有新增資料表或獨立時鐘。

`lib/mental-energy.ts` 的 `mentalIntervals` 使用 `activeBodyMinutes` 取得既有活動的實際睡眠交集；`settleMentalInterval` 結算這一個實際世界區間。首次確認的睡眠沿 `activity-lifecycle` 的實際恢復分鐘，從同區間扣除清醒消耗；從未截斷的區間起值重算，避免零電量後錯誤補發。自然結算紀錄由 `kind=natural` 和 from/to 身份定向替換，32 筆容量僅限制觀察歷史，不限制權威結算時間。

後續心理效果與付費調節整合須保留同輪其他收支，不能讓首次睡眠結算覆蓋它們；本切片尚無心理效果／調節 writer。

NPC 的 `self.mentalEnergy` 僅有 feeling 和 canRegulate；觀察者的 value、policy、時點、history 不在角色輸入。文字心情與四種身體需求分開。既有分析頁提供電量條、數值、文字心情、原因、啟用與歷史省略說明。低電量只提示照顧自己，零電量仍可續作。

## 驗證

```sh
node tests/run-activities.mjs tests/mental-energy-api.test.cjs tests/life-needs-api.test.cjs tests/sleep-api.test.cjs
npm run typecheck
npm run lint
```

API 測試沿世界 POST/GET、SQLite 序列化保存重讀和真正 provider fetch body；外部模型為明示受控回覆。覆蓋首次啟用、零與上限、足額、無政策與 production guard、保存政策不變、活動續做零新增呼叫、首次與既有睡眠醒點、15+15/30 分段、重送、CAS 衝突、保存前／後拋錯及不相容保存狀態。受控回覆只證明輸入契約、世界一致性與 usage，不能證明心理語義品質。

Chromium runner（使用現成 browser-fixture 與真 SQLite，沒有第二模擬器）：

```sh
PLAYWRIGHT_MODULE=/private/tmp/npc-regression-browser/node_modules/playwright CHROMIUM_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' BROWSER_ARTIFACT_DIR=/tmp/energy257-browser node tooling/verification/browser-mental-energy.mjs
```

它從既有畫面完成未啟用觀察、啟用推進、7/20 顯示、原操作重放、重載重讀和清醒休息續做至 4/20；預期 1 次受控 NPC 呼叫，30 input / 10 output tokens，0 次付費呼叫。輸出 panel PNG 與 evidence JSON。2026-11-05 已由 root 執行成功並目視核對中文排版；證據保存在 `docs/verification/assets/mental-energy-257/`。
