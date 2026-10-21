# 活動生命週期與結果分支

來源：[主規格 #125](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/125)，依序交付 [#126](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/126)、[#127](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/127)、[#128](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/128)、[#129](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/129)。架構取捨見 [ADR 0002](../adr/0002-bounded-activity-outcomes.md)。#125 已自含 Grill 決策；本文件不引用尚未進 repository 的本地對話或報告。

## 已確認的責任

| 責任 | 擁有者 |
| --- | --- |
| 選擇活動、收到消息後續做或換事 | NPC 決策 |
| 確認條件、合理時間、階段、判定需求及有意義的後果 | 天上意志的單次有界裁定 |
| 開始、推進、到期、取消、候選清理及本回合進度 | 活動生命週期 |
| D20 結果、重試資格、物件權限與有限效果驗證 | 既有程式規則 |
| 模型派送、預算／用量、租約及整回合持久化 | 外部協調 |

活動模組只修改本回合世界副本，物件效果與活動進度共同提交或回復。它不派送模型、不保存資料庫、不替 NPC 決定下一步；純推進及擲骰後不增加裁定。

## 沿用的能力與本輪新增能力

原有能力包括受限效果及物件身份、階段與前提驗證、D20 五段結果、判定保留、日常範圍與供應背景、15 分鐘對齊、明確投入上限、續做／中斷、控制入口及操作重放。舊日常核准是 `check=null`、空 `effects/stages`、`completionMinutes=null`，由完整 `routine.timings` 確認時間，再由程式內建程序承接物件；此修正由獨立的 [#122](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/122)／[#123](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/123) 負責。

本輪目標是集中生命週期，並讓模型確認有界階段／效果與結果分支。需要判定的嘗試由程式計算五段結果，選擇已確認後果；多個級別可共用同一分支。失敗可消耗材料或留下部分成果，不能套用成功專屬效果。確定活動不增加擲骰。

可重用日常規則保存方法與適用範圍，重新綁定當前合法工具、容器、材料及版本；不保存首次骰子作為整類活動的永久結果。自由活動的單次裁定只適用本次，不自動增加日常權限。工具和容器仍分開，指定物件、有限供應、使用權與他人同意保持原有約束。

## 相容與驗證狀態

缺少新分支資料的舊規則／計畫保持可讀及可驗證的既有行為，不補造失敗後果或模型確認紀錄；既有已提交成果仍是世界事實，不因取消或發版復原。不自動重置世界。

測試介面沿 #125 的世界 API、SQLite 保存重讀與實際應用瀏覽器；transport fixture 控制模型候選，可控骰子控制判定輸入。HTTP 200、規則已保存、fixture 通過各自不足以證明真實模型或正式站完成驗收。具體已交付能力、實際測試結果及剩餘限制在本輪驗證紀錄另列；本設計文件的目標敘述不代表驗收通過。
