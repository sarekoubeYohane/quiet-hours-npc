# #181 跨日自主生活本地整合證據與正式驗收交接

基於整合分支的 #173–#180 前置（起點 `25b935d`），測試介面沿 #172：真實世界 API、整輪提交、JSON／SQLite 保存重讀與既有應用瀏覽器。模型 transport、初始世界及 D20 為明示 fixture；產品活動、效果、認知、時間與保存不替身。沒有付費模型、正式世界推進、重置、部署或合併。

驗證結果：最終整合案例6項通過；此前搭配契約、需求、長活動、睡眠、習慣與喜好回歸57項通過。`tsc --noEmit --incremental false`及修改檔eslint通過。所有證據均為本地可控機制。

## 同一世界的完整流程

可執行來源：`tests/life-integration-api.test.cjs`、`tests/fixtures/life-loop.cjs`、`tests/fixtures/life-loop-flow.cjs`。

初始 fixture 後不使用 `store.replaceCommittedWorld`、SQL寫回、直接改世界分鐘、補造記憶或習慣證據。世界 API 只允許既有15／30分鐘，因此跨日等待也以真正 advance 推進，沒有擴大入口。

| 階段 | 已核對的實際結果 |
| --- | --- |
| 身體訊號→選擇 | 飢餓進入新階段後，正常決策自主選 pause；沒有介入或直接控制強迫暫停。 |
| 四小時手作 | 第一階段真正 form 消耗同一材料、形成可追來源的底料；已投入30分鐘後暫停，尚餘210分鐘。 |
| 攝取與休息 | 同一餐點與飲水真正 ingest，飢餓16.25、口渴18.5；清醒休息持續120分鐘，體力逐段恢復，睡眠需求仍增加。 |
| 自主復工 | resume 維持 cursor、已投入進度及同一次 D20 結果；材料revision不再次增加，未重複形成底料，完成時工作物件只執行一次最後階段。 |
| 真正睡眠 | 105分鐘時仍睡眠，不因90分鐘技術界線或普通飢渴醒來；按真實恢復自然醒，下一個行動仍由fixture角色選。 |
| 跨日認知 | D1／D2／D3均真正執行整理→休息，再於正常決策引用當次可見來源；三日事件習慣與時段習慣成立，主觀偏好由明示評價形成。後續輸入能取得兩者，也能選擇不照習慣行動。 |
| 派送／骰子 | 完整3735世界分鐘、134次 advance：30次NPC、3次裁定fixture；純階段／安靜續做沒有裁定。手作D20由受控亂數得14，成功／失敗結果分支不同；暫停、復工及跨日後freeTrials仍只有同一次結果。未為休息、喜好或習慣新增骰子。 |

相同口渴壓力另覆蓋四種合法自主選擇：喝水實際降低需求；泡茶有真正飲水／茶葉來源及新飲品但尚未喝到；先聊天；繼續原工作。意圖保持角色回覆的排序，沒有強制處理需求或能力懲罰。

## 整輪故障、舊資料與成本

- 同一主生活起點先完成工作第一階段與暫停，再在一輪中真正攝取、形成主觀偏好及自主開始證據；分別注入較後角色格式失敗、保存前故障、保存後結果不明。需求、物件、活動、暫停、認知與世界時間共同回復或共同保留；早先已提交材料與進度保持不變。已知用量保留；原操作ID重送重播同結果、零新增派送。
- 舊world缺needs時GET不回填。舊v1「喝茶」原義仍消耗茶但沒有未確認的需求緩解。角色同句明示重新確認後，原裁定slot保存含ingest的獨立v3範圍；第三杯沿新範圍免費重用，即使再次填true也不增加裁定。原v1規則深比對不變。
- 同方法／相關物件版本的重新確認若unsupported，保留有限receipt；下回相同選擇不再付費，角色仍可改方法或選原義。舊背景泡茶的探測在clone上完成，未選實際舊執行時不得留下準備／pending supplies或物件。容量、取捨與回退見[需求工程基線](../design/life-needs-baseline.md)。
- 初始fixture玩家預算為300次／200000 tokens，僅用於有限本地機制驗證，不是產品預設，也沒有修改伺服器期限、固定租約、全域成本或正式玩家預算。

## 真Chromium的既有畫面

執行 `node tooling/verification/browser-life-integration.mjs`（依既有browser runtime提供本地Chromium與字型）。24次使用原「下一回合」按鈕；110次安靜跨日等待使用同一公開API。沒有測試專用UI。全程3735世界分鐘、相同30NPC+3裁定fixture；0付費呼叫。

從原分析入口核對暫停、攝取、復工、睡眠與三日證據；重載後API／畫面一致，原ID再送不增加派送。已視覺檢查中文、數值、活動狀態與來源可讀。

- [機械證據與時間點](assets/life-integration/evidence.json)
- [暫停工作與來源](assets/life-integration/paused-work.png)、[實際攝取](assets/life-integration/actual-ingestion.png)、[自主復工](assets/life-integration/resumed-work.png)
- [超過90分鐘仍睡眠](assets/life-integration/cross-ninety-sleep.png)
- [三日已形成的事件習慣](assets/life-integration/established-event-habit.png)、[獨立主觀偏好](assets/life-integration/subjective-preference.png)

## 待後續授權的有限正式驗收

正式驗收僅依同一份[有限正式驗收操作流程](autonomous-life-live-runbook.md)執行，含部署／模型／隔離起點、calls／tokens／完整回合上界、停止與原ID恢復，以及跨日證據的「已觀察到／未到達／技術中斷無法判定」分類。本報告不另訂一組上限。

該流程及其工程建議值仍待另行部署與付費授權，本輪未啟用。真模型未在固定輪數內飲食、入睡或表達偏好，不直接當引擎失敗；本地fixture也不證明真實性格、正式生活循環或泡茶loop全部修復。#85／#104／#106保持獨立驗收。
