# #174 真實需求後果本地驗證

工程基線、kind限制及舊規則相容見 [需求基線](../design/life-needs-baseline.md)。本紀錄的「真實」指真正應用效果／提交／SQLite，模型回覆全部為明示fixture；沒有付費呼叫或正式世界操作。

## 證據

- RED：新增 `actual ingestion...` API案例，原程式拒絕 `ingest`，回合502且沒有需求或物件成果。
- GREEN：`node tests/run-activities.mjs tests/life-needs-api.test.cjs` 共10項。含四項不同時間數值、主觀文字投影、重新評估可continue、同級不重派、原ID重送、攝取餐點、同一杯茶／杯子連續性、需求再增加、v3跨物件重用、逐段清醒休息、中斷與初值100先合成再截斷。
- 整輪故障：前角色真正攝取後，後角色格式失敗，需求、消耗、時間一起回復；3次已知用量保留，原ID不重派。保存衝突亦回復，否決及不存在份量不恢復需求。
- 與物件形成、通用日常、活動生命週期回歸合計60項通過；`tsc --noEmit --incremental false` 通過，修改檔eslint通過。
- 真Chromium：`source <task-context>/browser-env.sh` 後 `node tooling/verification/browser-life-needs.mjs`，既有下一回合按鈕→API→SQLite→分析入口，驗證餐點消耗／飢餓降低、觀察者數值與本人感受分離、重載數值不變、重送不重複、兩段休息只恢復實際分鐘。2 NPC + 1裁定fixture，0付費呼叫。[機械證據](assets/life-needs/evidence.json)、[需求與前後變化畫面](assets/life-needs/needs-panel.png)、[逐段休息畫面](assets/life-needs/rest-panel.png)。已視覺檢查中文、換行與數值可讀。

## 審查與界線

需求寫入只由需求模組處理，舊consume及舊規則不偷偷升格為已確認營養；ingest是單一消耗效果擴充，不能先恢復後再驗物件。v3 routine將同一效果綁當前物件，繼續沿原版本／份量／容器驗證。時間profile按kind限制，休息不減睡眠需求；不按動詞猜攝取或偏好。

已知有限語義：物件份量沿既有正整數加單位；半份fixture用 `1 half-serving`，不是浮點0.5。精密熱量、個體醫學生理差異不在範圍。需求歷史僅最近32筆，UI最近5筆；不宣稱永久完整追溯。舊活動無profile不補造恢復。睡眠與跨日整合由#177/#181接續；以上不能證明真實模型會自主飲食、形成生活習慣或泡茶loop完全修復。
