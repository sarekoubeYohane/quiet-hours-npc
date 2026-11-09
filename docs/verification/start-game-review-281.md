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
