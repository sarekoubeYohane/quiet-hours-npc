# #271 人物基本屬性、擲骰分工與精神電量：接手稽核

本文件記錄 2026-11-09 接手時的規格、依賴與程式差距，供後續實作使用；不是 #272／#273／#274／#256 的規則定稿，也不代表 #275–#278 或 #263 已完成驗收。

## 最新基線與已完成工作

本次已重新 fetch 並核對 `origin/main` 為 `a9a0ef545d4f233def30ecde3d0816e9ddd93b8e`。[PR #265](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/265) 已 merged，#257–#262 已關閉；其工程成果已在 main，接手時不得重做。原工作區另有未提交文件，保留原狀，不以 reset、stash 或覆寫納入本次交付。

已完成範圍是 [#255](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/255) 的狀態、實際時間、來源去重、主觀過程、調節交易與接管評估工程接點。數值啟用仍限明示 local/test fixture policy：`lib/mental-energy.ts` 的 `MentalEnergyPolicy.kind` 仍是 `test`，production 不接受該政策，普通 GET 不啟用。歷史隔離驗證見 [#255 整合紀錄](mental-energy-integration-255.md)。既有分鐘比例自然消耗、partial slot 與 fixture 參數不等於 #271／#256 的正式整格骰法。

## 原生任務圖與開始條件

本次重新核對 Issues 最新本文、留言、原生依賴與相關 PR；箭頭表示前者阻擋後者。不能只因實作票有 `ready-for-agent` 就越過前置。

| 支線 | 原生順序與目前狀態 |
| --- | --- |
| 建角與檢定 | [#272](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/272) → [#275](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/275) → [#277](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/277)；皆 open，#272 規則尚待確認。 |
| 時間 | [#273](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/273) → [#276](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/276)；皆 open，#273 相容契約尚待確認。 |
| 身體需求 | [#274](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/274) → [#278](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/278)；皆 open，#274 政策尚待確認。 |
| 精神電量 | [#256](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/256) → [#263](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/263)；皆 open。#263 原有的 #259、#261、#262 依賴仍保留，三張均已 closed，不因已完成而刪邊。 |

[#271 主規格](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/271) 與 #255 仍 open。#256 已確認的容量、初值、五階、效果骰與固定費用繼續沿用；剩餘背景來源、啟用、格內有效性與同刻結算等契約未完成。Q30「先時間、再一次性事件、最後調節」仍為未回答提案，不是正式政策。本次文件切片不更改任何 Issue 狀態、標籤或依賴。

## 可沿用的工程接點與相容性風險

| 接點 | 已有實作與接手限制 |
| --- | --- |
| 世界推進與原子性 | `app/api/world/route.ts` 的世界 API、`lib/activities.ts` 的整輪候選、SQLite CAS、操作日誌、原 ID 恢復及既有 WorldApp 是驗收入口。不得另建只在 helper 測試成立的平行流程；保存衝突及結果不明仍沿原共同提交與用量責任處理。 |
| 人物與背景 | 角色背景與權威人物資料應承接現有世界形成／角色保存流程。四項屬性已確認不代表刻度、抽取式、背景合成及長期成長已定；不得從 fixture 補出正式人物參數。 |
| 舊 D20 檢定 | `lib/adjudication-limits.ts` 與 `lib/world-effects.ts` 仍承接 D20 難度、結果分支及後果。d100 兩端各 5% 已確認，但 06–95、能力／難度與專長合成及 D20 相容仍是 #272 前置；不能只換骰面就宣稱 #277 完成。 |
| 活動耗時 | API 與畫面目前接受 15／30 分鐘；活動估時、完成時間及階段有 15 分鐘粒度。`lib/activity-lifecycle.ts` 的新計畫使用 `startedAt = world.minute - minutes`，部分確定行動於當輪直接套效果。單改五分鐘按鈕會改變成果時機；新選擇依終點資訊卻倒填起點的因果風險必須由 #273 明示處理。 |
| 自然變化 | `lib/natural-changes.ts` 沿已提交來源安排後果，名義到期與實際提交分開；現有 [自然變化時間契約](../design/natural-changes-time.md) 明列一次 30 與兩次 15 不保證同歷史。#273 須明示新批次／分段承諾與原子性，不可悄悄擴增單 HTTP 模型次數或租約期限。 |
| 實際睡眠 | `lib/needs.ts` 可計算格內自然醒點；`wakeSleepingActivity` 只承接不晚於真實醒點的階段，技術區段到期不冒充醒來。`lib/activities.ts` 先處理可能中止睡眠的自然後果再結算心理時間。新五分鐘格仍須區分真實睡醒、正常決策點及精神電量有效格；不為對齊改寫舊事件時間。 |
| 主觀效果與調節 | `mentalIntervals`／`settleMentalInterval`、`applyProcessAssessment`、`applyFeelingUpdates`、`applyEmotionRegulation` 與 controlled feelings 是可沿用接點；來源去重、向後生效、先合法既有補耗後付款與共同提交已存在。測試政策的計算順序不能代替 #256 未定同刻政策。 |
| 舊世界 | 沿 ADR 0007：GET／重載不遷移、不重抽、不補歷史、不重置。已保存計畫時間、階段游標、已發生後果、政策與來源保留原義；首次正式啟用及新舊政策的承接由前置契約明示。 |
| 技術時間 | [完整回合時間政策](../design/round-time-budget.md) 的 calls／tokens、截止、固定租約及恢復責任保持有效。世界五分鐘與現實等待期限是不同單位；長活動續做不增加逐格模型呼叫。 |

相關已確認方向另見 ADR [0002](../adr/0002-activity-rules-and-lifecycle.md)、[0007](../adr/0007-autonomous-life-time-and-evidence.md) 及 #255。原工作區另有未提交的 ADR 0011 精神電量設計紀錄，本次已讀取但未擅自搬入 main；其 accepted 標示不代表正式政策或真實模型行為已驗收。

## 本切片驗證與證據界線

本切片僅新增接手紀錄並為舊整合報告加註日期；依專案技能對文件執行內容、相對引用與 diff 檢查，不新增 runtime 測試。未呼叫付費模型、未部署、未推進正式世界。2026-11-09 的完整回歸由整合流程另外記錄，本文件不預填尚未完成的測試結果，也不把舊報告測試數字當成本次執行。

本次唯讀擷取與探索筆記暫存於 `/private/tmp/npc-handoff-20261109/`；暫存路徑不是持久驗證證據。正式可追溯來源為上述 GitHub Issues／PR、main SHA 與 repo 既有設計／驗證文件。
