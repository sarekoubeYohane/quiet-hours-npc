# #281 開始遊戲與人物卡整合驗收

狀態：**#283–#290 八張產品票已完成並 closed；#282 正式唯讀驗收受環境阻擋，#281 保持 open，PR 保持 draft。** 單一分支 `integration/start-game-281`，[PR #291](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/291)。最後固定產品驗證 `7e4bb5a`：完整 **1417/1417**、typecheck、lint（0errors／4既有warnings）、兩環境build均通過；所有兩軸finding已獨立覆核0。[機器摘要](assets/start-game-final-281/final-7e4bb5a-summary.json)。

## 接手與授權範圍

使用者本輪明示授權產品實作、本機隔離資料庫遷移與驗收、提交、推送工作分支及 draft PR；未授權 main 合併、部署、正式資料遷移、付費模型或正式世界推進／刪除。

接手時原工作樹 `/workspace/quiet-hours-npc` 位於 `work`，乾淨，沒有切換或清除原檔案。遠端 main 與 PR #280 merge commit 都重新確認為 `249f20c3723d46f1ad7ce3d5ace11be6d575697e`。另一個 open draft PR #60 與本次無關，未改動。integration 及各實作者各建獨立 worktree。

已讀 AGENTS、matt-pocock、issue-tracker、GLOSSARY、相關既有 ADR，載入 implement-spec、tdd（含 tests／mocking）、code-review、pr；領域文件依 domain-modeling 補正。完整 #281、#282–#290 最新本文／留言、原生 blocked-by，以及 #238–#251、#271、#272、#275、#277、#278 的本文及留言均重新取得。clone 未包含 #281 提及的未提交 grill、舊導覽報告或 ADR0013–0017，已明示缺件；沒有冒充讀取或重建原檔。

## 任務圖與目前證據

原生關係以 GitHub API `issues/{number}/dependencies/blocked_by` 重新讀取；不是按票號順序實作。每票完整驗收、合入 integration 並推送證據後才關閉；再重讀原生前置狀態才開後續。

| 票 | 原生前置 | 狀態與整合證據 |
| --- | --- | --- |
| #282／T1 真導覽 | 無 | 本機最新真首頁旅程通過；正式有效新試次0，CONNECT403／CUA／AT-SPI等連線或工具阻擋，保持open；[最新本機報告](navigation-282-d9a692f.md)、[原阻擋證據](navigation-282-2026-11-09.md) |
| #283／T2 選檔 | 無 | 原帳號預算 P1、背景讀取重綁 P2 均修正並獨立覆核，T7 整包 `c0ca009` 已整合，已推送並重新結案。原整合 `0f279ca`，[報告](world-saves-283.md)及[帳號修正](player-account-review-fixes-281.md) |
| #284／T3 文字草稿 | 無 | Lineage 及普通草稿原 accountScope P2 均修正並獨立覆核，整包 `c0ca009` 已整合，已推送並重新結案。原整合 `5b8abcb`，[報告](character-drafts-284.md) |
| #285／T4 模型設定 | #283、#284 | 設定／期限矩陣及 Key 原 scope P1、模型預設 P2 均完成修正並獨立覆核，整包 `c0ca009` 已整合，已推送、原生前置實際閉合後結案。原整合 `7634552`／`152c180`，[矩陣](model-settings-285.md) |
| #286／T5 形成配點 | #285 | 原完整交付保留；最終比較數值及年齡回歸 P2 已修並獨立0，整合 `e581871`，新固定1417/1417及兩環境build通過，證據f3d1657推送後重新核對原生前置並closed；[矩陣](character-cards-286.md) |
| #287／T6 新 d100 | #286 | 完成，整合並推送 `59bb7d9`，舊外觀專長 P2 修正並獨立覆核後 closed；[矩陣](versioned-d100-287.md) |
| #288／T7 五步開局 | #287 | 前置實際 closed 後開始；完整五步及人物重選 P2 已修並獨立0，整合 `e581871`，新固定1417/1417及兩環境build通過，證據f3d1657推送後重新核對原生前置並closed；[逐項報告](opening-wizard-288.md) |
| #289／T8 AI 配置 | #288 | 完整交付及最終採納原子性 P2 已修並獨立0，整合 `e581871`，新固定1417/1417及兩環境build通過，證據f3d1657推送後重新核對原生前置並closed；[逐項矩陣](ai-opening-arrangement-289.md) |
| #290／T9 另存刪除 | #283 | 原交付及帳務／名稱修正保留；跨帳號原操作 P1 已修並獨立覆核，整包 `c0ca009` 已整合，已推送及前置實際閉合後結案；[矩陣](save-management-290.md) |

過渡期 T2 曾以既有城市建立契約驗證獨立保存邊界；T7 現已改接完成卡與最後確認開局，舊 raw city／文字範本不能繞過形成建立新世界，原地 reset／start-city 已退役。文字草稿與完成卡分開；詞彙表及 ADR0012 延伸明示新規格與舊版本責任。

原生圖未變；所有後續都在當時前置真正 closed 且再讀原生狀態後開始。中途與最終審查重新開啟的票，均修復、獨立覆核、整合、推送且通過必要驗證後才依圖重新結案。最後 GitHub 核對 #283–#290 全部closed，#281／#282 open；main仍為 `249f20c3723d46f1ad7ce3d5ace11be6d575697e`。完整歷程及原失敗紀錄保留於下文與[兩軸審查](start-game-review-281.md)，不以不同來源的結果混算全綠。

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

`0015_save_management.sql` 保存另存操作去重、刪除 tombstone 與會計缺口；`0017_character_cards.sql` 分開形成判讀及完成卡；`0018_player_account_budget.sql` 保存中央帳號預算／價格／用量與最小派送會計 marker。fresh 隔離本機 D1 全部遷移已成功。不得刪除中央會計後從故事副本重建，或回到每份存檔各給新額度的程式；另存與刪除的持久化收據也不能丟棄後宣稱仍可安全重送。

回退須保留新增草稿與存檔表、世界 storage rows 及新版語義；舊程式只認原帳號世界，不能完整呈現新增存檔。不可 drop 新表或丟棄欄位後宣稱無損回退。後續遷移及限制會在實際交付後追加。

## 尚未驗證與完成門檻

- #282 正式站完整唯讀點擊試次仍未完成，須解除連線與真人登入條件；本機 cookie 身分不等同正式 OAuth。
- T7／T8、最後固定全套及完整兩軸審查均已完成；產品沒有待修finding。
- 真人 OAuth、正式站跨真裝置條件仍未驗收；本機受控身分不代替正式登入。
- 受控模型只能驗證採納、保存及產品邊界，真實模型語義品質未驗收。
- 全部完成才可將 PR 標 ready；目前保留 draft，不合併、不部署。

以下保留各快照的歷程；「待執行／修正中」是該快照當時狀態，現況以本文開頭及最後完整驗證／結案紀錄為準。

## T4 及後續補證

T4 以 runtime `42ec76b` 完成真頁模型設定／取消／故障／返回，保存設定及 Key 不派模型；明示補完才呼叫受控模型一次。原 runtime `7634552` 另外通過跨裝置清 Key／受控到期後原頁設定面板、保留原存檔與輸入、零額外派送的反例。初步檢查曾看較早工作快照而推測缺口；對最終來源及真正試次核對後，確認已有保護，補證沒有產品 RED，沒有宣稱修復。

T1 在 2026-11-09 20:39 台北時間完成一次有界重連，仍為工具 requirements 錯誤，正式有效試次仍為 0；追加證據合入 `4b6d25b`。已額外核對 Browser 技能與可用工具，未取得可控制已登入本機 extension 的通道；不能假稱已連線或已驗收。

## 中途審查修正

[兩軸審查](start-game-review-281.md)固定 `1165f6b`：Standards 2 項（最重 P1，帳號玩家預算；另有 P3 名單重複），Spec 1 項（P2，AI lineage）。已重新開啟 #283／#284，由同一修復實作者處理全部 finding，#290 暫不結案。#286 是在 #285 已 closed 後開始；已通知形成實作者接合 lineage 修正前不宣告獎勵判讀驗收完成，只繼續不受影響工作。沒有在重新開啟後開始新的後續票。

## T6 與完整回歸新證據

T6 固定產品 `7e9cfd7`、整合 `59bb7d9`，明示 d100-v2／能力版本 2 隨活動及結果保存。兩軸同一舊外觀專長 P2 修復後獨立 remaining 0；新真路由 6/6（26 門檻邊界、磁碟重開及原 ID 回放）、舊相容 19/19、固定觀察／分析頁重載、typecheck／lint／build 通過。合後新組 6/6、typecheck／diffcheck 通過才推送及關 #287，沒有先開 #288。

另一份隔離 worktree 固定 `c2a38a3` 執行 `pnpm test`：核心 **1264/1264、fail 0**；隨後 auth／Key 組因舊測試 D1 接點缺 `all`／`batch` 出現多項 502，等待派送的測試 gate 因前置失敗未進入，停在該組。確認根因後僅終止本人這次失敗的 auth runner，整次 **exit 1**；後續組未跑，raw log 保留在 `/tmp/quiet-hours-context/integration-c2a38a3-full.log`，不稱完整全綠。

同一修復者只補測試 hosting 的 immutable bind、真 `all`、同步 SQLite 原子 batch／rollback，原產品、播種前提及 API 斷言不變。[診斷與紅綠證據](auth-fixture-regression-281.md)。完整 auth **40/40**（原 38 加兩項接點契約）、真 Workers／D1 **2/2** 及 typecheck 通過；合入 `ac3216b` 後再跑 auth 40/40、diffcheck 通過。這不能替代 T7／T8 完成後的最後固定整合全套。

固定 `1b09069` 補跑原先未執行組：Workers／遷移閘門／需求 **15/15**、source-pin **21/21** 通過；資產／草稿／卡／模型／遷移／新 d100 組 **43/44**，唯一失敗為另一個舊人物範本測試的 SQLite 接點缺 `batch`。真正帳號 GET 回 503，舊 helper 直接讀缺失 world 才誤報 contextId。唯一修復者加狀態斷言、保留原故障語義及 API 斷言，補原子 batch 與一項接點契約；該檔 **3/3**（原 2 加 1）及 typecheck／lint 通過，合入 `ae13572` 後再跑 3/3、diffcheck 通過。原 43/44 log 與不同固定版本的結果分開保存，未稱同一整次全綠。

## T7 完整交付與原帳號覆核收斂

T7 ready `7011819` 接合最後修復包 `49cc19a`，產品固定 `5face37`。真正五步、返回修改／資產返回、草稿接續、兩世界各續玩 2／1、磁碟關閉重開、原始開局另建、刪來源副本續玩已通過；所有明示配置與最後確認及保存讀回一致，建立維持 turn 0。來源 v1／v2 可同時選用，各自房間、門、物件與 public／private 規則按精確版本保存。逐 AC、命令與畫面見 [T7 報告](opening-wizard-288.md)及[最後覆核](opening-bound-review-288.md)。

重新開啟的 #283 背景讀取重綁、#284 草稿原帳號、#285 Key／模型偏好、#290 copy／delete 原帳號問題，均由唯一修復者處理並各自獨立覆核為 0；相關 API／UI／receipt reader 及完成導覽使用原帳號前提，query owner 不充當授權。後續同帳 pending／analysis reader、晚到成功回覆與混版場景兩例也已修復並獨立清零。詳 [帳號介面](account-origin-surfaces-281.md)、[T9](save-management-account-review-290.md)與[最後覆核](opening-bound-review-288.md)。此為指定 findings 的結論，尚非全分支最終 review。

固定 `5face37` opening API **16/16**、acceptance **9/9**、真 Workerd／D1 **1/1**；`71888ee` 受影響城市組 **24/24**、typecheck／lint（0 errors、4 既有 warnings）／build 通過。`49f6d85` 真頁從 v1 草稿實際加入更新的 v2、重載、確認與保存，兩版各自規則不變。後續提交僅 driver／報告，產品樹差異為零。

root 隔離樹固定 `5bdc6db` 的完整原執行仍 **exit 1**：core **1265/1267**（兩處舊 reset 預期 400，退役後正確為 409）；補組 auth **40/40**、assets **61/61**、Workers **14/15**（唯一普通 constructor 缺原 scope），source-pin 另跑 **21/21**。原 logs 保留：`/tmp/quiet-hours-context/t7-5bdc6db-{full,remaining,sourcepin}.log`。修後 acceptance 9/9、城市 24/24、Worker 1/1 不合算成一次完整全綠；T8 完成後仍須固定 integration 全套與兩環境 build。

`0019_opening_drafts.sql` 以真正 Wrangler **--local** 演練，獨立 fake DB／state，16 份 SQL 成功；既有 state／D20 journal bytes、version、lease、city_started 及缺原始開局 null 均不變。沒有正式 migration。回退保留新增表／原始開局／卡值／骰果／帳務及收據；舊程式不能安全支援新尺度與新開局，不可 drop、重抽或以原地 reset 取代回退。

合後固定 `c0ca009` opening API **16/16**、`pnpm typecheck` exit 0，產品樹與 `5face37` 相同；來源 diffcheck exit 0。完整 diffcheck exit 2 的六處均為三份原始 Wrangler stdout log 的尾空白，保留證據原樣，未新增忽略規則。

## T8 完整交付與最後固定檢查

T8 ready `f34849b`（產品 `2fb450b`）已由 merger 合入 `d8b8a2e`，產品樹完全相同。可選整理使用凍結卡／場景、保留明示內容，先保存可編輯候選再明示採納，沿手動的同一份草稿、合法性檢查、最後確認及原子世界保存。pending 重載、失敗解鎖、缺 Key 取消後手動完成、再次失敗取回前次已存建議與版本承接皆有真頁紅綠；不重新取骰或自動付費重派。詳 [T8 逐 AC／畫面／命令](ai-opening-arrangement-289.md)。

固定相關 API **51/51**（本票 **9/9**）、世界／操作／另存／城市 **40/40**、兩條完整真頁旅程、typecheck／lint（0 errors／4 既有 warnings）／build 通過；合後 AI9＋opening16 **25/25**、typecheck 再過。模型受控 transport：主旅程 2 次、pending／失敗手動旅程 3 次，各 paid 0；真模型語義品質未驗收。

`0020_opening_arrangements.sql` 真 Wrangler --local fresh **17 份 SQL**、0019→0020 升級成功，舊 state／D20 journal／version42／lease／city_started／null opening hash 前後一致。新表獨立保存 operation／proposal metadata，不入故事或原始開局／另存；回退不可刪表、換 ID 重送或重置帳務。未正式遷移／部署。

最後完整檢查將固定本次完整 integration commit，在獨立驗證樹執行 `pnpm test`，另在同版 build 樹執行 typecheck、lint、build:test、build:production；Spec／Standards 各獨立 detached 樹比較 `249f20c...固定HEAD`。結果未出前不宣告全綠。原始 Wrangler stdout 的尾空白保留，來源 diffcheck 通過，不用 ignore 掩蓋 raw evidence。

最新本機 T1 導覽補證亦已整合 `8176774`，固定 `d9a692f` 的真首頁兩入口、重載、產品返回／browser back、原 owner URL 皆通過，POST／model／paid 0；[報告](navigation-282-d9a692f.md)。正式無新可用已登入通道，有效新試次 0，#282 仍 open；此缺口未解除則 #281 保持 open、PR 保持 draft，不提前 ready。

## 最終審查新增採納交易 P2（重新開啟 #289）

Spec／Standards 在固定 `6ddae5b` 各自獨立確認同一問題：真 API／磁碟 SQLite 對 `opening_arrangements` 的 adopted UPDATE 注入失敗，採納回 503，但前一筆草稿 city／version 已提交、proposal 仍 complete；移除故障後重送完全相同原 request 回 409，無法恢復原採納。這與已通過的「採納前失敗」或「全部成功後回覆遺失」不同。各 controlled 2／paid 0，沒有 fixture 世界捷徑。

#289 已實際重新 open；唯一修復者在全新獨立樹處理草稿 CAS／proposal revision／採納收據的同交易提交，再補中間故障、回覆遺失及原操作恢復。兩軸其餘完整檢查、固定 `6ddae5b` 全套仍繼續。該版 typecheck、lint（0 errors／4 舊 warnings）、build:test／build:production 已各 exit 0，但不能否定此新增反例。未修復、獨立覆核及整合推送前不重新結案。

最終 Spec 另確認兩個 P2，#288／#286 亦已實際重新 open，全部仍交同一修復者：暫取消再選回同卡，關係／許可被 `cardToggle` filter 靜默刪除；「力量高於18」「力量大於18」「strength greater than 18」仍 200 形成鎖字。前者需保留相依輸入並明示重新核對，後者需合理辨識數值比較且保留正常背景；已存值不重新形成。兩軸最終原報告為 Standards hard1／judgment0，Spec P2三項／scope creep0（採納交易為同一問題），distinct 三項待修，不將窄組綠當清零。

## 最終修復逐項獨立覆核

完整修復 ready `c1ae5c5`，產品固定 `d1ddc36`，含原子採納 `a3ada6c`、人物相依設定 `d4b3428`、比較數字禁令 `1861ffd` 及修後英文連字年齡回歸 `d1ddc36`。所有已提出問題均獲獨立覆核 remaining0，Standards 最後 hard0／judgment0；Spec 原三項及新例外回歸均0。[完整紅綠、命令及畫面](start-game-final-review-fixes-281.md)。

- 採納第二筆寫入失敗時，草稿及 proposal 一起 rollback；移除故障後同原 request200、版本只+1。磁碟重開、並行與 stale revision 亦驗證，恢復 model／dice0。
- 取消／復選人物時關係及許可始終保留，重載提示未選引用並阻擋確認；只有明示清理才移除。有依賴的場所先核對解除引用，不靜默刪除安排。真頁 CAS409 保留輸入、正常保存 turn0。
- 原30個非法比較數字形成前400／0modeldice，普通中文／年齡身高200並保存原文。新增 hyphenated-age 誤擋也由真API RED修正；5個合法年齡／cm／kg與Unicode連字號200，直接18與18–20／18-20仍拒絕。所有原ID重播不增加模型或骰。

固定 `d1ddc36` 相關 API／disk **59/59**、typecheck／lint（0errors／4舊warnings）／build通過；各真頁來源明確列報，不把年齡修正前畫面改稱新版本。本輪未新增migration，沒有改寫已保存卡／骰／故事／帳務。

原 `6ddae5b` 完整執行已真正 exit0：五組 **1267、40、71、15、21**，合 **1414/1414**，typecheck／lint及兩環境build各exit0；raw log SHA256 `b2406fa7ee6dac153a39d60f96387cc719f2dacc80b1433962b8f6585ebe839f`，來源與範圍見[機器摘要](assets/start-game-final-281/pre-fix-6dd-summary.json)。此為修正前完整綠，不涵蓋最後修復，不否定審查新反例。新整合完整版本另行固定執行全套與兩環境build，結果未出前不宣告完成。

修復包已由 merger 精確整合 `e581871`，產品樹對 `d1ddc36` 差異0；合後 AI／opening／cards **39/39**、typecheck、來源 diffcheck 通過。#286／#288／#289 先保持 open，新固定檢查及證據推送後再依原生關係結案。

## 最後固定完整驗證結果

完整 integration **`7e4bb5aa5b5b91ca053c050d8f3defe459431fb8`** 包含全部最終修正。乾淨 detached `/workspace/quiet-hours-regression-281` 執行現行 `pnpm test`，五組依原腳本順序全通過：

| 組 | 通過／總數 | fail／cancelled |
| --- | --- | --- |
| 核心 | 1267／1267 | 0／0 |
| 帳號／認證 | 40／40 | 0／0 |
| 資產／人物／開局 API | 74／74 | 0／0 |
| Workers／D1／遷移閘門 | 15／15 | 0／0 |
| source-pin | 21／21 | 0／0 |
| 合計 | **1417／1417** | **0／0** |

整次 **exit0**，source-pin 結束後該樹 git status 仍乾淨，沒有把不同來源的綠拼成一次結果。raw log SHA256 `7ab4231552e8f91e38f85565f16e91c3d44060bca90aaf7dd57ae18297fab153`；[完整機器摘要／各命令log hashes](assets/start-game-final-281/final-7e4bb5a-summary.json)記錄固定來源、各組及退出狀態。這次才涵蓋原子採納、人物相依及數值／年齡最後修正，舊版失敗／1414綠紀錄仍保留為不同來源。

另一個相同 SHA 的獨立 build 工作樹，`pnpm typecheck`、`pnpm lint`、`WRANGLER_SEND_METRICS=false pnpm build:test`、`WRANGLER_SEND_METRICS=false pnpm build:production` 全部 exit0。lint **0 errors／4 既有 warnings**，沒有新增 warning。build 不部署，沒有正式 migration／世界操作／真付費模型。

兩軸最終 findings 已逐項獨立覆核0；新完整驗證亦通過，產品無待修阻擋。#286／#288／#289 待這份證據推送後依原生前置實際結案。後續提交只補文件／機器摘要與工作樹清理紀錄，產品與測試來源對 `7e4bb5a` 差異須為0，不因文件再跑同套。

唯一尚未驗收為 #282 正式唯讀旅程：目前仍無已登入本機瀏覽器控制通道、沒有有效正式新增試次，既有連線／工具阻擋無新解除證據。正式站沒有被判為產品失敗，也未宣稱未知根因修復。#281 仍不能宣告完成，PR #291 保持 draft，不能提前 ready。真實模型語義品質與真人 OAuth／真跨裝置部署未驗收。

## 最後結案與工作樹保留

完整驗證證據 `f3d1657` 推送後，重新讀取原生前置：#286←#285 closed、#288←#287 closed，先各重新結案；再讀 #289←#288 closed 後結案。GitHub 最後核對 #283–#290 皆closed，#281／#282 open。沒有為解阻提前關票，沒有開始新後續票。

所有子代理及驗證程序結束後，逐樹檢查 tracked／untracked 均乾淨才清理本輪 **27** 個輔助worktree，沒有force移除。ignored的非建置根路徑先完整移至 `/workspace/quiet-hours-preserved-local-281/`，共33根（`.wrangler`與`next-env.d.ts`等），[本機保留清單](/workspace/quiet-hours-preserved-local-281/manifest.json)記錄原path／HEAD；不讀或公開設定值。`/tmp`下原始log、反例腳本及隔離D1資料未清除，branch refs保留。

原 `/workspace/quiet-hours-npc` 保持 `work`／`249f20c` 且乾淨，本機設定及原檔未動；`/workspace/quiet-hours-integration` 保留交付。後續提交只更新文件及驗證摘要，對 `7e4bb5a` 的產品／測試／工具／依賴差異0。未合main、部署、正式migration／世界操作或呼叫付費模型。正式#282缺有效旅程，因此不標PR ready、不宣告#281全部完成。
