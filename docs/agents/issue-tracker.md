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

## 驗收條件用 Gherkin

建立或補寫 issue（bug、工作票、規格的子票）時，盡量附上 Gherkin 格式的驗收條件，放在 `## 驗收條件` 標題下的 ```` ```gherkin ```` 區塊。`to-spec`、`to-tickets` 產出的票也適用；技能原文要求的其他欄位照舊保留。

- 關鍵字用英文（`Feature`、`Scenario`、`Scenario Outline`、`Given`、`When`、`Then`、`And`、`Examples`），敘述用繁體中文與 `GLOSSARY.md` 的正式用語。
- 每個 `Scenario` 寫一個從外部看得到的行為：畫面顯示、API 回應、保存後重讀的結果。不寫實作步驟、函式名或資料表欄位。
- 修 bug 的票至少有一個重現原問題的情境，以及一個確認既有合法行為沒被改壞的情境。
- 門檻數字（秒數、次數、成功率）要有來源；是暫定值就在區塊外註明是誰提的、還沒確認。

**預期行為還沒決定時，不要自己編 AC。** 需要先釐清設計才寫得出來的部分（例如該接受還是拒絕、算不算刻意的設計），在 issue 裡列成 `## 待釐清`，寫清楚卡在哪個決定，等 grilling 或使用者確認後再補 Gherkin。只有部分行為已確定時，確定的寫成 Gherkin，其餘留在待釐清。

有待釐清段落的 issue 貼上 `needs-grill` 標籤。釐清完、補上 Gherkin 後移除標籤；`needs-grill` 與 `ready-for-agent` 不同時存在。

純紀錄、Idea、Backlog 盤點這類沒有可驗收行為的 issue 不需要 Gherkin。

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Wayfinding operations

僅在使用 wayfinder 工作流程時套用：

- Map：標記 `wayfinder:map` 的單一 issue，記錄 Notes、Decisions-so-far、Fog。
- Child：用 GitHub sub-issue 連結到 map；無法使用時，在子項開頭寫 `Part of #<map>`，並在 map 建立任務清單。類型標籤為 `wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling` 或 `wayfinder:task`。
- Blocking：優先使用原生 issue dependencies，API 使用 issue 的資料庫 id；無法使用時，在子項開頭寫 `Blocked by: #<編號>`。所有阻擋項關閉才可開始。
- Frontier：依 map 順序選第一個尚未關閉、沒有未完成阻擋項、且無受指派者的子項。開始前指派給執行者。
- Resolve：留言結果並關閉子項，在 map 的 Decisions-so-far 補上結論與連結。
