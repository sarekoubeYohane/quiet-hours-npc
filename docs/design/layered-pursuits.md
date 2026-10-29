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

## #223 共享圖、局部順序與跨分支

本切片已把單父限制擴充為多根、不同深淺及共享下層的 DAG；每人仍總共 12 節點、16 邊、最深 4 層，所有層級共用原額度。單節點至多 11 個不同上層，仍受總邊數限制。新增下層可直接連到本批新增上層，以整份候選的有效端點、原版本及拓撲檢查，不以更新陣列排列判定合法。重複邊、自環、循環、跨人／世界、缺失／過期端點及超界仍整輪拒絕。

`parents` 的輸出 wire 仍只包含 `{id,version}`。保存及實際輸入的支援邊增加 `order`，是這個上層下的局部位置，並非重要性分數或方法前提；相同下層在另一上層可以有不同位置。根順序沿同一 `intents` 陣列的根項位置，沒有第二個追求佇列。早期 v3 切片缺邊位置時，沿原保存陣列位置解讀，不補造角色的新排序選擇；舊平面世界仍走原先付費前停止政策。

局部重排使用同一 `pursuitUpdates`，一個 `reorder` 算原共同心理工作量中的一項：

```json
{"operation":"reorder","id":"vera:roots","version":0,"node":{"scope":"roots","members":[{"id":"vera:gift","version":1},{"id":"vera:direction","version":1}]},"references":[],"reason":"現在較在意送禮，但仍可先做其他分支"}
```

同一上層下改用 `id=上層 id`、`version=本次上層版本`、`scope=children`。`members` 只列需互換順序的節點及本次版本，保留這些節點原本佔用的位置，由列出順序替換；未列者不移出、不結束、不被挪成新工作。根作用範圍的保留 id 為 `本人:roots`，不能當實際追求身份。參與重排且位置改變的節點遞增版本；端點版本隨合法提交同步。作用範圍、成員、重複或過期引用有錯時拒絕，不靜默修復。

共享任務只連結一份活動 `pursuitIds` 與既有進度，局部重排不另啟動／取消活動。當次仍只選一個焦點，角色可在較高優先根等待時選另一分支，或繼續手上活動。替代方法不是新增必做節點，圖／優先不繞過世界前提。多層滿足、範圍改寫與上層退出的完整處置仍分別由 #224／#225 接續；目前有下層／活動關聯的複雜退出保持明示拒絕。

13 個新增 API 旅程與 24 個 T1 回歸通過；真 UI／SQLite 三輪重載、實際下一請求和手機寬度核對見 [#223 驗證](../verification/layered-pursuits-223.md)。最大共享圖代表例證明 12 節點／16 邊／4 層可在原包絡維護，超節點、超邊及第 5 層反例被拒絕；完整最大文字／來源／候選與四角色情境仍由 #227 統一驗證，不能以此代表整體滿載工作已完成。

## #224 主觀滿足與跨行動承接

新增 `assess`，沿既有六欄更新 `{operation,id,version,node,references,reason}`。node 為 `{status,progress,basis:{kind,text}}`：status 是 active／satisfied；progress 是 ready／waiting／deferred／blocked／enough。satisfied 只能配 ready；enough 只供仍 active 的持續 direction。省略的舊 progress 保持可讀、代表尚無明示推進評估，沒有自動新增歷史。upsert.node 原形保持，不從行動或世界結果推導滿足。

basis.kind=known-result 時必須至少一個當次有效可見 short／long／belief／relationship 來源；subjective 可依本人感受或理解，用空來源合法。短依據 text 上限160字，仍計入原4KiB追求更新、共同四項／8KiB、12KiB狀態及有界痕跡，不增加模型 slot、輸出 tokens 或時限。保存 assessment 的類型、短評、來源身份與世界時間，與形成來源 references 分開；不是來源正文備份或外在真相。可見誤解仍可支持角色判斷，尚未執行 action 的假來源不能通過引用檢查。

評估滿足只改主觀節點，不造物、不攝取、不恢復需求、不代其他上層完成，也不複製活動進度。仍有實際關聯活動時，最小切片拒絕直接 satisfied，待 #225 明示處置；同批多層可在當次已有依據且圖一致時各自評估。已 satisfied 身份不能 upsert 復活。持續方向 active＋enough 仍可日後明示 ready，但不會由引擎反覆生成同類任務。

角色／分析沿同一追求面板呈現推進情況、滿足與短評來源缺口；短評與既有活動、物件成果並列理解。源遺忘／未展示下的完整投影維護由 #227 加入整合，不以觀察者 trace 復活記憶。受控旅程及真實行為界線見 [#224 驗證](../verification/pursuit-lifecycle-224.md)。
