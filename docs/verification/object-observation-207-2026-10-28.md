# #207 主動觀察既有未知物品驗證（2026-10-28）

起點 main `9bd0e56`；已讀 #205、#207 全文／空留言，核對 #203 已合併及 #204 的手機修正範圍。這是 #207 的程式能力證據，所有 NPC／裁定回覆均為明示 transport fixture，0 真實付費呼叫，未操作正式世界或部署。

首個反例以 API 自主 fixture 選 move→observe，原版 SQLite 重讀後物品 knownTo 仍為 []，期望 ['owner'] 失敗；修正後同案通過。測試 seam 為真正世界 API、活動／感知、SQLite JSON 保存重讀與下一次真 request/messages，未 mock 世界內部模組。

`node tests/run-activities.mjs tests/object-observation-api.test.cjs tests/active-perception-api.test.cjs tests/false-perception-api.test.cjs tests/memory-api.test.cjs`：**37/37** 通過。新增六案涵蓋：

- move 不全知，observe 成功後身份／時點／物件來源保存，下一真正請求可引用；hidden state、allowedTo 不洩漏，0 額外裁定。
- 非店主角色 Cass 發現後合法提案拿取，owner 與 permission 不被改寫；其他角色輸入不取得尚未知物品。
- 區域遮擋、關門、miss、mixed、hearing 均不授予物件身份，也不把未收穫寫為全場所不存在。
- 原 operation ID 重送不增加派送／骰子／經歷；重讀後相同條件不重擲，走近形成新感知機會。
- 最後保存衝突及提交失敗不留下知情、觀察或 receipt；原 ID 不重跑，新操作能正常提交。
- 舊世界 GET 不改 SQLite；receipt 容量滿明確技術失敗、0 骰、0 新知情，保留舊 receipt。

既有人物／聲音、錯誤感知與記憶回歸通過。原 active-perception 的清晰人物正向檢查保留；同次查探現在可能同時處理未知手機等物件，因此 trace 可為 noticed 而人物清晰線索仍成立。

`pnpm typecheck` 與變更程式／測試／驗證工具 ESLint 通過。整體整合分支的完整套件與跨切片審查由後續整合執行，未冒稱本票已執行全部 repo 測試。

## 既有應用畫面

`tooling/verification/browser-object-observation.mjs` 用真 Edge／WorldApp、正式 API／SQLite 與明示模型 fixture。3 次既有「下一回合」按鈕走 move→observe→rest：3 NPC、0 裁定、1 感知骰。第三次真請求含新物品，沒有 SECRET_HIDDEN。分析顯示 21:30 時點、物件來源與感知 D20；物品仍放在原處。重載、讀取與原 ID 重送零追加派送。1280px／390px 無水平溢出，0 pageerror。

已目視核對 [分析感知](assets/object-observation-207/observation.png)、[物件狀態](assets/object-observation-207/objects.png)、[手機畫面](assets/object-observation-207/mobile.png)。[機械量測](assets/object-observation-207/evidence.json)：下一輪 input 6,173 bytes、世界 14,755 bytes、短期經歷 2,247 bytes、probe receipt 1,616 bytes。這是代表性單案容量，不保證所有世界內容大小相同。

共用入口、容量及回退見[工程契約](../design/object-observation.md)。自由提案、未建檔供應及多輪服務交付分別待 #208–#210；固定回覆僅證明流程，真實自主行為仍待 #211。
