# #290 另存／刪除原帳號綁定審查修正

原 P1 由 Spec 在固定 `cff3707` 真產品 API／SQLite 重現：A、B 合法各有相同存檔 UUID／version，A 的舊 copy/delete body 沒有 account scope；切到 B 重送會建立 B 副本或刪掉 B 來源。#290 因此重開，原旅程通過不排除此反例。

新 copy/delete 明示原 `operationScope`，保存 UI 從原畫面帳號捕獲並連同 pending request 保存；schema 與 server 在讀取原 ID receipt 前核對原帳號，缺識別或不符回 409，不以當下登入補 scope。已受理操作的原帳號與原 ID 仍去重。恢復 GET 也帶原 scope，server 先核對，UI 再核對根回應 scope，不能把另一帳號同 ID receipt 當原操作。舊無 scope pending 只能在原 scoped storage bucket 所屬帳號做只讀 receipt 核對；若未受理，禁止重送。卸載或 scope 改變後不導航，也不更新另一頁面錯誤／busy 狀態。

原獨立反例 `/tmp/quiet-hours-save-management-account-spec.mjs` 修正後 **1/1**，A/B 來源都保留；新增產品 API／SQLite 覆核還建立 B 同 operation UUID 的合法 receipt，確認原 A request 在去重前即拒絕、B receipt 只在 B scope 可讀、回 A 恢復同 ID 只建立一次。開局 API 組含新增案例 **13/13**。

新增真 App Router／Chromium旅程 `browser-save-management-account-288.mjs` 由各帳號合法形成卡、開局草稿與確認 API 建立相同 save UUID，分別在未受理 copy／delete 時中斷並切帳；恢復不碰 B，回原 A 可恢復原操作。兩份世界與原 ID、pending scope 都實際核對，受控形成 2 次真入帳／實付 0。第一次 green 為修復工作樹，固定提交重驗與畫面待下段補入。沒有正式世界、付費模型或資料遷移。
