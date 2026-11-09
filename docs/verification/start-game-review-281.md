# #281 兩軸審查

## 中途固定快照

比較基準 `249f20c3723d46f1ad7ce3d5ace11be6d575697e`，快照 `1165f6be84069c29211e53c5eb52e093dccf927e`。兩位獨立子代理各用 detached worktree，只審已交付 #283、#284、#285 及 #282 的部分證據。#286–#290 尚在交付，不把它們列為本輪遺漏；本輪不取代整份交付後的最終審查。

Diff：`git diff 249f20c3723d46f1ad7ce3d5ace11be6d575697e...1165f6be84069c29211e53c5eb52e093dccf927e`。提交清單由相同兩端 `git log --oneline` 取得。已確認基準存在且差異非空。

## Standards

1. **硬性違反／P1：玩家預算隨存檔分開，違反既有帳號契約。** `app/api/world/route.ts` 新增 `const id=binding.storageOwner`，後續仍從該世界讀 `playerBudget` 與 `currentUsage(world)`，並以兩者執行 `budgetReached`。同帳號某檔達限後，另一檔仍可繼續付費；新檔亦取得預設額度，而非既有帳號設定。違反 README 的「後端保存每個帳號的設定與計數」及共用玩家預算契約。帳號 `recallUsage` 雖累計 dispatch，沒有參與此停止判斷。需集中玩家有效預算及停止計數，保留世界故事與 operation journal 隔離，補跨檔達限反例。
2. **判斷性建議／P3：possible Duplicated Code。** `lib/model-settings.ts` 複製 `lib/models.ts` 的 `directModels` 白名單；實際派送另用後者驗證。新增支援模型時可能保存遭拒，或保存成功卻無法派送。建議輕量共用名單；這是 baseline smell，並非文件硬性違反。

Standards 共 2 項，硬性 1、判斷性 1，最重 P1。

## Spec

1. **P2：清空保存會遺失 AI 來源，僅改標點即可變成使用者文字。** #284 要求保存使用者／AI 來源與實質修改依據，且只改標點不能把整段 AI 文字變成使用者獎勵來源。`lib/character-drafts.ts` 在文字清空時丟棄 `aiText`；再貼入原 AI 文字便標為 `kind:user, materiallyEdited:true`。重現：AI 產生「在河畔學修鐘。」→清空並保存→貼回「在河畔，學修鐘！」並保存。產品 API／SQLite 重讀確認錯誤來源已持久化，後續形成依據失真。未推論尚未交付的 T5 已實際給獎勵。需保留清空前 AI lineage，再判斷恢復文字的實質修改。

針對反例 1 項如預期失敗（實際 user、預期 ai）；受控 transport，沒有付費呼叫。Spec 共 1 項，最重 P2，未見額外 scope creep。

## 修正與後續

由同一修復實作者處理全部 finding，補 red→green 與真正 API／SQLite 證據。#283／#284 重新開啟核對；相關依賴在修正完成前不結案。#285 的模型設定行為已完成，P3 名單集中化在本輪修正。全部 finding 的修正提交及覆核結果會追加於此。

Standards：2 項，最重 P1；Spec：1 項，最重 P2。尚未完成最終整合審查。

## 額外整合反例（T9 尚未交付）

T9 實作者另外確認：另存請求未受理、回覆不明後頁面重載，若來源已前進，恢復原操作回 409 後清除 pending，名稱輸入會回預設（錯誤訊息仍列原名），未保留成可編輯輸入。此項不回填為兩軸初始 Spec finding，因原快照審查不含 T9；已交同一修復實作者接合 T9 後修正並補真正頁面反例。

## 後續固定快照覆核（尚非最終審查）

- `f2d8dcb`：原 Spec P2 的 API／SQLite 反例 1/1 與草稿 5/5 通過，保留歷次 AI 候選，再判斷實質修改；原 Standards P3 共用模型名單獨立覆核 remaining 0。已整合 `17cc67c`。
- T5 runtime `5eb98a8`：Standards 新增判斷性 P3 一項，形成與草稿複製同一來源文字正規化；Spec 新增 P2 一項，形成的數字指派禁令誤擋「耐力一般」「外觀十分普通」「力量一如往常」。三筆合法文字經產品 API／SQLite 均回 400；不能把日常中文字當成屬性指派。此快照不包含尚未開始的 T6，未以其缺漏計 finding。
- 帳號／T9 `a84ff96`：原 Standards P1 獨立窄測 2/2 通過，中央帳號預算、原視窗與派送前原子保留已解跨檔額度問題。Standards 新增硬性 P2 一項：費用推估誤採帳號跨世界用量，價格識別仍讀舊世界，違反目前前景、相同模型／價格／節奏的採樣契約。Spec 新增 P2 一項：刪除有歷史不確定用量的來源後，另一世界的帳號未知範圍為 1，費用畫面仍顯示完整零元。
- `0165c2d`：Spec 獨立覆核未知費用面板已修，但精簡摘要仍顯示 USD 0.00，原 finding remaining 1，沒有另算新項。

全部修正仍由同一實作者處理。最新工作樹的未知費用真頁兩處已通過，費用推估自動採樣仍在驗證；尚未提供新的固定 ready tip，因此未以工作中結果關票或宣告所有 finding 清零。T5 的兩項 finding 尚待同一實作者接合修正。

該修復分支一次完整測試執行的核心結果為 **1258/1264，6 failed**，後續 auth／Workers／source-pin 組未執行。六個反例修正後窄測 6/6、帳號與草稿 20/20 及 typecheck 通過；不將此記成完整回歸通過。原始 log 保留，最後仍須對固定整合版本完成完整檢查。

## 已整合修正的獨立覆核

- `0ccfef3`：Standards 固定來源確認推估改用 `currentUsage(world)` 及帳號有效價格／版本，原 Forecast P2 remaining 0；Spec 重跑真正 API／SQLite 反例並渲染共用 flag 及兩處 JSX，未知費用 P2 1/1 通過、remaining 0。
- `2355317`：Standards 原 T5 正規化 P3 remaining 0，無依賴的 `text-equivalence.ts` 共用原等價規則；形成、數字禁令、跨檔預算及並行／回放窄測 4/4。Spec 原三筆自然中文已 200，卻新增發現英文 `strength must be 18`、`endurance between 8 and 18` 也被允許形成，數值禁令有 P2 一項，不宣稱模型因此控制了骰果。
- `1645a05`：同一修復實作者補正英文數值語法；Spec 原獨立反例兩筆均 400，同批七筆中英指定／範圍均拒絕，原三筆自然中文仍 200，年齡／身高及中文 2/2、兩份獨立反例各 1/1，remaining 0。

完整 ready tip `238f2c2` 已由 merger 合入 `b653e6f` 並推送。合後 no-network cards／drafts／models **31/31**、save-management **8/8**、typecheck、diffcheck 通過。`2355317` 的帳號、形成、推估三個固定真頁旅程及最後 `1645a05` 形成旅程、typecheck／lint／build 均通過；推估證據實際 61 秒、2 回合，沒有混入另一世界的 10 USD。

本輪已提出的 Standards／Spec finding 均已獨立覆核清零，但這仍不是整份 #281 的最終審查。#287 在 #286 真正 closed 且重新讀取原生圖後才開始；T6–T8 尚待交付，最後須再以 `249f20c` 對完整固定整合分支做兩軸 review 與必要回歸。正式導覽的外部阻擋亦未解除。

## T6 中途審查與修正

固定 `105197b`，比較 `c2a38a3...105197b`：Standards 硬性 P2 一項、smell 0；Spec 同一 P2 交叉確認，沒有另建問題。新 appearance／外觀 alias 原先套所有版本，讓既有 v1 `attribute:null, ability:'外觀', difficulty:12` 與專長 +20 從基準門檻 75／專長 20 變成 55／0，違反 ADR0012 與 #287 的舊義保留。既有 17 項相容測試通過不否定此獨立反例。

唯一修復者在 `7e9cfd7` 以一行產品變更將新 alias 限定明示 v2；新增真 API／SQLite 保存及原 ID 回放反例。兩位 reviewer 各自獨立中英四格及舊 API 19/19 通過：v1 恢復 75／20，v2 保持 55／0，兩軸 remaining 0。完整 ready `6348f9f` 合入並推送 `59bb7d9`，新版真路由 6/6、固定真觀察／分析／重載及 typecheck／lint／build 通過。

後續固定 `c2a38a3` 完整回歸核心 1264/1264 通過，auth 舊 hosting 接點缺 `all`／`batch` 的失敗已確認為 tests-only。修正 `913d842` 合入 `ac3216b`，保留原 API 斷言並新增原子／值綁定契約，合後 auth 40/40 通過。原整次 exit 1 與未跑組別詳見[整合報告](start-game-integration-281.md)。最後完整兩軸 review 仍待 T7／T8 交付。

## T7 接合中途審查（尚未完成）

後端 `b1696a2`：Standards 硬性 0、judgment P3 一項，開局測試整套複製完成卡 fixture；Spec P2 一項，晚到修改／確認只靠當下登入帳號。A／B 同 UUID／版本的 API／SQLite 反例確認誤覆 B 草稿及誤建 B 世界。UI 接合在收到 review 回報前也指出此問題，後端演進 `c159a0e` 已加原 `operationScope`；Spec 捕捉 A 真 scope 後切 B 重送 edit／confirm／restart／v0，均 409，B 資料不變，4/4 與原 9/9 通過，原 P2 remaining 0。fixture P3 尚待唯一修復者收斂。

UI `cff3707`：Spec 新增兩項真 App Router／Chromium 已重現 P2。保存受理前失敗後，恢復 GET 未驗原 scope，B 同 UUID／body 可令 UI 假稱 A 已同步；另暫扣已提交建立成功回覆，實際離開並續玩另一世界後釋放，舊閉包強制導航至新建世界。唯一修復者候選 `28b9edd` 正在固定真頁與獨立覆核，尚未清零或關 #288。

同一接合版另獨立確認 **T9 新 P1**：真正形成卡、開局草稿與保存 API 建 A／B 各自相同 save UUID／版本，切 B 後重送 A 原 copy／delete payload。copy 回 201 建 B 副本；delete 回 200 永久刪 B 來源，A 保留。讀取授權仍有隔離，錯的是原操作身分沒有保留。`save-management` schema 及 `SaveActions` 未將原帳號 scope 帶入 POST。#290 已實際重新 open（留言 6743755849），交同一修復者；未完成前不宣告 T9／整份完成。

上述均在隔離 SQLite／受控模型，正式資料及付費模型為 0。T7 本身仍在合法前置關閉後進行，#289 未開始；不能將尚未交付的 AI 功能列作本輪遺漏。

後續固定覆核：`11f782f` 的 T9 原帳號 P1 已由兩軸獨立清零（Spec 真原 scope 反例及回 A 原 ID 恢復 1/1、Standards API 13/13）；`28b9edd` 兩個 UI P2 亦由 Spec 真頁覆核清零。候選仍待 T7 整包接合，#290 尚未重新結案。`1a3ea10` 另完成 fixture P3 與 UUID 身分 P2：Standards 共用 fixture／v4 pattern 窄組 26/26，Spec 真 v1／v5 拒絕無殘留、正常 v4 保存／讀取／原 ID 回放 3/3。結論各限該項，不能蓋過下列新問題。

## 跨表單原帳號擴充覆核（修正中）

固定 `400eb94`，產品實作者先以真 API／SQLite 自查，Spec 再獨立核對真正 UI payload，確認 **P1 一項、P2 三項**：

- **P1／#285：Key 設定／清除在原 scope 驗證前 early return。** 含 A 真 GET `account-operations:a` 的請求，切 B 後 set／clear 都回 200；SQLite 確認寫入／清除 B 的假 Key。沒有使用真 Key、模型或付費服務。
- **P2／#285：帳號模型預設未保留原帳號。** 依 A GET 的版本及設定組成與 ModelSettingsPanel 相同的 payload，切 B 後 200 改 B，不需要 UUID 碰撞。
- **P2／#284：普通建角保存丟棄原 accountScope。** A 完整 GET 草稿保留 scope，切 B 且同 UUID／版本後仍 200 覆 B；`readCharacterDraftInput` 捨棄該欄位。
- **P2／#288 來源接點：人物文字／場景編輯沒有原帳號綁定。** 依實際 editor payload 重送 A 的編輯，B 同 ID／版本來源被改寫。這是晚到寫入歸屬錯誤，未證明跨帳號讀取漏洞。

#284／#285 已實際重新 open（留言 6744392972／6744398869）。同一修復者另建獨立 worktree，統一檢查所有寫入早退、初始 GET 帳號捕捉與恢復回應，不以當下 cookie 補綁原操作；保留既有 rawOwner／account-operations scope 語義與模型快照／期限規則。尚未有完成候選，不先清零、不啟動 #289。研究 source-pin 的歷史 fixture 遷移亦仍有一項零用量視窗投影斷言待修；不宣告最終完整回歸通過。

同一擴充在 `21c0d46` 另確認 **#283 P2**：原 SSR 身分為 A，觀察頁背景重讀卻無條件將 `scopeRef` 改為 B。真形成卡／開局 API 建 A／B 各自同 save UUID，切 cookie B、觸發 visibilitychange 後舊頁顯示 B 人物，再點下一回合送 B scope 並 200，A turn 0／B turn 1。產品自查及 Spec 真 App Router／SQLite／Chromium 各獨立重現，形成呼叫 2、付費 0；這是舊 view 重綁，沒有證明跨帳號查詢漏洞。#283 已實際重新 open（留言 6744813143）。

修復工作中的 Key 與世界讀取反例已紅轉綠：錯帳號 Key 寫入 409 且無 row；原 view 的 GET／下一回合維持 A scope 並 409，A／B turn 均 0。server checkpoint `55ddc00` 有 API 27/27，但 UI 仍在收斂，尚不是完整候選或獨立覆核完成。普通 CJS／auth 與費用 browser 的既有驗證 client setup 分獨立 worktree 遷移協定；所有產品與新反例修正仍由同一實作者負責。不得將舊無 scope payload 在 cookie 切換後補成當下 owner；新 negative 使用 raw Request 避免 helper 遮蔽。

## T7 完整包固定覆核收斂

完整 ready `7011819`（修復包 `49cc19a`，產品 `5face37`）已整合 `c0ca009`。此前各列問題皆保留為當時真實紀錄；目前所有已提出 finding 均有修正與獨立覆核 0，不代表最終完整分支審查完成。

- **Standards**：共用 fixture／v4 身分 P3／P2 已在 `1a3ea10` 清零；帳號 guards、同帳 pending 初讀 `f9d2345`、分析 reader `e6b0e86` 均經真 API／頁面覆驗。最新 `5face37` hard 0、judgment 0，16/16 API、恢復及兩個分析 reader GET200／turn1／新增 POST0。
- **Spec**：T9 原帳號 `11f782f`、假同步／卸載慢導航 `28b9edd`，以及 `7aa2346` Key／四 surface／世界原 owner 均各自獨立清零。最後兩項新 P2：已 commit 回覆遇 cookie 換帳號導入同 UUID 他人世界、混合場景版本誤用第一版 public，在 `5face37` 各 remaining 0。原帳號世界正確已存、他人世界不變；v1 public／v2 private 的預覽、保存及 GET 一致。

詳 [原帳號介面證據](account-origin-surfaces-281.md)、[最後兩項紅綠與獨立覆核](opening-bound-review-288.md)及 [T7 逐 AC](opening-wizard-288.md)。所有受控模型付費 0。root 原 `5bdc6db` full core1265/1267、補組 Workers14/15 的 exit1 原樣保留；修後針對性綠不拼成全套綠。T8 完成後仍須 `249f20c...完整 integration` 的兩軸審查與固定版本全套。

## 最終完整審查：固定 6ddae5b（進行中）

基準 `249f20c3723d46f1ad7ce3d5ace11be6d575697e`，完整 HEAD `6ddae5b2f11f04138eb46250d0a7a8a0d08d9d65`；基準存在且三點 diff 非空，360 檔 10162 增／807 刪。兩個獨立 detached worktree 分別審 Standards 與 Spec，含全部交付及既有責任，不只新 T8。

- **Standards 新 P2（硬性）**：`app/api/opening-drafts/arrange/route.ts` 分開提交草稿及採納收據，違反故障後原操作恢復的原子性契約。真 SQLite adopted UPDATE ABORT 後 draft.version2／city已改、proposal complete；移除故障重送同 request 409。反例 `/tmp/standards-adoption-receipt-6dd.mjs`，log `/tmp/quiet-hours-context/standards-adoption-receipt-6dd.log`。
- **Spec 同一 P2 獨立確認**：引用 #281「回覆遺失／結果可能已保存先恢復原操作」及 #289「失敗保留原輸入與已存安排」。真卡／整理 API、磁碟 SQLite 複現相同中間故障，原 request 無法恢復。反例 `/tmp/quiet-hours-final-adoption-atomic-spec.mjs`／`.log`。

兩軸各 controlled 2／paid 0，沒有把既有 47/47 或採納前故障通過當作本例已修。#289 已重新 open，全部 review finding 仍由同一修復者處理。兩軸其他完整審查尚未結束；原始 `6ddae5b` full 正在另一隔離樹執行，此 finding 不因舊全套通過而消失。

### Standards 最終原報告

硬性 **1 項 P2**、判斷性 smell **0**。採納草稿與收據分開提交，第二次寫入故障後原 ID 無法恢復，違反 ADR0004 原子提交／同 ID 語義與採納恢復契約。實際 503→draft.version2／city已改→proposal complete→原 request409；既有 T8 9/9 並未覆蓋此窗口。其餘全產品 since249 與 12 項 baseline 掃描未提出新增問題。

### Spec 最終原報告

已重現 **3 項 P2**，scope creep **0**：

1. **採納部分提交後不能原請求恢復**，與 Standards 同一問題，引用 #281 原操作恢復要求。
2. **人物重選靜默刪相依資料**：`components/opening-wizard.tsx:60` 暫取消卡時 filter relationships／accessGrants，真頁再選回同卡、兩次 autosave200，DB selected1 但兩陣列空。違反 #281「修改人物選擇…重新核對，不默默刪除相依資料」。反例 `/tmp/quiet-hours-final-selection-dependencies-spec.mjs/.log`，controlled1／paid0。#288 已重新 open。
3. **直接數字不等式未阻擋**：`lib/character-formation.ts:13` 白名單漏「高於」「大於」「greater than」；三筆真 scope API200 並形成鎖字、受控力量12。違反 #281／#286 的數字／範圍禁令，不表示模型改骰。反例 `/tmp/quiet-hours-final-numeric-inequality-spec.mjs/.log`。#286 已重新 open。

窄組 47/47、49/49、6/6 及兩條 T8 真頁通過，仍不否定這三個新 RED。沒有改產品、沒有付費／正式操作；正式站及真人語義未驗，已知 #282 外部阻擋不列新產品 finding。全部交唯一修復者處理；後續每項固定覆驗才記 remaining0，尚未清零。
