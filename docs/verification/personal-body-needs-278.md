# #278 個人化身體需求、恢復與自然醒驗證

2026-11-09，本切片承接已關閉 #274 的 [已批准方案 C](../design/character-dice-energy-recommendation-2026-11-09.md) 與 ADR 0012；工程契約見 [個人化身體需求 v2](../design/personal-body-needs.md)。實作 `fbc47ce`，整合 #275／#276 的 `f7e31ff` 於 `f605e57`；其後同步 integration 的文件狀態，沒有重做已完成的精神電量測試政策。

驗收界面沿已批准的世界 API、真正活動／物件執行、實際 JSON／SQLite 保存重讀，以及既有 WorldApp 分析頁。沒有替身需求、活動或保存程式。控制初始時間、亂數來源與模型 transport；不呼叫付費模型、不部署、不推進正式世界。

## TDD 與 API

先以真實 POST `enable-body-needs` 為 tracer：未實作時返回400，實作後成功保存並可 GET／原ID重送驗證。下一個 tracer 先要求個人特性、五分鐘時段歷史與30分鐘／15+15同結果，原線性基線不符；加入政策積分後通過。再加入活動、睡眠、故障及相容反例逐步驗證，未以私有helper作測試入口。

可重跑：

```sh
node --import ./tooling/verification/no-network.mjs tests/run-activities.mjs tests/personal-needs-api.test.cjs
```

**12/12 通過**，涵蓋：

- 擁有者明示啟用、背景合法子集、source、一次建角、GET不變、SQLite重讀、原ID重播不重抽。
- 合法0.29／非法0.291與超精度初值、0/100邊界、感受與數字矛盾、既有需求不重設。
- 同一受控序列在 off-grid 482 開始、一次30與15+15（含同格切分、重讀）保持數值／精確積分／骰果一致。
- 兩名不同背景角色在同時段不同工作負荷，四需求分開；不要求耐力或d100資料。
- 真正消耗具體份量的攝取效果只執行一次，不再骰物件恢復；清醒休息只恢復疲勞，睡眠需求繼續增加。
- 已確認實睡按已發生恢復，飢渴繼續增加，角色輸入沒有精確需求、種子或特性內部資料。
- 新五分鐘API的睡眠從選擇邊界向後開始、首段零恢復；之後真正經過五分鐘才恢復，格末自然醒後自主選擇，沒有逐格模型鏈。
- 進行中的legacy睡眠保持原整套需求曲線及精確醒法，醒後至正常提交點仍用舊規則，再原子啟用。
- seed=0、非法特性、非有限units、無效已保存骰果／政策版本拒絕推進；CAS失敗、結果不明及原ID重播不留下半啟用或洗骰。
- 四項上下界與顯示精度；內部權威積分不由顯示取整回餵。

整合後另跑人物／五分鐘時間與舊需求／睡眠／精神四組回歸：

```sh
node --import ./tooling/verification/no-network.mjs tests/run-activities.mjs tests/personal-needs-api.test.cjs tests/five-minute-time-api.test.cjs tests/character-attributes-api.test.cjs tests/life-needs-api.test.cjs tests/sleep-api.test.cjs tests/mental-energy-api.test.cjs tests/mental-process-api.test.cjs tests/mental-experiences-api.test.cjs tests/emotion-regulation-api.test.cjs
```

**94/94 通過**（當時 #278 為11項；最後新增五分鐘實睡例單獨跑完整 #278 得12/12，不把重跑重複相加）。`npm run typecheck` 通過；`npm run lint` 無錯誤、4項既有warning；`git diff --check` 通過。真正身體恢復先確立自然醒點，再供精神時間讀取，既有精神睡眠／自然醒反例亦通過；精神的正式完整格／固定回電仍歸 #256／#263，不以本票代替。

## 既有畫面與 Chromium

```sh
node --import ./tooling/verification/no-network.mjs tooling/verification/browser-personal-needs.mjs
```

由 root 代跑：初版與合併 #275／#276 後均 PASS。合後採真正五分鐘 UI（1260→1265），確認背景特性、開局飢餓0、手動推進、分析頁數值與有限歷史、SQLite重載、原ID重送及穩定特性。root 已目視需求卡片可讀；無 pageerror，付費呼叫0。可重跑 runner 隨 repo 保存，證據為[合後需求卡片](assets/personal-needs-278/personal-needs.png)與[受控結果](assets/personal-needs-278/evidence.json)。畫面證據是本地受控流程，不代表正式站或真實模型自主生活品質。

尚待整個 integration 的獨立兩軸 code-review 與必要總回歸；本票不自行合併 main／部署／關閉其他票。
