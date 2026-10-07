# Issue tracker: GitHub

工作事項與規格存於 `sarekoubeYohane/quiet-hours-npc` 的 GitHub Issues。

## 操作規則

優先使用 GitHub 連接器；在已安裝並登入 gh 的環境可使用 CLI。
明確指定本 repo，避免誤用 Sites 的來源儲存庫或其他專案。
CLI 操作加上 `-R sarekoubeYohane/quiet-hours-npc`。

- 建立：`gh issue create --title "..." --body-file <檔案>`。
- 讀取：`gh issue view <編號> --json number,title,body,labels,comments`。
- 列出：`gh issue list --state open --json number,title,body,labels,assignees`，依需要篩選。
- 留言：`gh issue comment <編號> --body-file <檔案>`。
- 標籤：`gh issue edit <編號> --add-label "..."` 或 `--remove-label "..."`。
- 關閉：`gh issue close <編號>`，附上結果或相關提交。

多行內容使用結構化工具參數或 UTF-8 body 檔案，保留換行。
技能要求「publish to the issue tracker」時建立 GitHub issue；要求「fetch the relevant ticket」時讀取對應 issue。
Issue 與 PR 共用編號，先確認類型。

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Wayfinding operations

僅在使用 wayfinder 工作流程時套用：

- Map：標記 `wayfinder:map` 的單一 issue，記錄 Notes、Decisions-so-far、Fog。
- Child：用 GitHub sub-issue 連結到 map；無法使用時，在子項開頭寫 `Part of #<map>`，並在 map 建立任務清單。類型標籤為 `wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling` 或 `wayfinder:task`。
- Blocking：優先使用原生 issue dependencies，API 使用 issue 的資料庫 id；無法使用時，在子項開頭寫 `Blocked by: #<編號>`。所有阻擋項關閉才可開始。
- Frontier：依 map 順序選第一個尚未關閉、沒有未完成阻擋項、且無受指派者的子項。開始前指派給執行者。
- Resolve：留言結果並關閉子項，在 map 的 Decisions-so-far 補上結論與連結。
