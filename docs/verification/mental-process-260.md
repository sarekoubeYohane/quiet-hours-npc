# #260 持續活動的逐段補耗電與感受修正

實作 [#260](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/260)，以 integration `48519fd`（#258）為起點。#256 的數值與骰法設計仍暫緩；本票沒有正式產品預設或真實模型語義驗收。

## 明示測試契約

只有 local/test 的明示精神電量政策包含 process 時開啟。例如 fixture：`process: { seed: 35, slotMinutes: 10, levels: [0, 6, 12], multipliers: [0.5, 1.5] }`。levels 是每小時點數，multipliers 是離散抽樣幅度；這些數字與範例種子僅為合成測試，不是產品推薦。工程支援整數 1–1440 分鐘的有限時段、最多 32 個非負有限倍率與 uint32 seed，避免無界微時段工作量；這些邊界不是正式骰法。

模型只回傳 `processFeeling: null | { direction, level, reason }`。null 保留原評估，positive/negative/neutral 與 0/1/2 等級依本人感受；沒有權威 rate、點數、骰值或任意活動身份。與其餘心理更新共用 4 項/8KiB 限制。新欄位只對明示 process policy 的角色進入 wire schema/prompt；未啟用者保留原 provider transcript。

## 活動身份與時間

真正開始且仍在進行的計畫才建立 mentalProcess；拒絕、未開始、只有瞬時結果或未來時間沒有收入。它保存 opaque id、角色內 activity sequence、effectiveAt、updatedAt、activeMinutes、revision、目前感受、PRNG state、draw count 與 current slot（index、draw、usedMinutes）。沒有獨立世界心理時鐘，所有游標都沿原 world minute。

新活動估感受的生效點為本次選擇邊界 `world.minute`。既有 executor 將新 plan.startedAt 回填到這輪之前，心理過程不把這段選擇前時間追補成享受。從下一段真正有效時間開始累計。尚無過程評估的時間保留缺口，不根據 rest、work、睡醒或文字低落自動推測喜惡。

活動的有效 assessed 分鐘是固定 slot grid。暫停保留 id、感受、有效分鐘、目前 partial slot 與 sample。resume 沿既有 lifecycle：選擇恢復的這輪不執行生產進度，plan.startedAt 由保存 elapsed 重建；心理 anchor 同樣移到這個實際恢復邊界，paused gap 不增加有效分鐘。恢復後下一輪才累計。真正重做則分配新活動身份與 sequence，沒有固定重複遞減。

每個有效新 slot 都走一次後端抽樣並保存結果。試驗流由明示 seed、actor id 與該 actor 的實際活動 sequence 派生，使用保存的 uint32 PRNG state 向前取樣。它不依全域 Math.random 的跨角色派送順序，故多角色 30 分鐘與 15+15 分鐘不改變各自 slot sample。每個 slot 只保存一個 sample，跨請求 partial 消費保留；回放不抽樣。模型不收到 seed、倍率、精確點數、活動 PRNG state 或 draw count。

新正常評估只修改之後的 direction/level/reason 和 revision/effectiveAt，不移動已結算游標、不回收既有收支、不清除目前 slot sample。即使在同一 partial slot 改評價也不重抽。骰果幅度非負，不能翻轉角色方向。

有效 endpoint 取實際 plan.until、睡眠自然醒/刺激醒與當輪世界邊界的交集。睡眠使用同一 activeBodyMinutes 計算，包含尚未寫入 naturalWakeAt 的當輪自然醒；自然醒早於刺激時，共同 body/process helper 取較早端點；不能把 12 分鐘實睡付成整個 15 分鐘請求。已完成、取消、暫停或換活動後沒有未來收入。

## 共同收支與觀察者證據

先執行本輪已到期的自然變化，確立其中刺激真正終止睡眠的時點，再抽取 process slots 與收斂自然/過程時間；不能先付整輪睡眠、之後才看見中途喚醒。對已開始且已評估的活動，在決策前按實際時間收斂上段過程。自然消耗與過程收支依同一 chronological boundaries（slot、睡眠與活動端點）合算，再在每個固定 rate 區段限制於 0/maximum；不先把整輪消耗與整輪收入分開 clamp，也不保留上限溢出 credit。這避免零點與上限附近因 transport 分段而改變結果。

history 的 process 行保留該段實際開始/結束、有效分鐘、主觀理由、slot identities/samples、自然 requested delta、過程 requested delta 與實際 before→after。requested delta 不是可另行花費的帳戶；最終餘額才是權威。既有角色面板分別顯示自然/主觀收支及合算限制，保留目前評估的向後生效時點。

首段新睡眠沿 #257 已確認行為重算自然消耗時，重用本輪已抽樣的 process slices 與原 before；不重新抽樣、不事後退款、不覆蓋先前過程收入。同輪 #258 一次性感受仍在 actor finally 才寫入。#261 固定費付款接在合法自然感受之後；process 新評估只設定未來率，不提供本輪付款的預付收入。

候選 plan、sequence、PRNG、slot partial、history、餘額與感受沿同一世界 CAS/save/journal 邊界共同提交。後續角色、保存前、CAS 及 uncertain-save 故障使用既有恢復策略；已知模型 tokens 沿原政策保留，原 operationId 回放不增加模型呼叫或 sample。

## 驗證

`tests/mental-process-api.test.cjs` 使用真正 world GET/POST、SQLite serialization/reload 與實際 provider body；只對外部模型回覆與明示 test seed 進行控制。現有 13 條案例涵蓋首次不預付、多 slot/partial、15+15 vs30、多 actor 排程變化、上下界同時自然消耗、forward-only 改評價不重抽、真實睡眠醒來端點、真正可暫停活動 pause/resume、活動到期/重做、拒絕/neutral/缺口、later actor/save/CAS/uncertain 故障、known usage 與原 ID 回放、首段新睡眠重算不覆蓋舊過程收入，以及損壞的保存評估 fail closed。純續做沒有新增 NPC calls。

TDD 暫存紀錄：`/tmp/quiet-hours-255-context/260-red-1.log` → `260-green-1.log`；`260-red-sleep-boundary.log`（10.75 而非實睡 12 分鐘的 10.6）→ `260-green-sleep-boundary.log`；`260-red-actor-stream.log`（多 actor 切分改變同 slot sample）→ `260-green-actor-stream.log`；`260-red-persisted-assessment.log`（無效 level=99 原本回 200 並污染餘額）→ `260-green-persisted-assessment.log`（派送前拒絕並保留原狀）；review 提供的 `260-red-actual-stimulus.log`（中途 5 分鐘刺激原本付 15 分鐘並抽兩樣本）→ `260-green-actual-stimulus.log`（5 分鐘過程、10 分鐘清醒、1 樣本，餘額 8.25）。另覆蓋原生 30 分鐘請求中第 15 分鐘喚醒與 15+15 切分，皆為 15 過程＋15 清醒、2 樣本、餘額 7.75。

合入 #259/#261 的 integration `96a322a` 後，process/result/regulation 與原 pinned transcript 相關組合 33/33 通過；合前較廣相關組合 64/64 通過。`pnpm typecheck` 通過，lint 0 errors／4 個既有 warnings，diff check 通過。修正 review 中途刺激端點後，再擴大跑 process/energy/experiences/results/regulation/pinned transcripts、activity lifecycle/time/long/time-review、sleep/life-needs/natural-changes 共 **126/126 通過**，記錄為 `260-postreview-related.log`。最末 review 結果另於工作票記錄。

Chromium 已由 root 執行並目視 [角色面板](assets/mental-process-260/process-panel.png)：既有 UI 真正 start 保持 10 不預付，實際投入後 11.5→13，21:45 改評價為 negative 僅使後續變成 10；45 有效分鐘、3 個固定 slot samples。SQLite 重讀、原 ID 回放不改歷史，實際 2 個受控 NPC calls、60/20 tokens、0 paid calls。browser fixture 明示 seed=1、multipliers=[1] 的退化分布，沒有當成正式骰法；[原始證據](assets/mental-process-260/evidence.json) 與 `tooling/verification/browser-mental-process.mjs` 已保存。受控模型僅證明契約、時間與記帳；不宣稱真實模型已正確判定享受或負擔，不關閉 #255/#263。
