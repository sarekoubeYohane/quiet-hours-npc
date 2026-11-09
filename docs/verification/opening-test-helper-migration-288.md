# 五步開局接合的既有驗收 helper 遷移

舊 `POST /api/saves {city:...}` 建立方式已被 #288 的完成卡／開局草稿確認契約取代。原測試先取得 400，沒有把它判為產品建立失敗，也沒有復活旁路。

## 真產品建立路徑

共用 `tooling/verification/opening-journey.mjs` 呼叫真正人物草稿→受控模型形成→明示完成卡保存，再保存 step 4 開局草稿，最後以該 draft ID／version 確認建立世界。每個讀取的原帳號／存檔 scope 都在新 Request 帶回；UI／API 後續變更 Cookie 不改寫原請求的對象。

`tests/create-world-via-opening.cjs`、model-settings、world-saves、save-management、cards、versioned-d100 及相應真頁工具均採上述產品路徑；沒有直接 SQL 安裝新世界。既有歷史相容／sealed 研究 fixture 明示其歷史責任，不能用來宣稱新建成功。

形成的真受控模型呼叫及 token 保留在中央帳單：一般 formation 為 1 call、2 input + 2 output。相關舊預算測試只調整同等剩餘空間、以角色分組或真已發生的 delta 斷言；不清帳、不刷新小時、不假裝形成零呼叫。形成一般無獎勵的骰數固定 20 次（五能力 15、容量 2、需求特性 3），其他受控機會不偷多抽。

## 原 assertions 與退役責任

選檔／切檔／重新讀取、版本衝突、原操作 ID 去重、跨帳號隔離、另存生活狀態、原模型用量、來源刪除後續玩及提交前／後故障 assertions 保留。新建原子故障使用尚未 finalized 的真開局草稿，不能重用已完成 draft 冒充新操作。

新 reset 一律依產品退役規則拒絕，不覆寫世界。auth 的八個 reset 案改驗新請求 409／原世界及帳務不變，歷史 settled／pending receipt 仍按原結果恢復，歷史 fixture 明確安裝原 receipt，不冒充新建立成功。budget／cost／pursuit／trace-history 的舊正例也改為 409 並強斷言原帳單、活動、追求及私人歷史保留。

## 已執行的窄組與限制

- 初次 helper 遷移固定 `19f933d`：cards 11/11、models 15/15、saves/management 16/16、auth reset 8/8、新 d100 6/6；形成卡真頁 controlled 2。
- `b7a5bf0` 新 d100 真 API 6/6（含 26 邊界與 SQLite 關閉重開原 ID），normal cards 真頁 controlled 2，沒有付費。
- 原帳號 mandatory scope 接合後 `e92f53c`：資產／draft／cards／models／opening／migration／新反例 55/55；saves/management 16/16；retired reset/private trace/budget/cost/pursuit 65/65；auth/Key/reset 40/40。一般 Request 建立處的純 scope 遷移另見 [原帳號測試 helper 報告](original-account-test-helpers-281.md)。
- 整合固定版本的完整 `pnpm test` 留給最終整合；沒有將這些重疊窄組加總成全套驗收。

真頁腳本與證據：`browser-character-cards-286.mjs`、`browser-character-drafts-284.mjs`、`browser-opening-wizard-288.mjs`、`opening-durable-journey-288.mjs`。全部使用受控模型／真 App Router／實際 SQLite 保存重讀；真模型語義品質仍未驗收。
