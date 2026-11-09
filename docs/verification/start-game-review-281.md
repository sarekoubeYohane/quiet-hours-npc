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
