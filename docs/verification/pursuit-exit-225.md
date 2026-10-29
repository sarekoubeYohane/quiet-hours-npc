# #225 範圍改變、退出與活動一致性驗證

本票使用受控 provider transport，真世界 API、活動／感知／效果、SQLite 保存重讀及下一次真正派送 messages 均沿產品程式。**真實付費模型派送 0**，未推進或重置使用者世界，未合併 main／部署。範圍、理由與滿足是 fixture 角色自述，不能宣稱真實 NPC 行為改善。

基準為已整合 #224 的 `ded9443`，實作中同步 #226 及既有測試 builder 支援。主 tracer 在原產品 red：同 id scope upsert＋assess 因重複身份被拒；加入同原版、先 scope 後 assess 的增量後，兩種 wire 排列都 green，保留兩段 before／after，原「準備餐點」不被改寫成原本僅願回答。下層退出的八種處置／排序、活動原始動機與實際進度亦各保留 red→green 證據於 ignored outputs。

| 驗收 | 實際測試／結果 |
| --- | --- |
| C9 範圍與判斷 | 縮小後 satisfied 同批兩排列，原版 v1→範圍 v2→滿足 v3；trace 分兩段，無餐點造物；重複 upsert／assess、中間版誤作原版、當次新建立即滿足皆拒絕 |
| C13 上層與下層 | drop／獨立／轉接／共享保留各兩排列；一項工作同一 id／scope、不增節點；改小上層也可同批明示原工作仍支援新版。漏處置、過期下層或仍指向已退出上層整輪拒絕 |
| C14 單一活動 | 真兩階段物件工作，15 分鐘提交 partial/revision2；原追求放下後，新動機 continue 保留 startedAt／until／origin，只完成後段一次；pause 後可 resume 或 abandon，原成果不抹去、不重裁定／重播階段 |
| C14 生命週期反例 | 暫停目的放下卻沒有 resume／abandon 的處置，候選整輪拒絕；current 方法／焦點引用 ended 節點皆拒絕。退出程式關聯和當前 active purpose 分開 |
| C18、C19 故障／重送 | 保存衝突、提交前失敗、SQL 執行時租約失效、後角色非法均回復本輪退出／活動，保留先前 partial/revision2 與已知用量；原 ID 重送零新增派送 |
| C17 合法維護 | 12 節點滿圖，父下 11 個工作；直接漏處置退出拒絕。三個正常決策逐批明示獨立，再退出父，11 項工作 id／scope 保留；總 9 次 fixture NPC 派送，在原每小時 12 次額度內，不靠提高四項更新上限或靜默刪除 |
| C15、C24 跨票承接 | #226 的 new upsert0＋assess waiting0＋linked arrangement 三項同決策，兩排列皆保存追求 v2／安排連結 v2；下一真正 input 仍 waiting，加入預設測試清單 |
| C22 觀察 | 既有分析／人物檔案重載讀出原範圍、兩段變更、drop／satisfied 差別、歷史活動動機與現在無焦點的暫停進度；program 的 pursuit-exit-links 與 model-self-report 分開 |

`tests/pursuit-exit-api.test.cjs` 新增 **31/31**，跨票 new-waiting **2/2**。連同 T1、T2、T3、T4、T6 七個原生 suites 合計 **131/131** 通過，0 失敗／取消／略過。`pnpm typecheck`、變更檔 ESLint 與 diffcheck 通過。這是原生追求整合回歸；完整 repository 適用測試、C1–C30 與兩軸 code review 仍由整合分支最後統一完成。

```sh
node --import ./tooling/verification/no-network.mjs tests/run-activities.mjs tests/pursuit-exit-api.test.cjs tests/pursuit-new-waiting-api.test.cjs
node --import ./tooling/verification/no-network.mjs tooling/verification/browser-pursuit-exit-225.mjs
```

第二項沿 [本機 browser 環境](../../tooling/verification/README.md) 使用 Playwright／本機 Chromium 相容瀏覽器；本次 Windows Edge 真 WorldApp → HTTP API → SQLite 四輪：4 次 NPC＋1 次裁定 fixture，0 次付費。開始時 origin 為 owner:work v1；轉接只改目前 pursuitIds，原方法及 origin 不變；縮小 replacement 範圍後滿足並明示 pause，最後保留同一 pausedActivity 的 phase cursor1、物件 partial/revision2，未完成全部工作。下一 actual input **10579 UTF-8 bytes**。1280px 分析／人物檔案重載與 390px 無水平溢出、0 pageerror。

- [退出、範圍與歷史動機面板](assets/pursuit-exit-225/exit-origin-panel.png)
- [手機分析](assets/pursuit-exit-225/mobile-analysis.png)
- [機械摘要](assets/pursuit-exit-225/summary.json)

上列公開合成場景面板已目視核對，完整私有本機執行輸出留在 ignored `outputs/pursuit-exit-225`。原始動機只保存身份／版本與原活動方法，有界 trace 消失後不能補造原範圍；缺少 origin 的舊活動亦不回填。#227 仍需完成歸檔、完整最大容量／來源遺忘／四角色壓力整合，#228 補真多輪 runner。#220、#229、#211 不因本票的受控結果關閉。
