# #288 五步開局與原始開局驗證

狀態：實作及本票主要驗證完成，等待唯一修復者的跨票 scope／共用測試接合後固定最終來源；未宣告 #281 完成，未關 #288，未啟動 #289。2026-11-09 開始前重讀 #281／#288 最新本文、留言及原生 blocked-by（僅 #287，已 closed），由 integration `59bb7d9` 建立獨立 `feat/opening-wizard-288`。已讀 AGENTS、代理／issue-tracker 指示、GLOSSARY、implement-spec／TDD／code-review／PR 技能及 ADR 0004／0008／0012；不沿被 #281 取代的五級新建角或覆寫世界流程。

## 已交付行為

共同導覽常駐新開入口。`/new` 依人物、場景、世界配置、確認開局及進入觀察五步進行；人物／場景沿原頁面建立並帶返回網址，開局先保存才離開。開局草稿按原帳號與 UUID 保存，CAS 衝突或同步失敗保留本頁輸入，存檔頁「建立中」可接續內容與步驟。來源在首次選用時由 server 讀取並保存可信快照，後續來源修改不洗掉已選內容；客戶端不能上傳候選世界或偽造卡片數值。

新世界只接受已保存開局的確認 `{id,draftId,draftVersion,operationScope}`；不再接受暫接的 `{name,city}` 新建旁路。文字範本與未完成建角草稿不能成為新世界人物。原子 batch 同時安裝世界、帳號存檔身分、原始開局及已完成草稿標記。確認頁使用 durable candidate，單純變更步驟或存檔名稱不重造隱藏亂數流。已形成卡的能力／需求特性／容量直接承接，未指定需求 20／20／15／20，目前電量沿容量七成半點進位；本次可另指定合法需求、感受階段及容量內目前電量。

手動安排起點、同源多處場所、同住、可選住處／工作／所有權／許可／關係／道路，沒有道路不自動連通。起點、房間及所有引用由既有城市／權限／知情規則一起驗證。原始開局保存完整來源快照與確認安排，與進度分開；重新開始只預填新草稿，確認後建立另一世界。舊 null 原始開局明示不可用。新 `start-city`／`reset` 請求退役為 409，已保存歷史 receipt 仍先回放。刪世界的原子 batch 亦刪除該世界已結束的開局草稿，保留別份草稿／卡／場景、另存副本原始開局與帳號實際費用。

## 驗收矩陣

| #288 條件 | 證據與結果 |
| --- | --- |
| 至少完成卡與合法場景、同流程建立返回 | 真首頁空狀態→新開→真建角頁文字／受控形成／明示保存卡→返回選用→真場景頁建立→返回；全程只有形成的受控模型 1 次，付費 0 |
| 五步、帳號草稿與建立中接續 | 真頁逐步、離開至選檔「建立中」、恢復第 3 步與重載保留內容；API／SQLite CAS、寫後丟回覆恢復、跨帳號延遲 v0／finalize 409 |
| 場所獨立、同住、可選配置及不同責任 | API 兩張真卡／同源雙場所，實體房間／物件 id 各自獨立，同住共用實際 residence；新開局真保存的 grant 不製造 residence／ownership／知情，不打開 closed 門；hidden 物件不投影，knownTo 與 allowedTo 分開，空 roads 保留空 |
| 確認實值與保存重讀一致 | 真頁保存最後名稱、背景、能力、來源、起點、需求 12／20／15／20、容量 70／電量 56；confirmation candidate 的完整人物深比 persisted／GET 同一份；API另驗預設／感受與矛盾拒絕 |
| 成功才進觀察、去重與不推進 | 真頁在 server commit 後丟棄回覆，仍留新建頁，原 id 恢復同一份再進觀察 turn 0；API before／after batch fault、CAS 競態沒有半份世界／重複新世界；兩份世界各自手動續玩至 2／1 回合，不互相前進 |
| 原始快照與重新開始 | API 原場景改版後草稿與 restart 仍使用已保存舊房間／物件／人物背景；真頁從原始開局重開並改名另建第二世界；舊 null 顯不可用；刪來源後副本可續玩及用其原始開局預填 |
| 返回修改及來源更新 | 真頁確認返回第 3 步改最後名稱，再保存同一 candidate；API source edits／draft reload／step-only reuse；既有卡值不重骰 |

## 固定提交與命令

- `b1696a2`：首條草稿／可信快照／確認保存 tracer 紅轉綠。
- `c159a0e`：原帳號 scope、需求／精神初值、退役原地覆寫；API 9／9。
- `cff3707`：獨立 UI worktree 五步、導覽、資產返回與觀察入口；合入主 T7。
- `76b9b0b`／`4481c1e`：候選保存、已結束草稿刪除生命週期、權限及歷史相容；API 12／12。
- `28b9edd`：唯一修復者修正異帳號恢復 GET 與卸載後慢建立回覆導航；獨立覆核兩反例 remaining 0。本分支已採用。
- `976f0a5`：費用旅程 helpers 獨立 worktree 交付與證據；本分支已採用。

已執行 `node --test tests/opening-wizard.test.mjs` **12／12**。`node tests/run-activities.mjs` 指定 city-creation／city-access／city-activity-hints／city-phone-map／city-travel／initial-memory-capacity／character-attributes／formal-mental-enable 八檔 **44／44**。歷史城市生活測試明示使用 `historical-city-fixture.cjs`，只測升版前已保存城市的相容；它不代表五步新建成功，不是產品測試捷徑。新 start-city 409 及既存 settled receipt 回放另經真正 route 驗證。

固定 `4481c1e` 完成 typecheck、lint（0 errors／4 既有 warnings）、build、diff check；真 App Router／Chromium＋磁碟 SQLite 完整手動旅程通過。UI fixed 後的兩份世界各自續玩 probe 亦通過。最終接合後的固定版本、完整套件及畫面另在本頁下方補記。

## 邊界與回退

新增 `0019_opening_drafts.sql` 與對應 Drizzle schema，僅套在隔離 SQLite；沒有正式 migration。發布此程式前須先套 additive migration，回退不應刪除開局表／原始快照／已保存卡值或骰果；舊程式不支援新草稿與 opening-v1 重開，應保留資料並使用支援版本。舊版原地 reset／start-city 入口也不能當回退手段。未演練正式回退。

未驗真實 OAuth、跨真裝置部署、真模型語義品質、正式世界與正式站寫入。模型 transport、身份 cookie、D1 hosting 及形成骰邊界受控，其餘為真頁／產品 API／SQLite；外網攔截，沒有付費模型。T8 可選 AI 世界配置尚未啟動，沒有放置假 AI 按鈕；本票不宣稱該項已完成。

## 審查收斂狀態（最終接合前）

原 backend scope 反例已在 `c159a0e` 修正並獨立覆核：從原帳號捕捉 scope 後切帳，edit／confirm／restart／新 v0 都 409，不改另一帳號同 UUID 草稿。兩個 UI 慢回覆反例已採唯一修復者 `28b9edd`：另一帳號同 UUID／body 的 GET 不得假稱原輸入已同步；已離頁的新建成功回覆不拉走新選存檔。兩項獨立真頁覆核 remaining 0，沒有以正常旅程通過掩蓋原反例。

後續具體發現的 v1 UUID 建立／選檔不一致仍待唯一修復者收斂：固定 `72d76e1`、真 formed card／v4 草稿，用 `00000000-0000-1000-8000-000000000001` 當 final save id 可獲 201，隨後同帳號 world GET 卻 400；因此本票此刻未 ready。另 T9 舊 copy／delete 原帳號 scope 的 P1 已重開 #290，由同一修復者處理，不把它算作已完成。最終固定證據須採用這些修正後來源。

### 第一收斂包已採用

已合 `1a3ea10` 與最新 integration `fa0af83`。共用 v4 身分契約 `79b7927` 現在拒絕不一致的草稿／存檔 UUID，無殘留 row；開局 API 組 **15／15**（含原 12 項）通過。共用 `character-api-fixture.mjs` 取代複製的接點；兩軸對原 fixture P3／UUID P2 的覆核 remaining 0。T9 原帳號 copy/delete／receipt 恢復修正亦已採用，原 P1 兩軸覆核 remaining 0；票狀態由 root 依真正整合結果處理。

新增原帳號介面查核仍待 scope 收斂包：真 API／SQLite 顯示帳號模型預設、建角草稿、人物文字範本及場景來源的舊頁請求可在換帳後寫入另一帳號；Key fast branch 亦會在 scope 檢查前寫入新帳號。另真頁可在 visibility refresh 後把原觀察頁改綁另一帳號同 ID 世界並推進。這些皆交唯一修復者，未平行修產品；無真 Key、無付費模型或正式資料操作。此段是明示尚未完成狀態，不以先前正常旅程掩蓋已重現邊界。
