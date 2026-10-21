# 活動生命週期責任

來源：[主規格 #125](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/125)、[工作票 #126](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/126)。架構取捨見 [ADR 0002](../adr/0002-bounded-activity-outcomes.md)。

`activity-lifecycle.ts` 集中開始、繼續原計畫、階段推進、到期、取消及舊計畫清理。自主、直接指定與規則模式經 `activities.ts` 的同一入口開始；自主免決策續做、直接控制進度及 NPC 明示續做，經同一推進入口保留起點、完成時間與游標。接管／交還的 API 也使用同一取消入口。

生命週期操作的是本回合世界副本。`world-effects.ts` 仍負責效果權限、物件身份、整批驗證及階段前提；只有驗證完成的物件／供應變化才能與游標共同進入當回合候選。取消只清掉本計畫尚未具體化的 pending 供應，保留已消耗材料、已產生物件與他人變更。

`activities.ts` 保留 NPC 決策協調、知情新消息、模型呼叫與用量；世界 API 保留版本、租約、操作日誌與整回合保存。生命週期不派送模型、不自行選下一項活動，也不獨立寫入資料庫。

#126 是既有行為整理，沒有新增結果分支、模型生成日常程序或遷移舊資料。結果分支與日常規則擴充分別依 #127–#129 交付；本文件不將其規格當作已實作能力。既有時間、上限、開放式時段與續做契約見 [活動耗時契約](activity-time-contract.md)。
