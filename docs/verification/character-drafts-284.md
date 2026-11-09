# #284 同頁建角文字與帳號草稿

基準：`249f20c3723d46f1ad7ce3d5ace11be6d575697e`。依 #281／#284 的已確認測試接點：真正人物頁路由、產品 API、隔離 SQLite 保存重讀，以及受控模型 HTTP transport。沒有使用測試專用建立世界入口。

## 交付與驗收接點

| 驗收條件 | 實作／證據 |
| --- | --- |
| 概念與九項文字同頁、收合摘要、必要缺漏及記憶容量錯誤不藏在收合內 | 真正 `/character-templates` 的建角編輯器；起始位置不在建角表單及本次補完 schema，留給世界配置 |
| 全手填、姓名可先留空、合理明示沒有 | 草稿 API 允許不完整文字；頁面顯示待完成九項，保留「沒有特殊設定」原文；不將草稿當完成卡 |
| AI 只補空白、server 保留來源 | `/api/character-drafts/generate` 從 server 收到的受控模型結果建立來源，忽略對已填欄位的重寫；客戶端不能自報 AI 來源 |
| 實質修改依據 | 保存 AI 原文及使用者修改原文；NFKC、標點／空白／符號／大小寫形式修改不轉為實質修改，保留原 AI 身分。此依據供後續形成判讀，未在本票形成獎勵或數值 |
| 帳號草稿接續與同步狀態 | 帳號及草稿 ID 主鍵；自動保存、保存中／已保存至帳號／未同步；重載與第二裝置從產品 API 重讀 |
| 保存故障、衝突 | SQLite 真交易故障注入：提交前失敗保持舊值；提交後回覆遺失以原輸入恢復；版本衝突 409 保留本頁輸入；未知保存先恢復，不另建副本 |
| AI 故障、慢回覆、遺失回覆 | 原 operation ID、scope、context 和原輸入先存草稿；不自動重派。成功回覆遺失恢復不重複呼叫；另頁修改使慢結果 CAS 失敗，原結果不覆寫；明示放棄套用後才能重開操作 |
| 跨帳號 | A 的草稿不出現在 B 的清單，B 不能用 A 的版本更新 A 草稿 |

## 命令與結果

- `node --test tests/character-drafts.test.mjs`：3/3。覆蓋手動草稿／空姓名、CSRF、提交前／後故障、重送、版本衝突、帳號隔離、只補空白、來源、標點修改、原 AI 結果恢復、慢回覆與他裝置修改。
- `node --test tests/character-templates.test.mjs tests/character-drafts.test.mjs`：5/5；既有文字範本兩項回歸通過。
- `npm run typecheck`：通過。
- `npm run lint`：0 errors、4 項既有 warnings。
- `git diff --check`：通過。
- 真正 Chromium／App Router 旅程：**通過**。真首頁點人物 → 空姓名建角 → 手填 → 自動保存 → AI 補完 → 檢查已填不改／標點不轉來源 → 重載 → 同帳號第二瀏覽器讀回及修改 → 舊頁 409 保留輸入 → 跨帳號不見草稿。受控模型 HTTP **1 次**、真實付費 **0 次**。見 [同頁補完](assets/character-drafts-284/same-page.png)、[衝突保留輸入](assets/character-drafts-284/conflict.png)、[origin／版本／登入條件及結果](assets/character-drafts-284/evidence.json)。受控模型通過不能宣稱真實模型語義品質已驗收。

執行命令：`REAL_ROUTE_RUNTIME=/workspace/quiet-hours-t1/tooling/verification/real-route-runtime.mjs PLAYWRIGHT_MODULE=/tmp/quiet-hours-browser/node_modules/playwright CHROMIUM_EXECUTABLE=/tmp/chromium BROWSER_ARTIFACT_DIR=/tmp/t1-shared-runner-proof node tooling/verification/browser-character-drafts-284.mjs`。整合分支已有共享 runner 時省略 `REAL_ROUTE_RUNTIME`。共享 runner 在真 App Router 及 SQLite 上執行，只替換身分、Cloudflare hosting 及最終模型 HTTP 邊界；不安裝世界 fixture。

本機真路由首輪工具限制如實保留：`@sparticuz/chromium` 的預設 `--disable-web-security` 導致瀏覽器 POST 缺少 Origin，產品正確回 403。改採標準 Chromium args，未放寬產品 CSRF。下一輪發現初版受控 transport runner 只攔截 fallback fetcher，世界原本的 fetcher callback 繞過 relay，以假 Key 收到 502；未收受控模型請求的試次不算通過。共享 runner 改為攔截最終 fetcher 並阻擋外網後重跑。

## 遷移與邊界

新增 `0013_character_drafts.sql`，只加帳號建角草稿表；本票沒有轉換世界或已形成角色。只在隔離資料庫套用，沒有正式遷移。回退舊程式可保留新表；刪表會失去新草稿，不應作無資料備份的回退方式。

舊人物文字範本來源庫保留，與建角草稿分開呈現。本票不交付完成卡、鎖定／配點、五步開局或數值形成；缺模型時原頁設定由 #285 接續。本機身分是 cookie 替身，非正式 OAuth；沒有操作正式世界、部署、合併 main 或使用真實付費模型。
