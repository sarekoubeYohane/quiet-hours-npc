# #185／#193 柔性生活安排與手機：整合驗證

起點為已整合 #187–#192 的 `337416c`。本報告驗證既有世界 API、真正活動／感知／認知、SQLite 序列化保存重讀與既有 WorldApp；只以外部模型／回想服務 transport、時鐘與骰子 fixture 控制輸入。不使用付費模型、正式世界、背景續跑或測試專用 UI。

## 新增跨切片案例

來源：[整合 API 測試](../../tests/flexible-life-integration-api.test.cjs)、[共用旅程 fixture](../../tests/fixtures/flexible-life-loop.cjs)。T1–T9 是本文的定位簡稱，對應測試檔內以下完整行為名稱；不是以私有 helper 代替驗收。

| 定位 | 真正驗證的行為 |
| --- | --- |
| T1 同一世界旅程 | 自主形成安排→手機行事曆→世界確認真正睡眠→普通通知無機會→自然醒→主動列表／閱讀→延期→新提醒後 continue→安靜回合無新模型→自主放下，外部原文仍保存。 |
| T2 Vector Recall／遺忘 | 先以真 API 形成及選留安排，再用 82 次介入造成合法短期 FIFO；初次輸入的來源及安排皆省略，一輪真正 Embedding／Vector 服務 fixture 後才顯示有效安排。合法 forget 後，過期向量不能復活內容。 |
| T3 內外記憶 | 真正建立備忘錄、選留與 forget；API 短期 FIFO 後，普通輸入及空回想無原文，Embedding 不含外部庫正文；真正 list/read 重新產生經歷且原文精確不變。 |
| T4 原收訊人 | 合法舊資料 fixture 中裝置目前物主與訊息原收訊人不同；實際新讀者閱讀不把原收訊人標成已讀。修正前列表錯報已讀的 RED，改以不可變 `message.to` 判定後 GREEN。沒有虛構產品目前不支援的所有權轉移 API。 |
| T5 故障矩陣 | read／send 各覆蓋較後角色 invalid、真正工作截止逾時、保存前、保存後、CAS、租約、提交不明，共 14 個獨立故障情境；安排、手機、聲響／感知／已處理、讀者、意圖共同回復或共同保留，已知用量保留。 |
| T6 帳號／世界／context | 帳號 B 不能引用帳號 A 手機內容；模型輸入無 A 原文。舊 worldContext／operationScope 在派送前拒絕，A 世界不受 B 失敗操作影響。 |
| T7 舊世界 | 缺欄位、已有或損毀裝置、既存已知訊息、睡眠與 forgotten 長期資料；GET 不啟用，成功 advance 不複製裝置、不重建 audience-only／已忘訊息，不猜讀取時間。 |
| T8 解讀自主性 | 相同真正送達與閱讀的邀請，fixture 可相信、存疑、拒絕或延後；讀取當下不新增信念／意圖／安排／回覆。明示選擇回覆才傳出新訊息，發訊者不取得已讀回條。 |
| T9 共同容量 | 初始合法的 32 筆外部紀錄與大型本人記憶，加真 API 新經歷使手機 handle 被共同輸入預算省略；省略項目不能修改。明示整理本人可見記憶後才可修改，其他原文不被靜默淘汰。 |

主旅程初始 fixture 後不使用 `store.replaceCommittedWorld`、SQL 寫回故事、改世界分鐘或補造記憶。時間只由 15／30 分鐘 advance 推進。故障案例的 storage adapter 注入只模擬既有保存／CAS／租約失敗，不作為成功旅程的捷徑。

T5 的提交不明特別模擬「寫入已成功，但 save 回覆及第一次 journal 查詢失敗」；第一個 HTTP 回覆保持 uncertain，後續 GET operation lookup 確認原結果，原 ID 重送不重做。它不要求 uncertain 回覆與後來已確認成功回覆假裝相同。

## A1–A30 覆蓋表

每個數字均指 #185 的原驗收條件。既有切片的具體案例與執行證據分別保存在 [#187](flexible-arrangements-187.md)、[#188](phone-memos-188.md)、[#189](phone-inbox-189.md)、[#190](phone-notifications-190.md)、[#191](arrangement-cues-191.md)、[#192](phone-calendar-192.md)。下面保留實際責任接點，不以回歸總數代替條件。

| 條件 | 證據與公開行為 |
| --- | --- |
| A1 柔性安排閉環 | T1 形成／延期／放下；`arrangements-api`「本人可延期、維持與放下安排」。SQLite 每次讀回。 |
| A2 自主排序 | T1 明示意圖順序、continue 與放下；T8 相同訊息的四種合法取捨；程式不建立固定最高意圖。 |
| A3 不重建認知 | T1 睡眠／安靜回合零新增派送；T2 同一輪有界回想後唯一最終行動；`life-cognition-integration-api` 共同四項／8KiB。 |
| A4 內外記憶分離 | T2 合法 forget 舊向量拒絕；T3 精確備忘錄重讀；`phone-calendar-api`「遺忘內在原文後」對照。 |
| A5 錯過而未察覺 | T1 睡眠普通提醒無機會、未讀及未完成仍保存；`arrangements-api` 時間越過不完成；`phone-calendar-api` 離身不知情後主動查看。 |
| A6 三類喚起 | `arrangement-cues-api` 時間／本人位置／真感知事件及未知私人對照；`phone-calendar-api` 三類外部提醒與無遠端訂閱。 |
| A7 感知分層 | `phone-notifications-api`「delivery emits…」「missed notification…」「a phone left…」分別有機會／漏掉／無機會；T1 真睡眠無機會。 |
| A8 提醒去重 | T1 continue 後安靜回合無派送、原 ID 重送；`phone-notifications-api` 漏通知不重擲／重播；`arrangement-cues-api` 世界時間到期去重。 |
| A9 合法再喚起 | T1 明示延期；`arrangement-cues-api` 本人位置離開／返回；`phone-calendar-api` 文字改寫不重響、到期前延期及舊版失效。 |
| A10 未展示不消耗 | `phone-notifications-api` 6 項僅處理 4 項、省略 2 項後來正常決策承接；`arrangement-cues-api` 8 項僅展示／處理 4 項。 |
| A11 多提醒有界 | 上述 6→4＋2／8→4＋4 的實際派送與 gap；沒有每項追加模型。T9 共同輸入壓力不修改省略項目。 |
| A12 手機身份／持有 | `phone-inbox-api`「physical phone movement retains inbox identity」真 physical place/take；`phone-memos-api` 桌上手機與近旁有限展示。 |
| A13 存取／正文隔離 | T3 未讀外部內容不進普通輸入／Embedding；T6 私有世界拒絕；`phone-inbox-api` sender-only／旁人／一般物件與事件正文對照。 |
| A14 真正讀者／許可 | T4 不可變原收訊人；`phone-inbox-api` 第三人實際讀有限畫面不標原收件人；`phone-memos-api` 一般借用／缺畫面拒絕。 |
| A15 外部操作 | T1 calendar 延期／讀取；`phone-memos-api` CRUD；`phone-calendar-api` CRUD、取消、版本／無效來源、刪除後重建。 |
| A16 傳送／送達 | T5 send 故障分支；T8 真 message 送達且未讀；`phone-inbox-api` 無發訊裝置／損毀收件機／64 筆滿額拒絕。 |
| A17 主動查看／閱讀 | T1 沒有新通知仍主動查看；T3 list 不取得正文、read 才取得；`phone-inbox-api` 重讀不重傳。 |
| A18 漏通知後仍可讀 | T1 睡眠後晚讀；`phone-notifications-api` 漏掉後讀精確未讀；`phone-calendar-api` 遠處手機返回後不重播。 |
| A19 睡眠 | T1 真確認睡眠與自然醒；`phone-calendar-api` 普通提醒不喚醒；`sleep-api`「ordinary requests…actually heard shout」及無機會喊聲回歸。 |
| A20 閱讀／相信／回覆分離 | T8 相同真正送達正文的四種解讀，讀取後尚無心理／回覆副作用；只有明示正常決策才更新或回覆。 |
| A21 活動生命週期 | T1 continue 保留 startedAt／until；`phone-notifications-api`「a noticed phone signal can lead…pause…resume」不重播階段或成果。 |
| A22 時序／派送 | T8 捕捉收件人 slot，閱讀前無正文；T1 9 NPC＋1 裁定的有界旅程；T2 一輪回想的兩次聊天與分開 Embedding fixture。 |
| A23 整輪回復 | T5 14 情境含真正較後 invalid／deadline，故事全量（用量除外）深比對；各切片保存故障矩陣仍保留。 |
| A24 保存／原 ID | T5 CAS／租約／前後保存／結果不明及 journal lookup／重送；主 Chromium 重載與原 ID 一致、零新增派送。 |
| A25 舊世界 | T7 缺欄位 GET 不啟用、同一舊裝置不複製／損毀不補生、睡眠與歷史保存；`phone-memos-api` 遺失裝置不再建立。 |
| A26 舊訊息知情 | T7 保留主觀已知，audience-only／forgotten 不入新 inbox，不造 readers／readAt；UI 明示啟用前歷史未知。 |
| A27 容量／引用 | T9 共同壓力與明示整理；`arrangements-api` 16 項、`phone-memos-api` 32 筆、`phone-inbox-api` 64 則、`phone-calendar-api` 32 筆不靜默覆蓋；notice／cue 省略不處理。 |
| A28 私有邊界 | T2 舊向量拒絕；T3 Embedding 無外部庫原文；T6 跨帳號／世界／context 拒絕；實錄只作觀察者證據。 |
| A29 UI／證據鏈 | 同旅程 Chromium 的真 WorldApp／API／SQLite 五張畫面、重載／重送與 owner 私有 trace result.phones；觀察者面板不代讀。 |
| A30 交付界線 | 本表、ADR0008、工程入口、相容回退及有限驗收交接；各切片及本票 fixture／瀏覽器與真實模型限制分開。最終兩軸 code-review／完整回歸由整合 PR 收尾記錄。 |

## 真 Chromium 的同一旅程

[瀏覽器 runner](../../tooling/verification/browser-flexible-life-integration.mjs) 與 T1 使用相同純外部 transport fixture 及旅程，但所有活動／提醒／閱讀／保存均走真正應用。

共 22 次 advance、510 世界分鐘；10 次從既有「下一回合」按鈕推進，12 次睡眠期間安靜等待使用同一公開 API。實際 9 次 NPC、1 次裁定、0 次手機專用模型、0 付費。自然醒後的下一個行動仍由 fixture 的角色回覆選擇，沒有直接寫醒來／閱讀結果。面板、API、SQLite 與私有實錄一致，重載／原 ID 重送無新派送。

- [睡眠中錯過普通提醒](assets/flexible-life-193/missed-asleep.png)
- [自然醒後真正晚讀](assets/flexible-life-193/late-read.png)
- [自主延期且原文保持](assets/flexible-life-193/postponed.png)
- [放下後外部紀錄仍在](assets/flexible-life-193/dropped.png) · [內在安排明示放下](assets/flexible-life-193/dropped-arrangement.png)
- [機械量測與 checkpoints](assets/flexible-life-193/evidence.json)

runner 曾碰到瀏覽器現實日期與 fixture 日期不一致、以及重載後既有 UI 回到規則模式；已在 browser fixture 邊界同步時鐘，並每次正常 UI 推進前明示選回 OpenAI。沒有修改產品模式保存政策，也沒有把誤用 demo 的結果當作成功證據。

## 本票實際執行結果

2026-10-27，整合 API 回歸共 126／126 通過、0 失敗／略過，包含本票 9 案與 arrangements、arrangement-cues、phone-memos、phone-inbox、phone-notifications、phone-calendar、recall、sleep、operations、life-cognition 既有套件。全部以 `tooling/verification/no-network.mjs` 阻止非 fixture 網路。加強實際回想輸入大小及閱讀當下正文隔離斷言後，另重跑相關 2 案，2／2 通過。

`pnpm typecheck`、上述變更程式的 ESLint、`git diff --check` 及本票文件相對連結檢查均通過。Chromium runner 的 22 回合及派送量見上節與 evidence.json。收訊人標籤先由 T4 真 API 重現失敗，修正為以不可變 `message.to` 判定後通過；原讀者紀錄與手機操作許可不變。

## 能證明與未證明

上述固定輸出及受控感知證明合法選擇可沿實際應用承接，不證明真實模型自然形成安排、一定在某輪查看手機、一定記得約定或習慣自然度，也不證明正式 D1／Vector 服務已啟用。沒有部署、正式世界推進或付費請求；#85／#104／#106 等既有行為票不由本報告關閉。

完整工程入口與回退見 [整合工程契約](../design/flexible-life.md)，另有正式授權才使用 [有限驗收交接](flexible-life-live-runbook.md)。
