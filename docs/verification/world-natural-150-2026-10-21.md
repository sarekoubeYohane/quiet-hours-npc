# #150 已確認自然變化：本機 fixture 驗證

日期：2026-10-21。基線沿整合分支的 #137–#149；PR #144 尚未合併的杯子／有界 v2 證據及失敗回饋成果透過本輪既有整合基線承接，不宣稱在 main。這是可丟棄本機世界、模型 transport／受控骰子 fixture，並非正式站驗收，沒有呼叫付費模型或修改正式世界。

## 完成範圍

`schedule-natural@1` 從集中 schema／純解析接到正式自由活動、五段結果、活動階段、世界推進、SQLite 保存重讀及真 WorldApp 分析區。只保存選中且正式提交的安排；自然執行不新增模型或骰子。自然以 world 來源產生可知外在線索，原安排者僅保留診斷來源。沿 #148 的逐鍵曝光與 #149 的通用容器連續性共用 writer／驗證，不固定 drink／wash 後果、不放寬舊全域 validator。

上限為15–1440分鐘（15分鐘倍數）、每安排1–4條件／1–4受限狀態效果、32待執行及64已結算。只支援狀態後果，不遞迴排程、形成／分拆或心理核心。相同 target 可分開不同鍵的曝光效果，同鍵重複寫入明拒。結算細節按結算時刻保留，`naturalChangesDropped` 明示淘汰數；操作證據只投影該操作新增／變更的安排，防止舊項擠掉本次結果，仍沿64 KiB與敏感遮蔽邊界。

`committedAt` 是正式批次保存的世界分鐘，`dueAt=committedAt+delayMinutes`；`nominalDueAt` 另記來源活動進展時間。既有 due 自然先於 NPC slots，新安排不回溯觸發。每批次及 native 移動後檢查必要state／位置／持有、future from；曾提交破壞即永久失效，無關revision不失效，同批未提交暫態不算歷史。詳見[工程時間決策](../design/natural-changes-time.md)。

## 重現與回歸

先以正式 API 建立冷卻案例：未支援效果時502；新增正式接線後，保存熱狀態及安排，下一次推進從 SQLite 重讀到期執行。另先重現缺自然UI、舊pending完成卻被已滿結算歷史淘汰、同身體不同曝光被過度拒絕、環境曝光證據缺值及舊安排擠占本次證據，各修正後有回歸斷言。

13項自然 API 測試涵蓋：

- 15／30分鐘實際提交錨點、模型15分鐘不改寫，原ID重送不重派送。
- 同點due自然先於活動階段，必要條件失效中斷；純續做沒有額外NPC或裁定。
- state from／位置／持有條件破壞後恢復不復活；無關新鍵保留安排。
- 環境乾燥、身體隱藏復原及同身體多曝光，原安排者離場沒有遠端私有資訊或虛構決策。
- 保存前失敗、保存後提交不明、版本／租約衝突與同ID重送，結果及派送數保持。
- 32 pending容量拒絕原子回退，滿表新安排及結算的本次證據仍可見；64結算保留與淘汰數。
- 舊世界不補安排，缺曝光、遞迴、非法延遲／版本／心理鍵、矛盾from及重複鍵原子拒絕。
- 明示D20 fixture五段結果：只有選中成功分支排程，部分成果／失敗保持原義；重送及自然執行不再擲骰。

自然／形成／外在狀態／活動結果／有界操作證據聯合回歸70/70；全套530/530（活動488、帳號32、Workers10）。`pnpm typecheck`、本輪變更ESLint與`git diff --check`通過。

```sh
pnpm test
pnpm typecheck
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-activities.mjs tests/natural-changes-api.test.cjs tests/world-formation-api.test.cjs tests/world-external-api.test.cjs tests/activity-results-api.test.cjs tests/operation-evidence-api.test.cjs
node tooling/verification/browser-natural-changes.mjs
```

瀏覽器命令沿 verification README 的 Playwright／Chromium 環境設定；模型 transport 被明示替換，活動、效果、提交、重載與重送均走應用正式流程。

## 真 UI／API／SQLite 證據

[browser-evidence.json](assets/natural-changes/browser-evidence.json) 含8個篩選快照及SQLite／API／操作證據比對：8次UI推進、NPC決策8次、裁定5次。UI原ID重送與重載不增加呼叫。手動檢視截圖文字／狀態可讀：

- [冷卻待執行](assets/natural-changes/pending-cooling.png)
- [到期已冷卻](assets/natural-changes/cooling-executed.png)
- [環境已乾燥](assets/natural-changes/environment-dried.png)
- [條件破壞後恢復，安排仍失效](assets/natural-changes/condition-invalidated.png)

## 限制與部署後有界驗收

自然只隨世界推進，不是離線計時器；30分鐘一次與15分鐘兩次保留原有不同決策機會，不承諾連續物理模擬。舊已保存安排按原狀態續接，已結算不重跑／重問；舊世界、歷史及操作證據不追補。正式模型合理性、正式部署環境與全部 #151 日常重用驗收仍由整合交付獨立記錄，本文件不關閉 #104／#106。

部署後沿[有界流程](world-changes-live-runbook.md)確認部署版本與剩餘預算，再於正常入口建立的獨立驗收場景執行：最多4次15分鐘推進確認冷卻／乾燥與條件失效，至多2次新裁定、4次NPC決策；這是整體24回合內的子上限，不是額外預算。每次比對世界API保存重讀及原ID證據；正式站不要求直接存取SQLite。不得在既有正式世界補造安排。遇身份重複、資訊洩漏、錯誤重送、超預算或提交不明立即停止，保留操作ID與版本，不盲目重發新ID。
