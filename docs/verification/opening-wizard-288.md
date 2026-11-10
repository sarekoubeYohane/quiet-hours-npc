# #288 五步開局與原始開局驗證

狀態：T7 可交整合審查。已接合唯一修復者完整包 `49cc19a`，含 integration `1829384`；產品目錄 `app`、`components`、`lib`、`db`、`drizzle` 與已驗證 `5face37` 完全相同。最後兩項 P2 的獨立 Spec／Standards 覆核皆 remaining 0。本次收尾只整理證據，沒有為相同產品樹重跑已通過旅程。未關 #288、未啟動 #289，也未宣告 #281 或整合全套完成。

2026-11-09 開始前重讀 #281／#288 最新本文、留言及原生 blocked-by（僅 #287，已 closed），從 integration `59bb7d9` 建立獨立 `feat/opening-wizard-288`。已讀 AGENTS、代理／issue-tracker 指示、GLOSSARY、implement-spec／TDD／code-review／PR 技能及 ADR 0004／0008／0012。UI、相容測試 helpers 與審查修復均由各自獨立 worktree 交固定提交後接合；不沿被 #281 取代的新建角或覆寫世界流程。

## 交付行為與逐項驗收

共同導覽常駐新開入口。`/new` 依人物、場景、世界配置、確認開局及進入觀察五步進行；人物／場景沿真正資產頁建立並返回，離開前保存開局。草稿綁原帳號與 UUID，使用版本 CAS；衝突或同步失敗保留本頁輸入，選檔頁「建立中」可接續內容及步驟。來源首次選用時由 server 保存可信快照，來源後續修改不洗掉已選內容；客戶端不能上傳候選世界或偽造卡值。

新世界只接受已保存開局的確認 `{id,draftId,draftVersion,operationScope}`。文字範本、未完成建角草稿及暫接的 `{name,city}` 均不能繞過形成建立世界。原子 batch 同時保存世界、帳號存檔身分、immutable 原始開局及 finalized 草稿標記；確認使用已保存 candidate，單純變更步驟或名稱不重造隱藏亂數流。能力、需求特性及容量承接完成卡；預設需求 20／20／15／20、目前電量為容量七成半點進位，也可在確認前指定合法需求、感受階段及容量內電量。

| #288 驗收條件 | 外部可觀察證據與結果 |
| --- | --- |
| 首次空狀態、至少一張完成卡及一個合法場景 | 真首頁空狀態→新開→人物頁完整文字／受控形成／保存完成卡→返回選用→場景頁建立→返回。未完成卡及非法起點被產品 API 拒絕；形成受控模型 1 次，付費 0 |
| 五步、返回修改、同頁建立資產、草稿自動保存及接續 | 真頁完整五步；離開至選檔「建立中」、恢復配置步驟、重載保留輸入，確認返回修改最後名稱；資產 author／returnTo 保留原 owner 及 draft。API 真 SQLite CAS、提交前失敗、提交後回覆遺失與原 ID 恢復皆有覆蓋 |
| 完成卡值不重骰、來源更新不改已選內容 | API／磁碟關閉重開後仍保存原卡值、舊場景房間／物件／背景；只改步驟／名稱重用 candidate。受控取骰次數不增加 |
| 最後確認與保存重讀同一份 | 真頁最後名稱、背景、能力、來源、起點、需求 12／20／15／20、容量 70／電量 56 深比 persisted／GET；實設住處甲屋、臥室客廳、工作乙屋、甲屋所有權，確認以可讀名稱顯示且 DB 配置一致。API 另驗預設、感受及矛盾輸入拒絕 |
| 同源雙場所獨立、同住共用實際場所 | API 兩張真卡／同源雙場所的實體房間與物件 ID 各自獨立；同住者共用實際 residence。真頁可加入同來源 v1／v2，分別選其房間、重載、確認及保存，各自門／物件／權限仍按原版本 |
| 起點、道路、住處、工作、關係、所有權、許可皆可選 | 手動產品 UI 可操作，無 raw JSON 代替流程。空 roads 保留空，不偷偷連通；起點與 room/ref 驗證。grant 不製造 residence／ownership／知情，也不打開 closed 門；hidden 物件不投影，knownTo 與 allowedTo 分開 |
| 保存成功才進觀察、不推進首回合 | 寫後丟回覆仍留建立頁，原 ID 恢復同一份才進觀察 turn 0；before／after batch fault、CAS 競態不留半份或重複世界。兩份世界分別手動續玩至 2／1，不互相推進 |
| 原始開局與進度分開、重新開始另建 | 真頁從原始開局預填、改名後確認新增第二世界；API 在來源更新後仍沿舊快照重開，contextId 獨立。舊 null 明示不可用；不拿現況／最新範本冒充原始開局 |
| 刪除生命週期與其他資產隔離 | 保存→另存→刪來源：只刪該世界 finalized 草稿，其他草稿／卡／場景不動；副本保留完整原始開局可續玩／重開，原 confirm 重送不能復活來源；帳號實際費用保留 |
| 原帳號、慢回覆及恢復綁定 | 舊 A scope 在 B 下 edit／confirm／restart／v0 均 409，不改 B 同 UUID 草稿；恢復 GET 不接受 B 同 UUID/body 假同步。卸載後慢 create 不拉走另一選檔；已 commit 後只換 cookie 也不會裸導航讀 B 世界，錯帳號明示返回選檔，A 已存世界仍可續讀 |
| 舊流程相容及退役 | 新 `start-city`／`reset` 為 409；已保存 receipt 先回放，既有城市／活動／帳務保留。歷史城市 fixture 明示為舊保存資料，只驗相容，不冒充五步建立成功 |

## 固定提交與驗證

主要提交：`b1696a2` 開局草稿／快照／原子確認；`c159a0e` 原 scope／初值／退役原地覆寫；`cff3707` 獨立 UI 切片；`76b9b0b`／`4481c1e` candidate 重用、草稿刪除生命週期及權限；`80b9689` 帳號介面 scope／consumer／helper 包；`5face37` 原 owner 導覽及精確場景版本；`71888ee`／`49f6d85` 純驗收 driver 收尾；`49cc19a` 最後覆核證據。

| 固定來源、命令／範圍 | 結果 |
| --- | --- |
| `5bdc6db`：`node --test` account-origin-surfaces、character-templates、scene-templates、character-drafts、character-cards、model-settings、opening-wizard、versioned-d100、world-saves-migration、migration-gate | **69／69** |
| `5bdc6db`：`node tests/run-activities.mjs` world-saves、save-management、8 檔歷史城市／屬性／精神組、budgets、decision-traces、costs、pursuit-lifecycle | **101／101**；原費用與歷史斷言保留 |
| `5face37`：opening API、acceptance 全檔、實際 Workerd／D1 | **16／16、9／9、1／1**；新增 mixed-version preview→保存→產品 GET，卡值及取骰次數不變 |
| `71888ee`：受影響 acceptance／city-access／creation／travel／phone-map／world-configuration | **24／24** |
| `71888ee`：`npm run typecheck`、`npm run lint`、`npm run build` | 皆 exit 0；lint 0 errors／4 既有 warnings |
| `5face37`：normal 五步、author-return、草稿接續、確認配置／DB、原始重開、兩世界 2／1；durable 關閉重開；原 WATCH1／WATCH2 | 真 App Router／Chromium／磁碟 SQLite 通過；normal、durable、recovery 各 controlled 1／paid 0 |
| `5face37`：bound owner、同帳 pending receipt 恢復與 analysis reader | 新 owner 邊界真頁通過，controlled 2／paid 0；同帳恢復及兩分析私有證據 GET 200、turn 1、新增 POST 0；各 analysis controlled 1／paid 0 |
| `49f6d85`：mixed scene version 真頁 | 實際從已選 v1 草稿點加入最新 v2，配置選不同房間、重載、確認／保存；v1 public／v2 private 各正確，controlled 1／paid 0；產品仍同 `5face37` |

[最後修復、命令與獨立覆核](opening-bound-review-288.md)含原 RED、GREEN、固定來源及畫面；[帳號介面修復](account-origin-surfaces-281.md)、[相容 helper 遷移](opening-test-helper-migration-288.md)補充前一批守門與 consumer 驗證。`49cc19a` 是完整固定包，本次以 `git diff --exit-code 5face37 HEAD -- app components lib db drizzle` 確認產品完全相同，以 ancestor 檢查確認含 integration `1829384`，不把文件提交當新的產品測試版本。

手動流程原固定 `5bdc6db` 的[配置](assets/opening-wizard-288/manual-config.png)、[確認](assets/opening-wizard-288/confirmation.png)、[turn 0](assets/opening-wizard-288/observed-turn-zero.png)、[兩份續玩](assets/opening-wizard-288/two-worlds-continued.png)、[origin／登入／版本證據](assets/opening-wizard-288/evidence.json)及[磁碟重開](assets/opening-wizard-288/durable-evidence.json)保留其真實來源；後續新 owner／混版綠證據見最後修復報告，未把舊畫面改標新版本。

## 失敗歷史及剩餘整合驗證

重開票的修正鏈亦已接合：#283 的帳號預算跨檔權威及用量保留見 [player-account-review-fixes](player-account-review-fixes-281.md)，其後觀察頁／恢復原 owner 守門見 [account-origin-surfaces](account-origin-surfaces-281.md)；#284 的建角草稿／人物及場景來源舊頁寫入、#285 的模型偏好與 Key fast branch 同由該 scope 包收斂，原 Key P1／四 surface P2 及後續 reader P2 獨立覆核均 0。#290 的 copy／delete／receipt 原帳號 P1 見 [save-management-account-review](save-management-account-review-290.md)，完整包保留其守門與同帳號恢復。最新 [opening-bound-review](opening-bound-review-288.md)再收斂跨頁原 owner 前提，未以 query 取代登入授權。票仍由 root 在實際整合推送後依 #283＋#284→#285、#283→#290 閉合，再處理 #288→#289；本報告不代替 GitHub 原生狀態。

原 backend scope、恢復假同步／卸載後慢導航、v1 UUID 建立後不可讀、帳號模型／資產／Key／WorldApp 重綁及 pending 初讀問題，均曾以真 API 或真頁重現，再由唯一修復者收斂並獨立覆核。最後兩例為 commit 後切 cookie 裸導航誤讀另一帳號同 UUID 世界，以及同 source ID 不同版本誤取第一版 public 規則；`5face37` 修正後 Spec 兩反例各 remaining 0，Standards hard 0／judgment 0。原先正確保存的 A 世界沒有回滾、重送或重抽。

**root 固定 `5bdc6db` 的 full 原結果仍是失敗**：core **1265／1267**，兩個舊 reset assertion 預期 400、產品正確回 409；補組 auth **40／40**、assets **61／61**、Workers **14／15**（唯一原 setup 缺 scope）、source-pin **21／21**。原 full 與補組 raw exit 1 logs 保留，不能合算為一次全套通過。後續兩個 core assertion 以明示退役 409 及 world/player_accounts 完整 row 不變驗證，acceptance **9／9** 綠；Workers 普通 constructor 加原 scope 後真 Workerd 全檔 **1／1** 綠。首輪受影響城市組 **23／24** 的唯一裸 `/new` selector 也已改驗路徑與原 owner，再跑 **24／24**。

上述針對性綠證據不宣稱完整候選全套已綠。最終 T8 新變更完成後，root 仍須在固定 integration 跑完整現行套件及最終兩軸審查，再依技能流程決定 PR ready；本票交付不提前解除 GitHub 原生阻擋。

## 隔離本機 D1 遷移與回退

新增 additive `0019_opening_drafts.sql` 及對應 Drizzle schema。已使用真正 Wrangler 本機 D1，獨立 `/tmp/quiet-hours-t7-d1-5bdc6db/state` 及只有 fake local DB id 的暫存 config，所有命令明示 `--local`，沒有 `--remote`。從空庫先套至 0018，插入明示的歷史遷移 fixture，再執行：

```sh
WRANGLER_SEND_METRICS=false npm run db:migrate:local -- --config /tmp/quiet-hours-t7-d1-5bdc6db/wrangler.json --persist-to /tmp/quiet-hours-t7-d1-5bdc6db/state
```

共 **16** 份專案 SQL 成功。Readonly native SQLite 證明舊 state／含 D20 結果 journal 的 UTF-8 bytes、version 42、lease、city_started 及 legacy 原始開局 null 不變；新 opening_drafts 0。fixture 僅驗遷移，不冒充玩家建立成功。完整命令與 hash 見 [D1 證據](assets/opening-wizard-288/d1-migration-evidence.json)，[前置 migration](assets/opening-wizard-288/d1-pre19.log)、[歷史 fixture](assets/opening-wizard-288/d1-legacy.log)、[0019](assets/opening-wizard-288/d1-0019.log)皆保留 local 執行證據；後續修復沒有更動 SQL。

發布前須先套 additive migration。回退應保留草稿表、immutable 原始開局、已保存卡值及骰果；舊程式不支援新草稿／opening-v1 重開，不可刪資料或以原地 reset／start-city 取代回退。沒有正式遷移、部署或正式回退演練。

## 未驗範圍

未驗真 OAuth、跨真裝置部署、真實模型語義品質、正式世界及正式站寫入。身份 cookie、Cloudflare hosting、模型 transport 與形成骰邊界受控，其餘沿真頁、產品 API 及實際 DB 保存重讀，外網攔截、付費 0。T8 可選 AI 世界配置尚未啟動，沒有假 AI 按鈕；舊 modern browser driver 本輪只更新 bound URL assertions，沒有聲稱全部逐支重刷。最後整合全套及全分支最終審查仍由 root 完成。
