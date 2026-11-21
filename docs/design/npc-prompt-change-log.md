# NPC prompt 修改紀錄

本文記錄 [#341 設計說明](npc-prompt-rewrite-2026-11-16.md)裡幾個容易刪錯或改錯層的句子。v0.2.3 是完整改寫的對照稿，v0.2.4 先經本機實測，再接入測試站的自主決策路徑。正常自主決策由 `aiDecision` 組 system message，`prepareNpcDecision` 放入本人此刻可知的輸入，再派送模型。以下「現行」均指各次比較當時的版本。部署證據限測試站。[派送入口](../../lib/models.ts) · [輸入組裝](../../lib/npc-decision-preparation.ts)

## 1．Cass 和店主把正確的值放錯了地方

**已部署測試站，欄位位置經本機真模型重放。** 在測試站 `640fbc5`，Cass（Luna）和店主（Sol）各收到自己的正常決策輸入。Cass 把追求 ID 陣列放進 `methodAssessment.selectedAction.intentIds`，店主把確認身體後果的布林值放進 `action.reconfirmBodyConsequences`。兩份都是可解析的 JSON，驗證器拒收，整個回合回滾。離線把各欄上移一層並保留原值，兩份分別通過對應的結構檢查。[原始故障與配對試驗](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/85#issuecomment-7002738572)

PR #350 把兩句核對文字放在正常 system message **末尾**，緊接在共同額度之後，讓人物在輸出前看清楚容器邊界。

> action 只含 type、target、content、purpose。reconfirmBodyConsequences 填在最外層，與 action 同層，使用布林值。
>
> methodAssessment.selectedAction 只含 type、target。methodAssessment.intentIds 與 selectedAction 同層，填當次焦點 ID 的陣列，無焦點填 []。

用兩份實際輸入交叉測兩種模型，每格每版 9 份。原提示 **18/36** 通過兩項欄位位置檢查，追加提示 **35/36**；剩下一次是店主的 Luna 仍把布林值填進 `action`。分母只收設定一致的 72 份回覆。這次沒有重跑完整世界回合，所以不能由這個比例推算提交率。#341 精簡 schema 說明時保留這個有實例支持的例外，回歸時另查實際派送的末段。[PR #350](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/350) · [派送回歸](../../tests/npc-input-equivalence.test.cjs) · [測試站部署 ab13311](https://github.com/sarekoubeYohane/quiet-hours-npc/actions/runs/44482150091)

## 2．Cass 已經吃掉餐點，下一回合卻又想吃同一份

**兩段修正已一起部署測試站，模型行為經本機重放。** Cass 的第一次提案已取得、吃掉驗收餐點，世界提交後該份供應為零。下一次決策她卻寫「之前的行動回饋沒有證明我已取得或吃下餐點」，再次提出取餐。世界否決，她又重試；原觀察有 4 筆否決出現在已提交的回合。當時她能讀到自己的行動經歷，供應投影只顯示 `availability=unknown`。[Issue #344](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/344) · [重建出的本人輸入](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/344#issuecomment-6999491783)

以下摘錄同一餐點在世界時間 735 的本人回饋，省略句末已知物件清單。[PR #348 的前後原文](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/348)

| | Cass 下一次收到的短期經歷 |
| --- | --- |
| 改前 | Cass 行動回饋（原提案，非已發生成果：propose acceptance-meal 取得並吃掉眼前的驗收餐點；世界時間 735）：取得驗收餐點，食用驗收餐點 |
| 改後 | Cass 行動回饋（原提案：propose acceptance-meal 取得並吃掉眼前的驗收餐點；世界時間 735）：已發生：取得驗收餐點，食用驗收餐點；這次行動已完成。 |

括號引用原提案，括號後報告世界已提交的效果。分階段用餐在真正吃掉的階段才標「已發生」，受阻時仍交代尚未執行。用固定裁定產生成功後的實際 request，交給 `gpt-6-luna` 重放，舊字串 10/10 重提餐點；只刪「非已發生成果」仍有 2/10 重提。#348 的最終文字為 0/10 重提，10/10 把「吃點東西」評為滿足，並選擇休息。[診斷對照](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/344#issuecomment-6999491783) · [最終字串重放](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/348)

之後若同一人再提同一物件或來源而受阻，#349 允許回饋加上「依自己記得的經歷：世界時間 735 自己已食用驗收餐點。」來源是本人仍保有、可用 `eventId` 對回食用事件的短期經歷。那筆經歷已淡去、只有旁人吃過或只有無事件連結的長期記憶，原因都維持未知。回饋仍寫「未確認本次受阻的原因」，不引用庫存或許可名單。否決後的重放相較只有 #348 時，同樣是 0/10 重提、10/10 評為滿足，新增的是 9/10 在理由中明說記得吃過。維護時從 world route 查**下一次送給 Cass 的輸入**，覆蓋立即吃完、分階段完成、受阻與失去記憶。這層的測試能抓到世界回饋改壞，而 system prompt 的文字測試抓不到。[PR #349](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/349) · [行動回饋回歸](../../tests/action-feedback-api.test.cjs) · [兩項修正部署 640fbc5](https://github.com/sarekoubeYohane/quiet-hours-npc/actions/runs/44464614531)

## 3．心力見底的 Cass 和 Vera 在一起，仍想獨處

**先在測試站給便條，再於本機改 system message；精簡後的產品文字已部署測試站。**

測試站從第 26 回合的同一存檔分出三組，分別送一般便條、感受提醒、提醒加例子。三組沿用當時的 system prompt。Cass 收到一般便條後選擇繼續坐著，活動感受留空，卻把「被允許照自己的步調安排」記為正向新經歷。收到提醒後同樣繼續坐著，這次寫「不用一直決定下一步，安靜坐著的過程讓我稍微輕鬆些。」便條本身也會成為可評價的事件。本機觀察檔為工作目錄上一層的 `1121-精神提示三組實測.json`，可按 `cases[].decisions` 和 `ledger` 核對兩種感受。

本機真正換了送給 `gpt-6.1-sol` 的 system message。同一人的座椅、身體狀態與已收到的便條固定。Cass 心力 1/50，身體不累也不睏，原版選 `rest`、`processFeeling=null`，便條經歷讓電量 1→4。加一般感受提示後，她說「坐著不必立刻決定往後的事，這份不被催促的空檔讓我舒服些」，活動感受與便條經歷分開結算，這次最後是 5。兩人各跑兩次，回覆表達正向活動感受共 **4/4**，原版 **0/4**。其中 Vera 一份正向回覆未提交，所以 4/4 也不能當成四次回電。[試驗用原句](../../tooling/experiments/npc-prompt-trial/energy-prompts.cjs) · [PR #353](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/353)

同房試驗取消便條，兩組都有一般提醒，只有一組多了陪伴句。人物看得到對方和既有關係。加入陪伴句後 **6/6** 在 `processFeeling.reason` 說出對方在場或當面互動怎麼影響自己，對照 **0/6**。Cass 的反例是對 Vera 說「我還是需要我們說好的那幾天空間」，並寫「我在乎 Vera，但現在心力見底，當面說出需要空間還是有點費力。」回合提交，下一格活動骰原值 −2，電量從 1 降到下限 0。熟人陪伴也可以安心、費神或毫無特別感覺；判準是人物說了什麼，電量則查該格活動、自然收支及新經歷的帳本。[試驗與判讀方法](../../tooling/experiments/npc-prompt-trial/README.md) · [本機原始 JSONL 封存](../verification/assets/npc-prompt-trials-2026-11-21.zip)

產品把提醒濃縮成「做決定前，分別留意自己的心力、疲勞和睡意」和「依你對在場者的看法，以及你此刻想不想有人陪，評估這段活動」，也允許無法判斷時留 `null`。這三種狀態可以同時不同，例如有力氣坐著卻無力交談。上述比例來自部署前的提示變體；部署後從同一測試存檔另存觀察，沒有再加玩家便條，可由本機 `PR353-測試站精神電量實測.json` 的 `modelTraces` 核對已派送的提醒。[產品文字](../../lib/models.ts) · [測試站部署 1a4f3ce](https://github.com/sarekoubeYohane/quiet-hours-npc/actions/runs/44868097049)

## 4．說想睡、提出睡覺、世界記下睡著

**起因見於測試站，以下睡眠提示與兩組試驗均在本機。** 第 2 天 01:40，Cass 已在臥室，心力見底、身體沒有明顯疲累而有些睡意。她寫「在床上躺好，閉眼安靜休息，讓自己順著睡意入睡」，動作卻是 `rest`。到 04:40 離床，36 個五分鐘格都有清醒與活動骰，睡眠專屬入帳 0 次。電量可以因她享受獨處而上升。工作目錄上一層 `PR353-Cass睡眠續測.json` 的 `claimedActivity` 與 `bedTimeGridCounts` 可對讀。

本機在有身體需求的人物提示中加入「只想清醒地坐著或躺著歇一會兒，用 rest，這段活動會保持清醒。想睡一覺時，用 propose 向眼前可用的床或已知的合適地點提出睡覺，content 寫具體做法，purpose 寫睡眠目的。」後面接「由世界依當下情況判定是否實際入睡。有睡意時你仍可選擇保持清醒。」這讓人物表達打算，並把入睡與否留給世界。[本機提示](../../lib/needs.ts) · [實際派送及睡眠 API 測試](../../tests/sleep-api.test.cjs)

**真模型選擇。** Cass 和 Vera 各自在自己的房間看得到床。每人有三份快照，分別是有些睏想睡、很睏想睡、有些睏想清醒。每份快照各跑新舊版一次，舊版只移除睡眠段。共 12 個 NPC 決策，另有 4 次世界裁定。想睡的四對中，舊版 **4/4 選 rest** 並提交為清醒休息，新版 **4/4 選 propose** 向床提出睡覺。想清醒的兩對，新舊版各 **2/2 選 rest** 並提交。四個新版提案的裁定回覆都只給 `bodyActivity.kind=rest`，四次世界回應都是 502，**0/4 提交入睡**。例如 Cass 有些睏時提出「在自己的床上躺好，調整成舒服的睡姿，閉眼睡覺，希望睡到自然醒」，裁定承認她可以臥床嘗試，卻沒有提供完成目標所需耗時。原始檔為 `artifacts/energy-prompt-trial/sleep-live-2026-11-21T06-14-35-542Z.jsonl`。[原始 JSONL 封存](../verification/assets/npc-prompt-trials-2026-11-21.zip)

**固定入睡後的帳本。** 另以固定決策和裁定明確核准 `sleep`，由正式世界 API 每次推進五分鐘。四筆想睡的新提示樣本各累積 12 格實睡；第 55 分鐘 `sleepDelta` 全是 **0**，第 60 分鐘全是 **+1**。這裡量的是確認入睡後的遊戲規則。查 `artifacts/energy-prompt-trial/sleep-fixture-2026-11-21T06-17-57-929Z.jsonl` 的 `sleep.ticks`；同日較早的 fixture 是工具檢查，不重複計為樣本。[結算試驗程式](../../tooling/experiments/npc-prompt-trial/sleep-trial.cjs) · [原始 JSONL 封存](../verification/assets/npc-prompt-trials-2026-11-21.zip)

## 5．「先試著入睡」能提交什麼？（2026-11-21，本機真模型）

Cass 在「有些睡意」和「睡意強烈」兩筆舊樣本都提出睡到自然醒，裁定只確認臥床休息，回合因「完成目標缺少世界確認耗時。」回滾。這輪只替換睡眠提示中的例句。

```diff
-例如在自己的床上躺好睡覺，希望睡到自然醒。
+如果你想先躺下試著入睡，可以用 timeIntent.kind=open-ended 選一段願意嘗試的時間，何時醒來留給世界判定。
```

**事前預期。** 在想睡的相同快照中，候選版會增加「向床提出睡覺且選 open-ended」的回覆，減少因缺少確認耗時而回滾的回合。每位人物另有想清醒休息的快照，預期仍可選 `rest`。分別核對提交、身體活動與睡眠收支。只有世界確認入睡且回合提交，才計一次入睡。

**怎麼比。** 保留本機睡眠段落的其餘文字與 #350 結尾。從 Cass、Vera 各三個快照交替派送現行版和候選版，每格一次。兩版使用相同的角色輸入、schema、模型設定及世界快照，NPC 與實際需要的裁定都用 OpenAI `gpt-6.1-sol`。共 12 次 NPC 決策、4 次裁定。下表的 HTTP 是世界 API；所有模型呼叫都回 200。兩個版本都把世界從第 1260 分鐘開始算。[完整派送、模型原文與世界重讀](../verification/assets/npc-prompt-trials-2026-11-21.zip)

| 人物與當時的打算 | 現行句：模型回覆 → 世界結果 | 候選句：模型回覆 → 世界結果 |
| --- | --- | --- |
| Cass 有些睏，想睡 | 提案睡到自然醒，completion 540 分；裁定回 rest，效果格式無效，502 | 提案試著入睡，open-ended 480 分；200，記「尚未執行」 |
| Vera 有些睏，想睡 | 提案試著入睡並希望自然醒，completion 480 分；裁定回 rest，效果格式無效，502 | 提案試著入睡，open-ended 480 分；200，記「尚未執行」 |
| Cass 很睏，想睡 | 提案睡到自然醒，completion 480 分；裁定回 rest，效果格式無效，502 | 提案試著入睡並自然醒來，open-ended 480 分；200，記「尚未執行」 |
| Vera 很睏，想睡 | 提案睡到自然醒，completion 480 分；裁定回 **sleep**、確認耗時為 null，502 | 提案試著入睡，open-ended 480 分；200，記「尚未執行」 |
| Cass 有些睏，想保持清醒 | rest 30 分，200，記清醒休息 | rest 30 分，200，記清醒休息 |
| Vera 有些睏，想保持清醒 | rest 30 分，200，記清醒休息 | rest 15 分，200，記清醒休息 |

**改善到哪裡。** 想睡的四對都向眼前的床提出睡覺；使用開放式時段從 **0/4 變 4/4**。缺少確認耗時而回滾的案例從 1 次降至 0 次，另三次格式故障也沒有再出現。這四對的提交從 **0/4 變 4/4**：現行版失敗後仍是第 1260 分鐘且沒有新增事件；候選版全都前進到 1265。兩組清醒對照各 **2/2** 提交 `rest`。Vera 的時段縮短到 15 分鐘，仍符合她當下的打算。

**退步在哪裡。** Vera 很睏的現行回覆至少走到裁定，裁定回 `accepted`、`bodyActivity.kind=sleep`，但 `completionMinutes=null` 使本回合回滾。換句後她說「閉上眼睛試著入睡，醒來再處理其他事情」，世界卻在派送裁定前就把新開的 `propose + open-ended` 標為 `unsupported`。她的世界結果是「這種效果目前無法承接，尚未執行，沒有新增成果。」另外三份候選提案走同一條路。四份候選的 `firstWorld.body` 都是 `null`，現行與候選實際睡著均 **0/4**。前一輪四次裁定都回清醒休息，這輪 Vera 的裁定有一次回睡眠，應分批判讀。[世界派送的分支](../../lib/host-operations.ts) · [完成耗時驗證](../../lib/activity-lifecycle.ts)

**決定：撤回候選句。** 保留本機既有的 `rest`／`propose` 說明與原例句；候選句僅留在試驗工具。它讓人物更常選到世界一律不受理的組合。下一個待解問題是：當人物只想開始睡覺、醒點交給世界時，世界該如何受理其時間意圖，又應憑什麼確認真正入睡？重現可用 Vera 的 `strong/current`、`strong/candidate` 兩列，並保留 `awake` 對照。是否入睡、何時醒來及其後的回電，仍須各自取得世界證據。[睡眠契約](life-sleep-baseline.md) · [重跑方式](../../tooling/experiments/npc-prompt-trial/README.md)

世界端的兩筆 Vera 重現案例與待釐清的時間契約已另開 [#354 入睡提案的世界裁定](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/354)。#341 繼續以人物實際收到的提示與決策回覆比較措辭。

### 證據索引

本機原始 JSONL 放在 `artifacts/energy-prompt-trial/`，該目錄由 Git 忽略。本次另將下列資料放進同一份 [repo 證據封存](../verification/assets/npc-prompt-trials-2026-11-21.zip)，供其他 checkout 核對。

| 封存檔案 | 查什麼 |
| --- | --- |
| `station-excerpts.json` | 三組測試站便條、部署後的派送觀察及 Cass 臥床 36 格的帳本摘要。附本機來源檔名與 SHA-256 |
| `live-2026-11-21T04-14-28-516Z.jsonl` | 單人三組每組四次；對照 `original`、`hint` 的活動感受、經歷收據和活動帳 |
| `companion-live-2026-11-21T04-26-59-723Z.jsonl` | 同房兩組每組六次；查 `partner`、`candidate.processFeeling`、`interval` |
| `sleep-live-2026-11-21T06-14-35-542Z.jsonl` | 第 4 節的舊版與新版，12 次真模型決策 |
| `sleep-fixture-2026-11-21T06-17-57-929Z.jsonl` | 第 4 節的固定裁定，查四筆 `fullHour=true` 的第 11、12 格 |
| `sleep-onset-live-2026-11-21T06-26-26-673Z.jsonl` | 第 5 節的六對。依人物與 `sleepCase` 選兩列，比 `calls[].request`、`reply`、`http`、`firstWorld` |
| `sleep-draft-live-2026-11-21T08-01-57-101Z.jsonl` | 第 6 節完整草稿與本機現行版的睡眠對照，六對 |
| `companion-draft-live-2026-11-21T08-05-27-768Z.jsonl` | 第 6 節完整草稿的同房對照，兩對 |

本輪以 `feat/npc-sleep-intent-prompt` 的 `1fee171` 加工作樹內既有睡眠修改執行。六對實際送出的 request 逐一比較，只有上述例句不同。另以禁網模式跑過睡眠、行動回饋、派送內容、模型契約、方法評估及正式精神電量回歸，**71/71 通過**。兩輪睡眠工具也各自通過固定回覆檢查。上述真模型數字保留每格一次的原始分母。

## 6．完整 v0.2.3 草稿有涵蓋後來發現的問題嗎？

**2026-11-21，本機對照。** 前兩次睡眠試驗替換的是產品提示裡的一段或一句。本輪才把[整份 v0.2.3 草稿](../../tooling/experiments/npc-prompt-trial/v0.2.3.md)接到同一批場景。現行組使用工作樹中含 #350、#353 與睡眠段的產品提示；草稿組把性格與原始目標移到 system message，依情境放入小節。各組從同一人物的同一世界快照開始。NPC 和有需要的裁定使用 `gpt-6.1-sol`，新組裝在 NPC 派送時生效。

組裝前先發現 Windows checkout 的 CRLF 換行會使條件標記失效。拿同一份 Cass 臥室輸入測，舊工具在沒有回想時仍放入「回想」。已修工具讀檔時的換行處理，並用 12 份舊派送資料驗證 LF 和 CRLF 得到逐字相同的 system message 和小節清單。以下比較使用修正後的組裝器。[組裝工具](../../tooling/experiments/npc-prompt-trial/assemble.cjs) · [重跑兩組對照](../../tooling/experiments/npc-prompt-trial/README.md)

**睡眠。** 草稿在動作表直接寫「想睡覺要用 `propose`」。兩版各 6 次決策；想睡時各 4/4 向床提案，想清醒時各 2/2 選 `rest` 並提交。四筆想睡的草稿回覆中，只有有些睏的 Cass 提交了回合。她選 `open-ended`，本人得到「尚未執行」的回饋。有些睏的 Vera 遇到「完成目標缺少世界確認耗時。」很睏的 Cass、Vera 都取得通用日常裁定，兩份的 `program.bodyActivity.kind` 都是 `sleep`，但確認時間分別是 540、480 分鐘，最後階段卻都排在第 15 分鐘，世界 API 回 502。四對中現行組也都未睡著。草稿解得了「想睡時選哪個動作」，世界如何承接仍由 [#354](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/354) 追蹤。[日常階段驗證](../../lib/routine-world-contract.ts)

**吃完又想吃。** 草稿交代提案要等世界回覆，真正讓 Cass 收到「已發生」及本人仍記得吃過的修正來自 #348、#349。草稿組裝後從 user JSON 移除的是已搬到開頭的性格與目標，本人的經歷仍留在輸入。本輪另跑世界回饋回歸 21/21 通過，包含立即及分段進食、記得與忘記、別人吃掉四種邊界。這是輸入層的固定回覆測試；本輪沒有用吃完餐點的快照重抽草稿模型。舊回放的 0/10 重提不列作草稿成績。[回饋測試](../../tests/action-feedback-api.test.cjs)

**陪伴與活動感受。** 兩版的 Cass 都在同房時主動說想要一點空間。草稿版說「只是我今晚沒什麼心力，想先安靜待一會兒。」但她的 `processFeeling` 是 `null`。草稿版 Vera 在手機記下髮飾構想，理由是想享受自己的設計時間，該欄也留空。兩版各 2/2 提交，在活動感受中明說陪伴影響的都是 **0/2**，下一格活動感受收支都為 0。這次小樣本無法區分兩版的模型表現。可確定的文字差異是草稿仍要求「這回合才要開始的事填 `null`」，也沒有 #353「依你對在場者的看法，以及你此刻想不想有人陪」的提醒。說出口想獨處、主觀評價活動和實際入帳，三者要分開讀。[v0.2.3 的感受規則](../../tooling/experiments/npc-prompt-trial/v0.2.3.md) · [原始陪伴試驗](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/353)

**欄位放錯層。** 逐筆核對 16 份 NPC 原始回覆，兩版各 **8/8** 通過 #350 的兩項位置檢查。`action` 只有四個鍵，布林值在根層，`intentIds` 與 `selectedAction` 同層，後者只有 `type`、`target`。草稿有列四個動作鍵，也用完整路徑指向 `methodAssessment.intentIds`，但末尾沒有 #350 明說布林值與兩個子欄位位置的核對句。這 8 份是 Cass、Vera 在睡眠與同房情境的回覆，不能代替 Cass、店主原始錯層快照的跨模型重放。[原錯層對照](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/85#issuecomment-7002738572)

**輸入大小。** 對照八對派送時同時核對世界快照與替換前 request 的雜湊，再把草稿送出的 user JSON 與原件逐欄比較。除移到 system 的性格、目標外，人物輸入、schema 和模型設定一致。下表取供應商回報的 NPC `prompt_tokens`，每格一次，排除裁定呼叫。

| 場景 | 每版決策數 | 現行平均 | 草稿平均 | 少用 |
| --- | ---: | ---: | ---: | ---: |
| 睡眠與清醒休息 | 6 | 15,439 | 9,028 | 41.5% |
| 同房 | 2 | 15,540 | 9,311 | 40.1% |
| 合計 | 8 | 15,464 | 9,098 | 41.2% |

保留 v0.2.3 為本輪實測基準。睡眠的動作區分已有行為證據；若要把草稿接入產品，仍需處理新活動填空的文字衝突，並用原錯層樣本驗證精簡後的末段。[完整派送與世界結果](../verification/assets/npc-prompt-trials-2026-11-21.zip)

## 7．把欄位層級、活動感受與睡眠修正帶入 v0.2.4

**試驗前的預期。** 從同一人物、同一快照比較 [v0.2.3](../../tooling/experiments/npc-prompt-trial/v0.2.3.md) 與 [v0.2.4](npc-prompt-rewrite-draft.md)。移除「這回合才要開始的事填 null」，預期新活動較能表達具體感受；有人在場時，才提示評估陪伴，也容許費神或沒感覺。保留想睡選 `propose`、想清醒選 `rest` 及世界判定入睡的界線。驗收欄位用 #350 的兩項位置檢查；驗收餐點用人物實際收到的已提交行動回饋。每組記下模型回覆、世界提交及重讀狀態。這輪同時測數項修正，只能評估整版差異。

| 位置 | v0.2.3 的問題 | v0.2.4 的寫法和理由 |
| --- | --- | --- |
| 開頭與精神電量 | 「都會讓心力恢復」對遊戲結果說得太滿 | 做喜歡的事「可能讓心力恢復」。分開考慮心力、疲勞、睡意；實際收支查世界帳本。 |
| 活動感受 | 明令新選的活動填空 | 「現在要開始的活動也可以評」，寫方向、強度及當下理由，仍可留空。有人在場且有精神電量時才補陪伴提醒。 |
| 睡眠 | 「很睏的時候，直接提出」容易把睡意當決定 | 改成「想睡一覺時」才提出地點、做法與目的，「有睡意時你仍可選擇清醒地歇著」。入睡交給世界判定。 |
| 最後兩句 | `action` 與方法評估的說明分散 | 帶入 #350 驗過的原句，點明根層布林值、動作四鍵以及 `selectedAction` 和 `intentIds` 的同層關係。 |

**同房的改善與代價。** 兩人同房、沒有便條，各跑三對。舊稿 0/6 表達活動感受，新稿 6/6 都提出正向活動感受，6/6 回合提交並在下一格擲活動骰，只有 3/6 的活動分量大於 0。Cass 的一句是「Vera 在場讓我有些在意，但我不必立刻談清楚。」這是 1 筆明確描述在場者影響的例子；Vera 另 2 筆在理由提到不用猜 Cass 想不想說話或不急著找 Cass 說話，沒有直接評價陪伴本身。不能把 6 筆都算成喜歡陪伴。行動也變集中：新稿 6/6 都選 `rest`，舊稿選過 `rest`、`say`、`phone` 和 `propose`，其中 5/6 提交。Vera 在新稿中仍想髮飾，只是改在心裡構思；舊稿兩次把點子寫進手機的選擇值得保留為對照。

**想睡與清醒。** 每版 6 次、另各有 4 次真模型裁定。兩版想睡都 4/4 向床提案，想清醒都 2/2 以 `rest` 提交。四對想睡提案均未提交入睡。新稿很睏的 Vera 提議睡 540 分鐘，裁定只給清醒休息，完成目標缺少確認耗時，時間停在第 1260 分鐘。其餘三個新稿睡眠提案都是「裁定效果格式無效」。[世界端待解問題 #354](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/354)

**餐點回饋。** Cass 的兩版使用 Luna，兩份快照由同一驗收場景建立，裁定固定。餐前各 1/1 向 `acceptance-meal` 提案，世界記錄取得、吃掉，餘量 1→0。餐後兩版收到逐字相同的「已發生：取得驗收餐點，食用驗收餐點；這次行動已完成。」各 1/1 選 `rest`，回合都提交，存回的 `cass:acceptance-food` 都是 `satisfied`。新稿 Cass 的理由是「餐點已吃完，身體暫時沒有明顯需求」。兩版各另測店主 Sol 一次，欄位正確，授權杯子的提案由固定裁定否決並提交回饋。這輪沿用 #348、#349 的遊戲回饋。

**移除 strict schema 的欄位壓力試驗。** 另用上述重建的 Cass 餐前與店主輸入，各版本、人物跑兩次。沿用 #85 的 JSON 模式、low 推理、4,096 輸出上限；這次沒有當時測試站的兩份原始 request。兩版各 4/4 通過 #350 的兩項位置檢查，卻各 0/4 提交。八份原始回覆都有另一個具體違約：`methodAssessment.change` 填成字串 `"not-applicable"`，契約要求含 `kind`、`detail` 的物件。這提供了下輪測試措辭的案例，不能把結果解讀為 #350 的數字已在原樣本重現。[原始試驗](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/85#issuecomment-7002738572) · [方法評估契約](method-assessment.md)

**獨處時有感受，回合卻回滾。** Cass 心力只剩 1，獨自在休息椅上，收到「今晚這裡留給你，你可以照自己的步調安排」的便條。舊稿的 Cass 兩次都休息並提交。新稿也兩次都選休息，其中一次寫「不用立刻決定往後的事，安靜坐一會兒，對我比較輕鬆。」兩份回覆都同時填 1 筆活動感受、1 筆便條感受、1 筆追求更新、2 筆記憶選留，合計 5 項，超過程式共用的 4 項上限。遊戲兩次都回 502，時間停在 1260，心力仍是 1。Vera 的新稿兩次都成功提交，在心裡構思髮飾；帳本一次活動分量為 0，另一次為 +1。獨處共四對，正向活動感受由 0/4 到 4/4，成功提交從 3/4 到 2/4。[共同額度的驗證](../../lib/models.ts)

**輸入長度與提交。** 共有 23 對、46 次真模型 NPC 決策。每對核對快照、替換前的完整 request，以及派送時除 system 之外的請求內容；另用保存的草稿重新組裝，逐字核對 46 份已派送 system message。一般 strict schema 兩版各 19/19 通過 #350 的位置檢查，各 13/19 提交；JSON 模式各 0/4 提交。兩種模式合計的 NPC 輸入平均每次由 8,931 增到 9,100 tokens（+1.9%，不計裁定）。依第 6 節相同的六筆睡眠、兩筆同房配重，本輪新稿平均 9,284；前輪產品長版平均 15,464，跨輪估算約少 40.0%。正式配對的長版比較見第 6 節。

**本輪取捨（本機實測，尚未部署）。** 撤回「這回合才要開始的事填 null」，保留「現在要開始的活動也可以評」以及無法判斷可留空的選擇。陪伴句保留在有人在場的段落；目前只有一份明說對方在場如何影響自己，仍須單獨檢驗這句與行動選擇的關係。保留睡眠的動作區分與 #350 末句，根據分別是清醒對照與歷史錯層試驗。餐點回歸繼續測遊戲送給本人的回饋。草稿暫留在試驗工具。下一個可單句驗證的失敗是獨處的 Cass 如何算四項額度：草稿的檢核句只列七個更新陣列，她新增活動感受時超出一項。可只改這句，重放上述獨處場景，檢查她能否自己選擇保留哪些感受、記憶或追求並提交。

**重跑與查證。** [試驗工具與指令](../../tooling/experiments/npc-prompt-trial/README.md) · [五份真模型 JSONL、實測草稿全文與前輪紀錄](../verification/assets/npc-prompt-trials-2026-11-21.zip)。封存內的 `drafts/v0.2.4.md` 固定了本次文字。五份 `*-revision-live-*.jsonl` 以 `companion`（12 筆）、`sleep`（12）、`solo`（8）、`meal`（6）、`layout`（8）開頭。按 `condition`、人物、場景及重複序號配對，讀 `calls[].request`、`reply`、`usage` 核對派送、原始回答與輸入量，再看 `http`、`committed`、`firstWorld` 及精神電量的 `interval` 判讀世界結果。另跑睡眠、行動回饋、人物輸入、決策契約、方法評估與正式精神電量六組本機測試，71/71 通過。

## 8．測試站啟用完整 v0.2.4

測試站建置從同一份 Markdown 取用提示，並在每次派送前按人物當下看得到的輸入組裝。性格與目標各放在 system 一次。回想有開放才加入回想小節，取得記憶後的續答會重新檢查可見內容、schema 與整個 request 的大小。測試站的 `/api/environment` 用決策入口讀取的同一份提示取得版本，生效時回傳 `npcDecisionPrompt: "v0.2.4"`。[組裝器](../../lib/npc-prompt-rewrite.ts) · [實際派送入口](../../lib/npc-decision-preparation.ts)

本機在 OpenAI 與 OpenRouter 兩條派送路徑攔下第一次決策與回想續答，逐欄比對 system、人物 JSON、schema 與歷程。另外走正式世界 API，以固定裁定確認店主的睡眠提案能提交並建立睡眠活動。用共用組裝器重建第 7 節的 46 筆 system message，兩版各 23 筆都與封存逐字相同。第 7 節的真模型行為與回滾數字來自本機；上站後可在人物自己的回合紀錄觀察新提示。[派送與回想回歸](../../tests/npc-input-equivalence.test.cjs) · [世界 API 回歸](../../tests/sleep-api.test.cjs) · [測試站版本](https://quiet-hours-npc-test.houmengkou.workers.dev/api/environment)
