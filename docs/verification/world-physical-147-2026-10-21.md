# #147 物主許可與物理後果分離

整合基線為 `ef5af94`（含 #137–#139、#146，main `5e172d5`、尚未合併 PR #144 `53f4298` 與已批准設計 `de0d7d0`）。本票不宣稱 #144 已在 main，也不改寫其既有正式站結果。

## 已交付

- 新 `physical` version 1 封閉效果承接 `materialize / take / place / consume / destroy`；`change-state` version 1 明示 `access=authorized / physical`。新模式沿同一效果批次、活動、五段判定及保存流程執行，沒有逐動詞的活動處理器。
- 新物理模式不以 owner／allowedTo 或另一在場角色持有作為一律拒絕理由；仍驗證目前世界中的知情、可見、可達、活動生命週期、版本、有限供應、成果時間及容器連續性。`consume` 仍須可食用且已在行動者手上；未形成的 pending 供應不能被物理具體化。
- `take` 只改為行動者持有，`place` 只放在當前區域，不強迫第三者接收，不寫 grant／consent／owner。舊效果及日常 v1／v2 保留原授權適用範圍；新方法不被改成偷拿或借用。新日常綁定由 #151 承接。
- 物件保存最多 16 筆 `physicalHistory`，含行動者、時間、操作、事前許可與原持有人；另保存淘汰數及累計未獲許可次數。後來授權不會倒改當時的許可事實。舊物件讀取不追補，未選分支或失敗提交不留下歷史；形成物的來源鏈由 #149 承接。
- 既有分析畫面顯示必要狀態、來源及許可摘要；有界 receipt 保存新操作、理由和變更物件的權利前後資料。history 與理由不進 NPC 投影；NPC 接收外在結果，不被寫成物主自願交付、同意或原諒。

## 重現與驗證

先以 API 重現借來杯子的舊 `destroy` 僅因非 owner 被拒，SQLite 原物不變；新物理失敗分支和真正 WorldApp 下一回合均先取得 502「裁定效果格式無效」的 red，再完成相同入口的 green。舊 `destroy` 的相容回歸仍保留拒絕，新能力由明確新契約表達。

模型 transport、初始世界與受控 D20 都是 fixture；活動、效果、原操作重送、序列化及 SQLite 提交重讀走正式應用。沒有付費模型呼叫、正式世界操作、合併或部署。

```sh
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" \
node tests/run-activities.mjs tests/world-physical-api.test.cjs \
  tests/world-changes-object-api.test.cjs tests/free-actions-api.test.cjs \
  tests/npc-failure-feedback-api.test.cjs tests/live-acceptance-cup-api.test.cjs \
  tests/operation-evidence-api.test.cjs
```

本票 API 13 項，合併上述回歸 73 項。涵蓋借用失敗損毀、從他人手上未經許可拿取、擅用新狀態、有限餐點取得／食用、放置、不可達／未知／耗盡／過期版本／跨帳號對照、歷史淘汰、保存前失敗／提交後確認／版本及租約衝突、同 ID 重送、敏感候選拒絕與遮蔽。租約仍被其他工作持有時，原 ID 重送保持 409 等待且不重派送；沒有把未知提交偽裝為成功。

`browser147.mjs` 使用真實 WorldApp、世界 API 及 SQLite，三個回合實際驗證借用失敗損毀→從物主持有取杯→同杯未經許可狀態變化；3 NPC + 3 裁定 + 1 受控 D20，重載和 UI 原 ID 重送零新增派送／骰子。另重跑 `browser-live-gaps.mjs`，確認自主授權→借杯→攜帶→洗淨→歸還、餐點消耗及同杯喝洗重用仍保留 #144 的原義。

- [本票 UI／API／SQLite 篩選證據](assets/world-physical-147/evidence.json)
- [既有分析入口畫面](assets/world-physical-147/physical-consequences.png)

本票必要 typecheck、變更檔 ESLint 與 diff check 通過。整體雙軸獨立 review、全量回歸及最終整合證據由 #145 整合交付彙整；本文件不冒充正式站驗收。

## 邊界

後果合理性仍由天上意志判斷，程式不能證明全部自然語言物理敘述。history 細節超過上限會淘汰，但保留累計未獲許可次數及淘汰標示；64 KiB journal 證據亦可能截短／淘汰，不追補舊證據。環境／身體、形成分拆、自然變化及新日常規則各由 #148–#151 接入；本票沒有新增角色表、對抗骰、HP 或戰鬥系統。#104、#106 保持原狀。
