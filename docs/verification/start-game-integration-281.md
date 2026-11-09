# #281 開始遊戲與人物卡整合驗收

狀態：**進行中，不能宣告整份規格完成。** 單一分支 `integration/start-game-281`，draft [PR #291](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/291)。正式站 #282 仍有具體環境阻擋，其餘依原生依賴逐票交付。本文會隨實際證據更新，不把已確認設計當已完成行為。

## 接手與授權範圍

使用者本輪明示授權產品實作、本機隔離資料庫遷移與驗收、提交、推送工作分支及 draft PR；未授權 main 合併、部署、正式資料遷移、付費模型或正式世界推進／刪除。

接手時原工作樹 `/workspace/quiet-hours-npc` 位於 `work`，乾淨，沒有切換或清除原檔案。遠端 main 與 PR #280 merge commit 都重新確認為 `249f20c3723d46f1ad7ce3d5ace11be6d575697e`。另一個 open draft PR #60 與本次無關，未改動。integration 及各實作者各建獨立 worktree。

已讀 AGENTS、matt-pocock、issue-tracker、GLOSSARY、相關既有 ADR，載入 implement-spec、tdd（含 tests／mocking）、code-review、pr；領域文件依 domain-modeling 補正。完整 #281、#282–#290 最新本文／留言、原生 blocked-by，以及 #238–#251、#271、#272、#275、#277、#278 的本文及留言均重新取得。clone 未包含 #281 提及的未提交 grill、舊導覽報告或 ADR0013–0017，已明示缺件；沒有冒充讀取或重建原檔。

## 任務圖與目前證據

原生關係以 GitHub API `issues/{number}/dependencies/blocked_by` 重新讀取；不是按票號順序實作。每票完整驗收、合入 integration 並推送證據後才關閉；再重讀原生前置狀態才開後續。

| 票 | 原生前置 | 狀態與整合證據 |
| --- | --- | --- |
| #282／T1 真導覽 | 無 | 本機有效試次通過；正式 CONNECT 403／CUA／AT-SPI 阻擋，保持 open。整合 `fce8719`，[逐項報告](navigation-282-2026-11-09.md) |
| #283／T2 選檔 | 無 | 先前交付後 closed；中途 Standards P1 發現帳號預算隔離錯誤，已重新 open，修正中。原整合 `0f279ca`，[報告](world-saves-283.md) |
| #284／T3 文字草稿 | 無 | 先前交付後 closed；中途 Spec P2 重現清空保存後 AI lineage 遺失，已重新 open，修正中。原整合 `5b8abcb`，[報告](character-drafts-284.md) |
| #285／T4 模型設定 | #283、#284 | 已完成並 closed；主整合 `7634552`、補證 `152c180`，合後 9/9、追加後 10/10；[模型設定矩陣](model-settings-285.md) |
| #286／T5 形成配點 | #285 | 重新確認 #285 closed 後才開始，實作中 |
| #287／T6 新 d100 | #286 | 前置未完成，尚未開始 |
| #288／T7 五步開局 | #287 | 前置未完成，尚未開始 |
| #289／T8 AI 配置 | #288 | 前置未完成，尚未開始 |
| #290／T9 另存刪除 | #283 | 原前置 closed 時合法開始；#283 重新 open 後暫停結案，正在接合唯一實作者的帳務／預算修正 |

T2 暫以既有城市建立契約提供可驗收的獨立保存邊界；T7 必須改接完成卡與最後確認開局，不能把舊尺度城市建立當成本規格的新建角。T3 的文字草稿不當作完成卡選入世界。詞彙表及 ADR0012 的 #281 延伸已合入 `1d02095`，明示新規格與舊版本各自責任。

## 測試接點與已執行檢查

沿使用者已確認的真正頁面、產品 API、實際 SQLite 保存重讀、受控模型 HTTP transport 及骰果，不再請求同一測試介面的批准。`real-route-runtime.mjs` 跑真正 vinext App Router 與產品 handler，僅在 auth、D1 hosting、模型 HTTP 邊界替身；沒有測試專用建立入口，也沒有把直接裝世界當作使用者建立成功。

初始基線命令：

```sh
pnpm install --frozen-lockfile --store-dir /tmp/quiet-hours-pnpm-store
pnpm test
pnpm typecheck
pnpm lint
pnpm build:test
pnpm build:production
```

初始完整測試 **1327/1327**，五組為 1248、37、6、15、21，各自 fail 0，exit 0。typecheck、兩環境 build 通過；lint **0 errors／4 既有 warnings**。測試開始於 `249f20c`，核心 runtime 在啟動時複製到隔離暫存；執行期間先合 T1 驗收工具，後續產品整合另執行上表專票測試。這份初始結果不能取代全部產品交付後對固定 integration tip 的最終檢查。

每張票的 red→green、故障／回覆遺失／版本衝突、實際 origin／版本／登入條件、命令及畫面見對應報告。T2 真路由驗收含切檔停止自動、各自續玩及 SQLite 重啟；T3 真路由驗收前後 `/api/saves=[]`、未選檔 `/api/world=409`，證明製作不隱式建立可玩世界。

工具失敗試次如實保留：Chromium 套件的 `--disable-web-security` 曾令 POST 缺 Origin，產品正確 403；共用瀏覽器工具已過濾該旗標。初版模型 transport 只攔截 fallback，既有 callback 曾繞過 relay，以假 Key 得到 502；該試次沒有受控回覆，不計通過。修正最終 fetcher 並封鎖外部 fetch 後，T3 重跑才確認一個模型 request 實際進入 loopback relay。沒有以工具中斷判定產品失敗或宣稱修復未知根因。

## 遷移與回退

目前已交付的 `0013_character_drafts.sql` 新增帳號建角草稿；`0016_model_preferences.sql` 新增帳號／存檔模型偏好，不遷移故事或 Key；`0014_world_saves.sql` 新增存檔映射並承接既有世界，不重寫原 state、journal、version 或 lease。只在隔離 SQLite／本機 D1 驗收，沒有正式 migration。

回退須保留新增草稿與存檔表、世界 storage rows 及新版語義；舊程式只認原帳號世界，不能完整呈現新增存檔。不可 drop 新表或丟棄欄位後宣稱無損回退。後續遷移及限制會在實際交付後追加。

## 尚未驗證與完成門檻

- #282 正式站完整唯讀點擊試次仍未完成，須解除連線與真人登入條件；本機 cookie 身分不等同正式 OAuth。
- T5–T9 尚在依圖交付，不能把 isolated API 或受控模型測試當作尚未存在的完整開始旅程。
- 最終整合回歸、固定基準 `249f20c` 的 Standards／Spec 兩軸 code-review 及修復仍待執行。
- 受控模型只能驗證採納、保存及產品邊界，真實模型語義品質未驗收。
- 全部完成才可將 PR 標 ready；目前保留 draft，不合併、不部署。

## T4 及後續補證

T4 以 runtime `42ec76b` 完成真頁模型設定／取消／故障／返回，保存設定及 Key 不派模型；明示補完才呼叫受控模型一次。原 runtime `7634552` 另外通過跨裝置清 Key／受控到期後原頁設定面板、保留原存檔與輸入、零額外派送的反例。初步檢查曾看較早工作快照而推測缺口；對最終來源及真正試次核對後，確認已有保護，補證沒有產品 RED，沒有宣稱修復。

T1 在 2026-11-09 20:39 台北時間完成一次有界重連，仍為工具 requirements 錯誤，正式有效試次仍為 0；追加證據合入 `4b6d25b`。已額外核對 Browser 技能與可用工具，未取得可控制已登入本機 extension 的通道；不能假稱已連線或已驗收。

## 中途審查修正

[兩軸審查](start-game-review-281.md)固定 `1165f6b`：Standards 2 項（最重 P1，帳號玩家預算；另有 P3 名單重複），Spec 1 項（P2，AI lineage）。已重新開啟 #283／#284，由同一修復實作者處理全部 finding，#290 暫不結案。#286 是在 #285 已 closed 後開始；已通知形成實作者接合 lineage 修正前不宣告獎勵判讀驗收完成，只繼續不受影響工作。沒有在重新開啟後開始新的後續票。
