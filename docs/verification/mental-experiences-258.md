# #258 新經歷的主觀補耗電與自然情緒

範圍：[工作票 #258](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/258)，承接 #257。數值與骰法 #256 仍暫緩；沒有正式政策與預設點數。本票不關閉 #255，也不宣稱完成 #263 或真實模型心理語義驗收。

## 契約與邊界

僅明示 local/test 的 `MENTAL_ENERGY_TEST_POLICY` 可啟用；保存後以角色政策為準。本票另需 `experience: { levels: [0, 2, 5] }` 這類明示測試點數映射。測試的 5/10 初始值、0/2/5 點數、固定調節費 4 都只在合成 fixture，不是產品建議或預設。沒有 experience 映射便不開放自然感受結算。既有無政策世界仍沿原契約；#257 新增的精神電量 playbook 句改為僅 active 角色送出，原始歷史 provider transcript 壓縮檔沒有改寫。

模型只回傳 `feelingUpdates` 中的來源 handle、positive/negative/neutral、0/1/2 等級、理由和自然 mood（null 表示不改變）。後端按明示映射計算，截斷到合法餘額，未用溢出不保留。neutral/0 可只有自然情緒變化；零電量仍可好轉。頂層舊 mood 不再具有 active 精神契約的寫入權，正常選擇、規則試玩、continue、journey 及 direct API 都不能靠此欄位免費覆寫。沒有新增語義裁判模型。

`FeelingOrigin = { actorId, id, version: 1, at, kind }` 為 server-managed immutable producer identity；版本表示該份心理效果，不是可改寫的 memory version。事件 actor experience 和各感官 observation 共用 event id，角色身份各自隔離。短期選留、長期 rewrite/merge/forget-source 保留原根，forget 不清除已結算收據。合併最多 8 個根，超過則整輪失敗，不用新摘要 id 洗新效果。result 種類留給 #259 的真實成果 producer；一般 work、proposal accepted 或追求變成 satisfied 均不自行發源。

只有 active 角色收到真正新介入、他人言語、可感外在變化、裝置線索或已發生睡眠才可建立相應來源。reflect、自述安排、單純醒來、清醒休息及自己說過的話不發新根。睡眠以 applyBodyActivity 返回 actual > 0 才發已發生睡眠來源。外在 body/environment 一批後果的 touch/sight 共用一個根，沒有按感官重發。

手機實際 read 時，對可讀外部作者的正文保存首次可知根；列表不等於閱讀。reader 的根跨同正文重讀保留，`feelingContentVersion` 將 metadata share/reminder 版本和正文更新分開；正文真正更新才可換根。作者自己 create/update 的備忘錄、行事曆不因重讀變成新的自然滿足來源，以免自我安撫轉成免費調節；舊資料作者不明保留來源缺口，不猜補歷史。已讀正文的一般閱讀經歷與 presentation alias 共用同一根。測試外部 memo 為明示初始 fixture，實際 list/read、reader 保存與 SQLite 重讀皆走應用。

來源有效期為固定 **7 個世界日工程窗口**；最多 **256 個有效收據**。這是有限 provenance 與容量契約，不是情緒平衡數值。只移除過期收據；滿額不淘汰仍有效收據，新增結算 fail closed 並回復整輪。原根的 at 不因重讀、記憶改寫或 alias 改變；即使過期收據移除，舊根仍不能重新領取。另一次真新經歷保有新根。沒有以最大處理序號略過亂序未評價來源。啟用前未知文字不回填，at 早於 activatedAt 的既有根也不補發。

投影保留記憶正文，但 `feelingSources` 只列本人啟用後、有效且未結算的根。來源投影和後端驗證共用 eligibility predicate。wire schema 與 parse context 都由最後實際送出的 bounded request 建立；外層 escaping 容量刪掉的來源不能從保存資料或舊回想 transcript 取回使用。精確電量、點數映射、內部政策與他人隱藏資訊不送入本人模型。

## 收支順序與後續接點

1. 正常 preparation/parse 僅驗證 final visible source，攜帶 server `originAt` 候選，不先寫心理狀態。
2. 在共同世界時間推進自然扣費，實際 start/continue/拒絕及 first-interval sleep 確認依既有流程執行。首段睡眠從原區段基準重算自然扣費，不採事後退款。
3. actor 的共同 finally 於實際自然時間確定後 applyFeelingUpdates，故同輪新增收入不被睡眠重算覆蓋，也不因 pause/resume/continue/提案未開始而遺失對先前合法經歷的感受。心理候選保留其已驗證 originAt，容許同輪記憶改寫或明示遺忘來源。
4. 感受、餘額、mood 前後文字、收據沿世界同一 CAS/save/journal 邊界提交；後續角色、保存前錯誤或 CAS 衝突回復心理狀態，已知 provider usage 依原政策保存。已提交或已記錄失敗的原 operationId 回放不再呼叫模型。

#259 可使用 record 最後的 feelingKind='result' 在真正成果 producer 標根，沿同一 one-shot ledger 防重；不能為同一根另取成果費。#260 的實際過程 segment/slot 應保持不同事實來源，再接共同收支點。#261 可在同一 actor finally 的合法收入後檢查足額與明示付款，使用共同 mood writer。#262 需把受控感受評估候選接到相同 apply 路徑，但不可代替玩家行動或自行付費。

## 驗證證據

新 API 測試 `tests/mental-experiences-api.test.cjs`：15/15。使用真實世界 GET/POST、實際 SQLite serialization/reload、外部 provider 邊界受控回覆；捕捉實際 request body、calls、tokens。涵蓋正負/零、零電自然好轉、滿電截斷、非法任意點數/未知/已結算/啟用前/過期來源、外層 request trimming、256 收據滿額、過期清除後的新來源、亂序來源、short→long→rewrite→merge、phone 同版本重讀、self-memo 不洗源、真實睡眠、body/environment 多感官 alias、後續角色失敗、save/CAS/uncertain commit 及原 ID 回放。

TDD 記錄（暫存於 `/tmp/quiet-hours-255-context`）：

- `258-red-1.log` → `258-green-1.log`：新政策/來源契約尚未支援到首條 API 真流程成功。
- `258-red-sleep.log` → `258-green-sleep.log`：首段睡眠原本把同輪收入覆成 2，預期 4；調整共同順序後通過。
- `258-red-phone.log` → `258-green-phone.log`：實際 read 原本沒有 canonical aliases，新增首次 reader 根後通過。
- `258-red-self-memo.log` → `258-green-source-offers.log`：自己重讀安撫備忘錄原本發 2 個 aliases，修正後沒有可結算新根。
- `258-final-offers.log`、`258-external-consequences.log`：settled 源仍保留正文但不再出現在實際下一個 body/schema，以及真實外在後果兩感官同根。

相關回歸先跑 38/38（mental-energy、npc-input-equivalence、phone-memos/inbox、activity-time）；後續 source 修正重跑同組合 **47/47 通過**，記錄為 `258-regression-final.log`。`pnpm typecheck` 通過；`pnpm lint` 為 0 errors、4 個既有 warnings，`git diff --check` 通過。沒有在本票重跑整份 pnpm test，由 integration 最末統一執行。

Chromium 已由 root 執行並目視 [角色面板](assets/mental-experiences-258/energy-panel.png)：既有 WorldApp 中加入介入、下一回合 5→7/10、心情平靜→安心、實際原因與來源；SQLite 重讀與原 ID 回放維持結果。實際 2 個受控 NPC calls、input/output 60/20 tokens、0 次付費模型。[原始證據](assets/mental-experiences-258/evidence.json) 保存實際輸入及檢查值；runner 為 `tooling/verification/browser-mental-experiences.mjs`。

這些受控回覆證明來源、契約、保存與記帳承接；不能證明真實模型對陪伴、難受或舒服的心理判斷正確，也不保證一般自由文字語義的重述去重。後端保證有保存 provenance 的 alias 不重領，不宣稱辨識所有自然語言等義事件。
