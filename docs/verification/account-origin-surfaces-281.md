# 原帳號製作、Key 與世界畫面的作用域覆核

本輪修正已交付功能的跨帳號寫入／恢復漏洞；不是開始後續受阻票。#283、#284、#285、#290 的完成狀態仍由整合分支與獨立覆核決定。

## 可重現反例與修正

- Key P1：固定 `1a3ea10` 真 App Router 下，A 取得 `account-operations:a` 後換 B Cookie，原 set-model-key 請求回 200，SQLite 實際新增 owner B 的 Key。相同受控 tracer 套 guard 後回 409，資料列為零。兩輪模型／付費皆 0。原 log：`/tmp/quiet-hours-context/account-surfaces-key-red.log`；dirty 紅綠查核：`account-surfaces-key-green.log`，不得把後者稱為固定版本驗收。
- 帳號模型預設及人物草稿／人物文字範本／場景範本：A/B 使用相同 ID、版本時，舊 A 表單會改寫 B。現在初始 GET 回原帳號 scope，寫入必須明示原 scope，於解析故事資料、操作恢復或副作用之前驗證；metadata 不保存到故事欄位。
- 世界畫面：原 A 頁在 Cookie 改 B 後的 visibilitychange 會重新綁 B，接著把下一回合派送給 B。現在初讀先核對 SSR 原帳號，後續 GET／恢復固定原世界 binding；scopeMismatch 不重新綁定 Cookie 帳號。正式選檔／帳號的新頁面以不同 React key 建立新生命週期。

scope 沿用原責任：製作資產與帳號模型設定為 `account-operations:<owner>`；世界操作為原 storage binding；開局及另存管理仍為原 raw owner，未全面改寫識別語義。

## 固定版本證據

`7aa2346` 的真 Chromium／App Router／隔離磁碟 SQLite：

- `browser-account-surfaces-281.mjs`：設定頁 Key／模型、建角自動保存、文字範本、場景表單在換帳後全部回 409；A 原輸入仍可見，B 無對應新資料或設定改動。模型 0、付費 0。畫面與 origin／commit：本文件同名目錄。
- `browser-world-original-account-281.mjs`：A/B 經合法形成卡→開局草稿→確認保存，使用相同 save UUID；舊 A 觀察頁改 B Cookie 後刷新 409、仍顯示 A，下一回合仍帶 A scope 且 409，A/B 各第 0 回合。controlled 2、paid 0。
- `browser-character-drafts-284.mjs`：真首頁→人物→手寫→受控 AI 只補白→重載／第二裝置／409 輸入保留／跨帳號，controlled 1、paid 0；`/tmp/account-drafts-281-fixed`。

後續 `b7a5bf0` 承接相同產品 runtime，`browser-character-cards-286.mjs` 真頁受控補完＋形成、配點、已提交回覆遺失恢復、完成卡與新開局選用皆通過，controlled 2、paid 0；`/tmp/account-cards-281-fixed`。

## API 與必要檢查

- `node --experimental-strip-types --test tests/account-origin-surfaces.test.mjs tests/character-cards.test.mjs tests/opening-wizard.test.mjs`：27/27。新反例覆蓋相同資產 ID／版本、缺 scope、錯 scope、只讀恢復、Key 設／清、未派送的 discard／allocate；跨帳號拒絕後 SQLite 草稿完全不變，原 A 可續存。
- `node --experimental-strip-types --test tests/character-drafts.test.mjs tests/character-templates.test.mjs tests/scene-templates.test.mjs tests/model-settings.test.mjs`：27/27。原版本衝突、故障、來源、帳號用量與設定 assertions 保留；一般 Request setup 加原 scope。
- `pnpm typecheck`：通過。`pnpm lint`：0 errors、17 warnings（既有圖片／驗證 helper unused）。`pnpm build`：通過。完整整合套件仍須在最終整合固定版本驗證；本輪未宣稱完整 #281 完成。

受控模型只證明 transport／保存／恢復契約，不代表真實模型語義品質已驗收。未呼叫正式站模型、未遷移或改動正式世界。

## 同帳號首次恢復回歸與補正

獨立 Standards 在 `7aa2346` 真頁找到首次讀取後的 receipt 恢復 URL 使用進入函式時的空 ref，送出 `operationScope=` 而被正確拒絕。原反例與 log：`/tmp/standards-world-recovery-7aa.mjs`、`/tmp/quiet-hours-context/standards-world-recovery-7aa.log`。原跨帳號 finding 已解，不代表這項恢復回歸已解。

`f9d2345` 以通過 SSR 原帳號核對的 `d.operationScope` 建立 receipt URL，保留原帳號／存檔 guard。`browser-world-recovery-scope-281.mjs` 固定真頁通過：合法形成／開局保存→規則下一回合提交→留原 payload 模擬回覆遺失→重新載入，GET 原 receipt 200/settled、pending 清除、世界仍 turn 1，HTTP 世界 POST 只有原本 1 次。controlled 1、paid 0；本文件同名目錄 `recovery-evidence.json` 與畫面。

receipt GET 現要求原 operationScope，普通初次 GET 保留 bootstrap；缺 scope 的新恢復讀取直接 409，既存 journal／結果不改義。各驗證 helper 在 Request 建立處明示原 fixture binding，沒有放寬產品檢查或以目前 Cookie 補舊請求。

`87fe5d0` 真五步旅程也已通過，step 3 實際設定甲屋住處／客廳臥室／乙屋工作／甲屋所有權，確認頁顯示上述人類名稱，保存後實際 configuration 與確認候選完整一致；受控模型 1。原始開局另建第二份及兩世界各自續玩仍通過。獨立 `opening-durable-journey-288.mjs` 真資料庫關閉／重開旅程也通過，模型 1；未以直接安裝世界替代新建。

## 研究正例的責任與限制

既存 sealed 研究旅程本來就使用隔離歷史 scene fixture；不再呼叫已退役的玩家 reset，不冒充玩家新建成功。`initializeHistoricalTrial` 保留實際中央 payer、原預算、journal 與 Key；故事診斷與中央帳單分開讀。

原 `1a3ea10` source-pin 全檔結果為 20/21，原 log `/tmp/quiet-hours-context/t7-research-source-pin-full.log` 保留。唯一失敗把世界診斷開始時間與中央帳務開始時間直接相等比較（差 26ms）；修正為對真正已計費的中央原 window，逐 trial 與最終 SQLite 重讀保持相同，仍斷言原 12 calls／30,000 tokens 額度不刷新、calls=12。

`ddad506` 固定執行 `node --experimental-strip-types --test --test-name-pattern='default 12-call|positive forwarded' tooling/experiments/pursuit-runner-228.test.mjs`：2/2。正例 10 trials／80 advances，17 controlled provider + 64 partner fixture = 81 engine calls，實際 SQLite 關閉重開、原中央 payer 累計與原 100 calls／1,000,000 tokens 預算保存，真付費 0；未改 wall clock。log `/tmp/quiet-hours-context/account-surfaces-source-pin-narrow.log`。其餘 19 項沒有以本輪固定源重刷，最終整合仍須完整現行套件。

## 最後接合檢查

已接合純 CJS／auth scope helper `770371b`、兩費用 browser helper `898e9cd`、T7 完整報告 `3892a6f`、最新 integration `1829384`，並採納 README 指南 `e4a5eaf` 的相同 patch；沒有改寫正式資料。

`e92f53c`（產品含原帳號所有 guards、SSR／sticky 表單、世界首次恢復、兩私人證據 consumer 原 binding、確認頁角色名稱映射、規則模式文案）：

- 資產／製作／開局／模型／migration／新增 scope API：55/55。
- world saves／save management：16/16。
- budgets／costs／pursuits／operation evidence／decision traces：65/65。原退休 reset 相關舊正例改 409＋歷史／帳單保留；首輪誤以 activities runner 跑 auth-only reset 的工具錯誤另保留 log，完整 auth runner 改正後 40/40。
- `pnpm typecheck`、`pnpm build` 通過；`pnpm lint` 0 errors、4 個原有 warnings（圖片與既有 act effect）。移除了本輪 helper 遷移留下的無用 bindings。
- 原獨立 Spec 的 Key P1／四帳號 surface P2 及 Standards 的同帳號恢復／兩分析 consumer P2 均已各自重現覆核為 0；這不是整份 #281 的最終完整 review 或 full suite。

兩分析 consumer 修正前的同腳本 RED 明確收到缺 scope 的 409：`/tmp/quiet-hours-context/account-analysis-read-red.log`；修正後由已驗證 evidenceScope 傳原 binding endpoint，server guard 未放寬。產品 `operationId` GET caller 盤點為 WorldApp 恢復、OperationEvidenceDetails、DecisionTraces；SaveActions 是另一個已固定 raw owner 的恢復 endpoint。歷史 `tooling/verification/browser14x` 等舊直接世界 fixture 工具未冒稱本輪全部重跑，完整當前測試由最終整合處理。

最後正常頁面固定 `e92f53c`：

- `browser-opening-wizard-288.mjs` 全程真首頁→形成卡→場景→五步開局／返回修改／離頁草稿接續／重載／最後確認→提交後回覆遺失恢復→原始開局另建→兩份各自續玩 2／1，controlled 1、paid 0。最後確認角色住處／臥室／工作／所有權與保存 configuration 相同；`opening-evidence.json`、`opening-confirmation.png`。
- `browser-world-recovery-scope-281.mjs` 先恢復已提交原 operation，再實際切分析頁讀兩私有證據 consumer；三個 receipt GET 全 200，原 world POST 仍只有 1、turn 1、pending 清除，controlled 1、paid 0；`analysis-evidence.json`、`analysis-recovered.png`。
