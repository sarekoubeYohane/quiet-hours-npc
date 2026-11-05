# #259 成果的成就感與追求自主

範圍為 [工作票 #259](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/259)，承接 #258 的明示隔離測試政策與來源窗口。#256 正式數值與骰法仍暫緩；不關閉 #255，也不提前宣稱 #263 或真實心理語義驗收完成。

## 成果來源契約

真正執行的物件後果／活動階段回饋，以及既有已保存的新草圖結果，才由後端標記 `feelingKind=result`。尚未執行的提案、預告、裁定接受、只改追求為 satisfied 或單純安排未來自然變化，不產生結果來源。已投入時間但未取得外部成果的明示結果分支，在實際結束後仍有「這次嘗試已結束」的可知結果；其主觀收穫不依成功級別決定。技術時段到期本身不另外發放原成果。

`recordActionResult` 延用原可知行動回饋，將實際結果標記傳入 `record`，不新增心理模型鏈。物件 batch 同時造成 body/environment 感官觀察時，external event 與後續行動回饋使用同一 `feelingSourceId`。它是 server-managed canonical identity，與各條 eventId／Observation／ShortMemory id 分開；當前同一成果的多感官和回饋不會變成兩份可領效果。事件仍保留各自外在／主觀文字，不把世界完整理由透露給角色。

結果感受仍是 #258 的唯一 one-shot `feelingUpdates`：模型只能提供合法來源、方向、等級、理由及自然情緒，後端按已保存測試映射計算。沒有另設「成就點數」、模型 effectId 或免費的改名帳戶；外在成功可以主觀耗神，失敗也可以覺得有收穫。#260 的過程效果另以實際活動時間為事實來源，本票不依賴它，也不把同一結果換個名稱變成過程費。

選留、rewrite、merge、forget-source 與追求評估引用仍保留原 canonical root。記憶版本、改寫措辭或追求狀態不是新的結算身份。共同七世界日來源有效期及 256 個有效收據沿 #258；過期收據移除後原來源也已失效，不能重領。另一次真正開始並執行得到的新結果使用新的根，可再次按相同測試政策評估，不強制遞減。

prepared feeling candidate 額外攜帶後端查得的 `originKind`，receipt 保存其種類，既有精神電量分析面板能標示「實際成果來源」、實際前後電量、文字心情與理由。它不改 NPC 的精確數值隔離，也不接受模型任意輸入 originKind。

補電和追求更新共用原世界候選／CAS／operation journal。滿電不結束活動，也不滿足、刪除或復活追求。正常選擇仍可明示 continue、active+deferred 或 drop；不處置即保留原追求。

## 驗證

API 透過真實世界 GET/POST 與 SQLite 序列化重讀；只控制外部 provider 回覆及骰子，不模擬內部心理模組。所有點數為 `isolated-result-259` fixture（initial 5 或 10，maximum 10，awakePerHour 0，levels 0/2/5），不是正式產品預設。

TDD 記錄位於 `/tmp/quiet-hours-255-context`：

- `259-red-1.log` → `259-green-1.log`：真正延後成果完成前無 root，完成後可評估。
- `259-red-alias.log` → `259-green-alias.log`：外在感官與回饋原本生成兩根，現共用一份結果。
- `259-red-outcomes.log` → `259-green-outcomes.log`：既有草圖成敗與明示空結果分支，均在實際執行後可評估。
- `259-final-targeted.log`：本票 **9/9** 通過，涵蓋外在成功／主觀負向、失敗／主觀正向、零自動獎勵、預告／追求狀態不能發源、跨事件／追求／記憶改寫去重、來源過期後不重領、真正新成果、滿電續做／延期／明示放下、已提交操作回放，以及後續角色失敗、保存前失敗、CAS 衝突、uncertain commit 的心理與追求共同回復／提交。真正送出的 provider JSON、calls、tokens 與未知用量都有檢查。

```sh
NODE_OPTIONS='--import=./tooling/verification/no-network.mjs' node tests/run-activities.mjs tests/mental-results-api.test.cjs tests/mental-experiences-api.test.cjs tests/activity-results-api.test.cjs tests/pursuits-api.test.cjs
pnpm typecheck
pnpm lint
git diff --check
```

首次相關回歸 **58/58** 通過（`259-regression.log`，當時本票 8 項）；補上延遲自然結果案例後本票 9/9 通過。typecheck 通過，lint 0 errors、4 個既有 warnings，diff check 通過。整份測試由 integration 最後統一執行。

## 既有畫面

```sh
PLAYWRIGHT_MODULE=/private/tmp/npc-regression-browser/node_modules/playwright CHROMIUM_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' BROWSER_ARTIFACT_DIR=/tmp/energy259-browser node tooling/verification/browser-mental-results.mjs
```

2026-11-05 root 已在 Chromium 執行成功並目視 [電量面板](assets/mental-results-259/energy-panel.png) 中文排版。既有 WorldApp 透過下一回合實際製作 raw→complete，完成後下一次正常選擇才評估成果；滿電 10→10 仍保存創作追求並明示延期，畫面同時顯示成果理由、來源與追求處置。[整頁畫面](assets/mental-results-259/result-pursuit-panel.png) 與 [實際輸入／用量／保存證據](assets/mental-results-259/evidence.json) 已保存。重載／SQLite 重讀及同 operationId 回放維持結果；2 個受控 NPC calls＋1 個受控裁定 call，90 input / 30 output tokens，0 次真實付費模型。

受控回覆只證明來源契約、提交一致性與用量記帳，不能證明真實模型如何理解成就、失落或主觀滿足。後端不宣稱能辨識所有自由文字語義的重述；保證的是已保存 provenance 的同源效果不會換紀錄重領。
