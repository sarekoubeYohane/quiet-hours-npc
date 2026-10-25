# #168 完整回合有界時間：本地驗證（2026-10-25）

承接主規格 [#166](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/166)、唯一工作票 [#168](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/168)及 [PR #167](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/167)。程式基準為 main `4c54b156fa2e247aac1ec9b039d8d2e94a1138ed`。#167 未合併，因此本分支攜入其文件與合成診斷資產；沒有將文件 PR 合併當作前置。

## RED → GREEN

依使用者指定的世界 POST → transport 替身 → 真實解析／序列化與測試 SQLite → 原 ID GET／POST，不呼叫付費模型或正式世界。

原始 RED 命令：

```bash
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" DEADLINE_EXPECT_COMPLETE=1 \
  node tests/run-activities.mjs --test-name-pattern=cumulative-body \
  docs/verification/assets/round-deadline-2026-10-25/repro.cjs
```

修正前失敗為 `502 !== 200`：四角色第八次派送於98秒開始，signal僅剩12秒；HTTP200 headers可得，body未完成，110秒整輪回復。已知280 tokens、1次未知、8次派送；同ID不新增派送。依賴尚未安裝時的 `typescript` 缺失沒有被計為本案RED。

修正後相同完成案例在虛擬112秒提交、HTTP200、8次派送。新的政策與完整成本算式見[工程契約](../design/round-time-budget.md)：400秒工作、30秒收尾、430秒固定租約、445秒前端；單次完整聊天25秒、完整回想10秒，有限完成包絡至少涵蓋現有四角色。原診斷 harness 的六項歷史對照保留當時預期，不能把其餘「應失敗」斷言當作新版驗收。

## 回歸與審查

原版 operations、conflict、decision-trace-faults 三組52項基準先通過，避免把既有保護當作本輪新增能力。

新增永久API／SQLite完成案例的實測（虛擬時間）：

| 案例 | 提交耗時 | 聊天／回想 | trace寫入 |
| --- | ---: | --- | ---: |
| 8×14秒 | 112秒 | 8聊天 | 51 |
| 8×12秒＋每次trace0.4秒 | 113.2秒 | 8聊天 | 51 |
| 合法回想完整鏈＋每次trace0.4秒 | 293.2秒 | 12聊天＋4embedding＋4search；各服務2秒 | 75 |

每案從原ID讀回durable世界、回饋與意圖，核對turn／minute、用量只計一次，再同ID重送比對status／body與零新增派送。正常denied候選仍是成功回合中的角色回饋。

獨立code-review依技能分成Standards與Spec兩軸，固定基準main `4c54b15`，首個整合checkpoint `244ae7d`。Standards發現一項截止契約問題與一項usage解析重複的維護性判斷；Spec發現兩項P1，已交同一實作者修正並加入永久回歸：

- 受理前讀取延遲200秒後啟動完整鏈，HTTP445秒先回uncertain，內層原本仍可能第12次派送並提交。必須將response截止傳遞到工作及CAS，並在付費前檢查受理餘量。
- 有效body已知30／10 tokens，但trace保存延遲500秒時，收尾截止先於paidAfter快照，durable用量錯為0。必須在可停止的收尾等待前凍結付費差額，保持只補存一次。

以上是review時的實際RED，不是理論風險；整合checkpoint `609e350` 已承接兩項P1及重複解析修正，另加入下列永久回歸：

| 驗收 | 可觀察結果 |
| --- | --- |
| 12×22.9秒聊天、4次9秒回想、0.4秒trace、58秒外層guard | 虛擬394秒完整提交，75次trace寫入，未超過25／10／400秒包絡 |
| 外層guard延遲401秒 | 400秒停止、零模型派送；晚到guard不恢復執行 |
| 4角色候選順序 | 後一角色實際NPC輸入承接前一候選工具變化，最後revision5一次保存 |
| 500秒不可取消trace保存 | 已知30／10 tokens只保存一次、無新派送與候選恢復 |
| 過慢受理 | 超過15秒在付費前停止；無延後租約造成的HTTP後執行 |
| request斷線／回想服務逾時 | 停止後無續答，完整故事回復；原ID仍精確重放 |
| 舊120秒pending | 按原存絕對期限變成pending／uncertain，沒有套430秒延長 |

複查另取得第三個實際RED：prepared保存把時鐘推進26秒，但abort timer callback尚未執行時，原先仍HTTP200／2次fetch，應為零。新增絕對期限同步檢查，包含await入口／返回、實際fetch及body／用量分類；逾時body僅保留lateUsage證據，原定案未知用量不被改寫。原兩項P1已由Spec審查者獨立重跑原repro，2／2轉綠。

最後整體回歸另取得費用競爭RED：另一分頁先把過期pending定為uncertain後，原worker曾漏補其已發生的付費帳，實際totalCalls=0、應為1。新永久案例要求原worker只補一次已知／未知帳，保留原uncertain的HTTP status／body逐項相同，不重套世界效果；此案例已RED→GREEN。

同步活動／效果的最後D20邊界亦經RED→GREEN：活動將時鐘推到401秒時，原先HTTP200，修正後HTTP502、整輪回復，兩次已知呼叫與60 input tokens保留，骰子只執行一次，同ID精確重放。工作→收尾入口明確檢查絕對工作截止，不能借用30秒提交餘量執行候選。

## 最終交付檢查

最終產品提交 `2293286`，整合於 `5efa09c`；後續只有文件／整合歷史整理，不變更已測產品。以下命令從repo根目錄執行：

| 檢查 | 結果 |
| --- | --- |
| `pnpm test`（runner自動preload no-network） | **648／648通過**：世界／活動606、登入32、實際workerd／migration10；零失敗／跳過 |
| 原始單項RED命令（上節） | 最終1／1 GREEN，8×14秒完整提交 |
| `pnpm typecheck` | 通過，無型別錯誤 |
| 對全部變更TS／TSX／CJS／MJS執行ESLint | 零錯誤；world-app既有useEffect缺少act依賴warning 1項 |
| `pnpm build:production` | 通過；另斷言產物Wrangler name為quiet-hours-npc、APP_ENV為production |
| Markdown本地連結、`git diff --check` | 通過 |

新增永久測試 `tests/round-deadline-api.test.cjs` 納入預設runner，涵蓋完成包絡、直接await／不可取消尾端、總／單次截止、斷線、舊client、原絕對pending、同步效果與費用競爭。`tests/recovery-ui.test.cjs` 以真實React／DOM驗證新POST等待445秒、政策header、斷線與原ID恢復，不靠原始碼字串檢查。逐slot驗收讀取後一NPC真正的input.objects，狀態依序為sound／broken／sound／broken，最終工具revision5一次保存。

既有 `operations`／`conflict`／`decision-trace-faults`／`recall` 等回歸涵蓋兩分頁、不同ID、租約失效、晚到body／usage、archive有而journal缺失、CAS前失敗／後遺失回覆、trace失敗、淘汰／reset晚到UPDATE及預算。舊測試僅將正常新client請求加政策header、現行租約故障值更新到新窗口；明示舊120秒pending與舊125秒client另保留專項，沒有套新常數改寫舊期限。

code-review兩軸均完成最終複核，**無剩餘實質發現**。Standards獨立重跑絕對截止、實際slot順序、uncertain用量及同步效果；Spec獨立重跑兩項原P1、絕對截止、uncertain已知／未知用量兩案及同步效果，全部通過。所有發現均由同一實作者修正，再回到原API／SQLite seam驗證；沒有以縮小規格或正式模型試跑替代。

## 範圍與限制

所有模型回覆與世界均為合成資料，外網由 no-network preload 阻擋；SQLite adapter執行真實JSON、schema、migration、journal與CAS，但不是遠端D1。受控時鐘只證明截止邏輯與有限延遲包絡，不量測Cloudflare CPU、網路、序列化效能或正式provider。必要checkpoint仍在原queue等待保存，底層不能取消時不宣稱已取消；Worker終止或D1持續不可用仍可能失去未持久化證據，結果必須保持unknown／uncertain。

沒有真實付費呼叫、正式世界推進／重置、合併或部署。#85／#106不因本地替身成功而結案。

## 部署後有限重驗：另行取得授權

1. 核對正式部署包含本修正，保存目前隔離世界與原operationId；維持NPC／裁定模型、歷史、預算，暫停自動運行，不重置世界。
2. 先只一個新advance，原隔離場景最多8次派送；真正提交後才觀察店主後續最多三次正常決策。
3. 若沿主規格額度，總計至多4 advance／32派送／已知500,000 tokens／30分鐘，任一先到即停；token為事後已知用量，不能當作精確預約，額度不足不開下一輪。
4. 任一技術故障、pending或uncertain立即停，只查原ID並保存證據，不重抽、不補提醒、不灌回候選杯茶。
5. 技術提交、杯與獨立茶飲成果、完成回饋及本人後續反應各自判定；樣本不足仍是證據不足，不自動關閉泡茶loop票。
