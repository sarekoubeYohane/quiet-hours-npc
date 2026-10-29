# 分層追求工程契約

來源為 #220；本文件先記錄 #221 最小切片。後續 #222–#228 仍須擴充候選、共享排序、主觀滿足、複雜退出、喚起與滿載旅程，不能以本切片視為整體完成或真實行為改善。

世界以 `pursuitVersion:1` 與隨新世界建立的 `pursuitContext` 辨識。`Character.intents` 是唯一追求權威：既有 identity、content、三種程度及簡短 context，增加 version、kind（direction／intent／task）、scope、satisfaction（可 null）、parents、references、status、reason。新世界每人只有設定提供的一個方向，沒有自動拆出的供餐或創作任務。保存的 `goal` 是原始設定，正常輸入的 `self.goal` 從當前有效 direction 導出，角色放下方向後不重新注入原設定。

`npc-decision.v3` 在原同一次正常決策回傳 `pursuitContext`、`focusIntentId`（可 null）、`pursuitUpdates` 與原 action／methodAssessment。更新 `{operation,id,version,node,references,reason}`；upsert 的 node 帶完整主觀節點欄位，新版號 0，既有用當次版本，保存時加一。drop 的 node 為 null，保存 dropped 身份與版本，不刪除後以 version 0 復活。空更新、未提及均保留，不再接受完整 intents 覆寫或「省略即放下」。upsert 可新增方向，無上層與開放終點合法；方向內容及意願由模型選擇。

當下焦點和 methodAssessment.intentIds 一致（有焦點一項，無焦點空陣列）。活動計畫的 pursuitIds 只連結既有同一份進度；continue 不重新開始，直接控制不改造自主追求。追求變更痕跡與完整 provider 實錄是觀察者證據，不送回 NPC、記憶或故事事件。

第一切片支援單父關係，拒絕自環、循環、重複、新增不存在端點、外角色 identity、錯誤世界 pursuitContext、過期節點／上層版本與未展示來源。可同批先寫下層後寫新上層，驗證整份結果。parent.version 是當次端點的版本前提（同批新增為 0），提交後同步為端點保存版本。來源只承接當次可見 short／long／belief／relationship 的本人 id/version；可以空來源，不強迫捏造歷史。來源引用只提供身份，不授予正文知識。

本切片對有有效下層或活動關聯的 drop 明示拒絕，不自行取消進度；複雜退出由 #225 擴充。方向與任務尚不宣稱有完整滿足生命週期。dropped 節點暫占總節點額度；#227 必須完成已結束歸檔及完整維護旅程。

| 包絡 | 工程值與理由 |
| --- | --- |
| 每人總節點 | 12（包含各層與最小 ended 身份），維持原平面總數，不每層領新額度 |
| 邊／深度 | 最終共用預留 16／4；第一切片每節點一父，未擴充前超出明拒 |
| 全節點 JSON | 12 KiB UTF-8，追求納入現有 88 KiB 記憶輸入包絡，不靜默截斷節點；完整輸入預留及四角色壓力量測由 #227 完成 |
| 每次追求更新 | 4 項／4 KiB，與原心理更新合計仍為 4 項／8 KiB，包含方法評估 |
| 文字 | id 64，content／scope 200，context／satisfaction／reason 160 字；字數不是能同時填滿的 byte 額度 |
| 每節點來源 | 4 個可見版本引用，與新想法的空來源分開 |
| 觀察者痕跡 | 最多 24 筆／16 KiB，最舊釋放並保存 dropped count；有效追求不隨痕跡淘汰 |

這些值由工程依原 12 意圖、4 項／8 KiB 心理更新及 88 KiB 輸入定稿，非新增使用者產品額度。全圖與上限壓力的整合量測由 #227 補齊，不提高 output tokens、呼叫數、期限或預算上限。

導入只走既有明示 reset API。舊世界 GET 可讀，不自動填造追求；advance 在付費前回 409/worldResetRequired，包含規則模式以免舊世界被不同語義推進。reset 建立新追求結構及獨立 context，用量與玩家限制沿原政策保存。沒有執行任何使用者世界重置。新版寫入後不能用舊 binary 推進；回退須保持新欄位與可理解版本的讀取／執行器，不能以丟欄位降級。

驗證沿世界 API、真實活動／感知、SQLite、下一次真正 request/messages 及既有 UI。結果見 [#221 驗證](../verification/layered-pursuits-221.md)。付費模型派送為零，#220／#229 的真實行為仍未驗收。
