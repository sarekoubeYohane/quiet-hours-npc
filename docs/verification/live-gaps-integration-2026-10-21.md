# PR #143 最小日常驗收缺口：本機整合驗證

日期：2026-10-21（台北）。來源 main `5e172d5`；整合 PR [#144](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/144)。本輪沒有操作正式站、呼叫正式付費模型、合併 main 或部署。#104、#106 保持開啟。

## 保留既有正式站結論

完整核對 PR #131、#140、#143 的內容及 Conversation／review comments（均無留言），與 #104、#106 最新票面及留言。#143 已合併，因此報告、JSON 與成果圖直接讀取最新 main。另對照 #123、#125、#128、#129、#133、#134 及目前未關閉 tickets；本輪是既有契約的缺陷與驗證缺口，不重開同類票，也不把 #136–#139 的整體契約重構併入。

production `3b352cb` 的兩個真實模型回合、13 次呼叫／87,568 tokens，以及 Cass 餐點取得／食用、店主原長句及 tea-kit target 首次 v2 核准、原杯／飲品、UI/API 重讀和同 ID 重送，維持 [#143 報告](pr131-live-acceptance-2026-10-21.md) 的已通過結論。本機 fixture 不追補該回合缺失的原始 programs／branches，也不是再次正式驗收。

## 根因與修正理由

| 缺口 | 已證實原因 | 最小變更與界線 |
| --- | --- | --- |
| 喝茶 API 502 | 新驗收場景杯子缺 dirty，但既有 drink 程序寫入 dirty | 只補新場景 seed；既有綁定已預驗全部效果，不改程序／全域 validator／舊世界 |
| v2 證據截短 | 原 allowlist 缺 programs／branches；舊深度不能涵蓋巢狀階段 | 新 receipt schemaVersion 2，新增有限投影與固定深度11，保留64 KiB及其他大小上限、遮蔽與淘汰；舊 receipt 原樣重讀 |
| 受阻後只有泛稱 | 非 accepted 分支未提供可用重試指引，保存及下一次 prompt 都只有原泛稱 | 補條件式許可／實質方法或已知條件改變／自主選擇指引；不讀隱藏權限、不捏造模型原因、不強制換行動 |

各切片均先經真實 API／SQLite red，再單變數 probe 與 green；新 UI runner 亦先重現喝茶502和 programs 缺失。詳見 [杯子診斷](live-gaps-cup-2026-10-21.md)、[證據診斷](live-gaps-evidence-2026-10-21.md)、[NPC 回饋診斷](live-gaps-feedback-2026-10-21.md)。沿用 ADR 0002／0003／0004 的執行、契約與資訊邊界，沒有改變產品決策，無需新 Grill 或 ADR。

## 整合驗證矩陣

「真實應用」指 WorldApp、世界 GET/POST、效果執行與實際 Node SQLite；認證／Worker bindings／模型 transport／受控骰子及保存故障注入是明示 fixture。既有 Workers/D1 測試另外在完整回歸中實際執行。

| 要求 | 驗證路徑與證據 |
| --- | --- |
| 餐點取得與消耗 | 新綜合 UI runner 走正式 API 效果與保存；原ID重送及重載不復生 |
| 自主授權後借杯、攜帶、洗淨及歸還 | 模型 fixture 選店主 grant 提案；API 形成真正 allowedTo，Vera 持有／移動／洗還同杯，owner 不變；不是台詞自動授權 |
| 喝→洗→同杯再泡 | UI 正常進入未修改的新場景，原長句／茶具首次核准；同杯 dirty→empty→water→tea，飲品各有身份、舊飲品已消耗且只一份 active |
| 已知規則不新增裁定 | 綜合 UI 及 API 逐次核對 evidence counts；NPC 決策另計，沒有宣稱整個新回合免費 |
| 跨回合續做／中斷 | `browser127` 的 continue 保留原時鐘／分支（2 NPC、1裁定、1骰）；interrupt 保留 partial、不完成未來效果。`browser129` flow 驗重綁、continue與接管清理 |
| 五段、失敗消耗、部分成果 | `browser127` 7/7、`browser129` 6/6；各五段案例1 NPC／1裁定／1骰。自由 failure消耗材料但作品仍raw；mixed留下partial；日常失敗／mixed材料消耗但不生成成功茶飲 |
| 重載、同ID重送、保存失敗 | 綜合UI、操作證據API及既有全套回歸；保存前故障無半套成果，提交後拋錯可確認原提交；同ID不重派送、不重做 |
| 證據大小／敏感／舊資料 | 證據API20/20：巢狀遮蔽與超界明示、64KiB、NPC／帳號隔離、無已提交候選追補；舊schemaVersion1 GET/replay不升版 |
| NPC可知回饋 | 新API3/3：原場景已知許可介紹保持、下次prompt有安全指引；隱藏target不漏owner/holder/allowedTo；fixture仍可自行選相同行動 |

綜合 UI 的程式、篩選 API 證據、呼叫次數及畫面見 [瀏覽器紀錄](live-gaps-browser-2026-10-21.md)。本輪結果分支重跑的 [13 組紀錄](assets/live-gaps-results/results.json) 與代表畫面：[部分成果](assets/live-gaps-results/free-partial.jpg)、[失敗消耗](assets/live-gaps-results/free-failure-consumed.jpg)、[中斷](assets/live-gaps-results/free-interrupted.jpg)、[日常重用／續做／中斷](assets/live-gaps-results/routine-flow.jpg)。截圖已目視核對，與 API 斷言一致。

## 回歸與建置

Runtime 整合 `a18ccc1` 執行；後續瀏覽器腳本與證據／文件不修改 runtime。

| 檢查 | 結果 |
| --- | --- |
| `pnpm test` | **462/462**：活動／世界API420、auth32、真實Workers/D1及migration10；0 fail／skip |
| `pnpm typecheck` | 通過 |
| 變更 `.ts/.tsx/.cjs/.mjs` ESLint | 通過；未宣稱無關既有檔案已整理 |
| `pnpm build:production` | 通過；產物 name=`quiet-hours-npc`、APP_ENV=`production`；沒有部署 |
| `browser-live-gaps.mjs` | 16次advance（含預期保存前502），62 NPC／6裁定fixture，重送零新增派送 |
| `browser127.mjs` | 7/7，真實UI/API/SQLite重讀與重送 |
| `browser129.mjs` | 6/6；flow為4 NPC／1裁定／3受控骰，其餘各1／1／1 |
| `git diff --check` | 通過 |

瀏覽器參數沿 [runner 說明](../../tooling/verification/README.md)：`PLAYWRIGHT_MODULE`、`CHROMIUM_EXECUTABLE`、必要時 `CHROMIUM_MODULE`、`BROWSER_FONT_DIR`。新runner為 `node tooling/verification/browser-live-gaps.mjs`；各腳本使用本機transport替身，不需要真實Key。完整 `pnpm test` 自動使用 no-network preload；Workers tests拒絕外連。

## Code review 與交付限制

獨立 Standards／Spec 審查與最終覆核記錄於 [雙軸審查](live-gaps-code-review-2026-10-21.md)。審查基準固定 `5e172d5`，不以未合併或未部署當成缺少實作。

- 舊場景杯不自動補 dirty；其不相容 drink 仍沿既有502原子拒絕。部署後先保留舊證據，再正常退出／重新進入新場景，不直接改正式物件。
- 有界證據可能截短或被淘汰；缺失或遮蔽阻礙判定時必須明記未驗證。新欄位不追補 #143 舊回合。
- 現行裁定契約沒有 reason；Vera 的特定 unsupported 原因仍未知。安全指引不保證模型改行動，兩回合不能證明無限循環。
- fixtures驗證程式契約與保存行為，不能證明正式模型穩定產生合理程序、實際付費成本或完整正式站驗收通過。
- 交付 [部署後有界驗收流程](operation-evidence-live-runbook.md)：最多12個新回合／20分鐘／既有預算先到即停，技術錯誤立即停止新付費操作。正式站不注入保存故障或操控骰子，不為未到達分支無界重試。
