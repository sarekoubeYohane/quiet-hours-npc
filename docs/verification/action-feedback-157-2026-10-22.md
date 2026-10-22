# #157 可知行動結果承接：本地驗證

基準：main `1878ff3`。規格：[Issue #157](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/157)。所有案例都是人工世界／模型替身，不使用或公布私人 transcript，不是歷史模型輸出的重播，也不宣稱反事實裁定有效。

## 修改與資訊邊界

- 一般裁定、日常重用、當前活動的階段完成／中斷沿既有 `record`、短期經歷與真正 NPC input 管線，保存原提案、對象、世界時間及續做活動的起始時間。初始核准、階段已執行、當前嘗試結束與舊物件狀態分開。
- 僅重述既有 `knownWorldObjects` 投影內的持有／指定物件；舊 `work → tea` 也可承接其已知器具。最多 4 件、物件語境最多 1024 UTF-8 bytes，原提案摘錄最多 240 字元；完整生成回饋超出 4096 bytes 時明示省略，而非截斷既有記憶；仍受短期記憶原有 4096 bytes／筆、80 筆／64 KiB 與總量上限保護。不是新知識儲存，也不由世界全真值產生新觀察。
- `blockedReason` 即使來自日常程式也只作觀察者診斷，因其可能依私有庫存與名單生成；只有明示程式時間檢查的 `knownBlockedReason` 可直送。其餘受阻回饋說明未執行／沒有新增成果，另列既有狀態，不將狀態推定為拒絕原因。
- 具體破損器具的已知語境保留。舊測試把 `knownTo` 直接等同餘量／使用權知識的期待改為保持未知；權威執行檢查、修復／補充後恢復與無付費重裁仍保留回歸。
- 內部五段結果不再寫入角色 activity／短期文字；觀察者仍可透過原 resolution／實錄查閱。隱藏 state 效果值不從結果摘要旁路曝光；已有主觀內容不被暗中糾正。
- 本人完整提案與語境透過原 `actorExperience` 交給本人；旁人取得原公開步驟摘要，避免看見別人的私有提案／意圖。
- 無 migration、付費回饋／反思呼叫、規則匹配改寫或意圖處理變更。沒有回讀私有實錄，也不補造舊世界歷史。

## 先失敗再通過

預先議定 seam：世界 API → 真實活動與 SQLite JSON 保存／重新載入 → 下一次共用模型派送的實際 request/messages。外部模型只在 fetch 系統邊界替換，測試命令載入 no-network guard；未預期的真實連線會失敗。

第一個 tracer：`known tea denial survives SQLite reload into the next actual NPC request with its action, object and time`。

- Before：失敗 `persisted action feedback must reach actual messages`，原 activity 泛化文字沒有帶關聯的短期行動回饋。
- After：同一測試通過，保存／重載後的實際 messages 含 `cup-a`、原泡茶提案、時間、沒有新增成果及既有 `contents: tea`；世界沒有複製器具。

第二個 tracer：跨回合 partial → complete fixture 起初失敗（真正 request 中找不到 partial 的行動回饋）；接通階段後通過，未到期成果不提前，既有主觀文字與實際分支級別分離。

## 本地覆蓋矩陣

| 情境 | 主要證據 |
| --- | --- |
| 既有茶、拒絕泡茶、SQLite 重載後下一次 messages | 帶對象／提案／時點的短期回饋，既有茶不算新成功 |
| 指定餐點已消耗，有／無自己的可靠觀察 | 有來源才保留 Cass 食用的原 observation；模型 explanation 不建立新經歷 |
| 初始核准、部分階段、到期完成 | 正常活動時序；一個活動只呼叫一次決策／裁定，下一次 messages 可區分 partial、complete |
| 隱藏庫存、私有名單、隱藏 state、未核實理由成對對照 | 相同角色已知資訊下，回饋／可見物件／供應投影相同，無私有差異 |
| 免費日常重用與已知損壞器具 | 零裁定，保存與下一次 request 保留破損語境；私有庫存／許可差異不變成原因 |
| 保存前故障、CAS 衝突、同 operation 重送 | 沒有半提交回饋；重送不增加派送、物件或經歷 |
| 舊世界缺少短期資料／已忘記回饋 | 不從已存在的私有實錄重建；讀取／下一次決策保持可用 |
| 新有來源線索與舊受阻紀錄並存 | 新訊息正常出現在下一次 request，沒有永久封鎖重試 |
| 主觀以為成功，實際 accepted 隱藏效果不同 | 隱藏後果已提交，但不透露 key/value/reason 或全知糾正原 observation |
| 同場旁人 | 另一 NPC 的實際 request 不含本人私有原提案與行動回饋語境 |
| 等待、休息、詢問、拒絕、換方法 | 正常決策原樣承接，保留模型自己選擇的意圖 |
| 81 筆後續經歷的容量淘汰 | 有界短期回饋自然淘汰，不從實錄復活 |

命令：

```sh
node --import ./tooling/verification/no-network.mjs tests/run-activities.mjs tests/action-feedback-api.test.cjs
pnpm test
pnpm typecheck
pnpm lint
```

新增的 13 個 API 測試涵蓋上述情境與多位元組容量邊界。最終整合版本（含 review 修正）重新執行 `pnpm test`：**613/613 通過**（571 項活動／API、32 項登入、10 項 Workers／migration），零失敗、零跳過。`pnpm typecheck` 通過；完整 `pnpm lint` 為零錯誤、4 個既有 warning（未修改的 components 中 img／effect dependency）。`git diff --check` 通過。既有效果、消耗身份、許可、失敗回復、用量與重送測試仍為本票回歸的一部分。

## Standards

兩軸 code review 的 Standards 審查與修正後複查均無需處理的規範違反或實質異味。

## Spec

Spec 審查發現 1 項已保存活動到期回饋的相容性問題，已以 RED→GREEN 修正，詳見下方補測；複查無未解決項目。沒有把固定回覆測試結果當作真實模型行為改善證據。

## 尚未驗證

本地替身只證明資訊管線、提交責任與可知邊界，不能證明真實模型理解回饋或停止重複提案；沒有呼叫付費模型、修改玩家世界、合併或部署。purpose 精確措辭匹配、#75 完整認知接線、#158 微調資料選留、#91／#92／#153 原正式站追溯驗收與 #85／#104／#106 各自缺口保留，不因本票自動關閉。

## Code review 補測：末階段早於活動時段結束

Spec review 發現：已保存計畫的最後效果可能早於 `until` 執行；到期時沒有新階段，舊流程只清除 plan，留下「尚未完成」的 activity／短期回饋。新增 API fixture 在 SQLite 保存舊計畫，分別覆蓋開放式時段、有 `mixed` selectedResult 及無新時間語意的 legacy 計畫；先執行末階段，再到期、重送及重新決策，檢查真正 request/messages。

此 fixture 明示是人工舊已保存計畫；目前 route 不接受新建 open-ended 物件提案，仍維持該既有界線，沒有為測試放寬路由。

- Before：到期後 plan 已消失，但 activity 仍是「cup-a：contents=water；這個階段已執行，活動尚未完成。」。
- After：即使本次沒有新階段，也沿原短期經歷保存時段到期／嘗試結束；不重複效果、增加物件 revision 或重送派送。開放式時段不被寫成外部目標已完成，selectedResult 不透露五段級別。下一次真正 NPC messages 可取得終結回饋與原活動起始時間。

本次 review 修正相關四檔 API 回歸 **42/42 通過**，包含新增 13 個行動回饋測試；typecheck 與本次改動檔 ESLint 通過。
