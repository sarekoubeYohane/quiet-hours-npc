# 世界變更框架 review 修復證據（2026-10-21）

修復基線：integration `9d0e4a8b05f6ef51bd238dad37a378ac87587a61`；交付前承接 integration 文件 tip `de39e65`；沿用 main `5e172d5` 與未合併 PR #144 `53f4298` 的既有整合成果。這份文件記錄修復 fixture 驗證，並非正式站驗收。未呼叫付費模型、未修改正式世界、未合併或部署。

## Red → green

| 發現 | 修復前正式 route/SQLite 重現 | 修復後 |
| --- | --- | --- |
| consume 提示只准 food | 實際派送 effectRules 與 consumable 新糕點不一致 | 明示 consumable 優先、缺欄位才 food fallback；pastry 真正 consume 保存重讀 |
| object 材料未檢查主題 | 第一份茶葉耗用後，蛋糕被茶飲方法消耗 | object、supply、背景既有來源與候選阻擋共用材料資格；蛋糕保留 |
| 有限具體來源憑背景復生 | 舊世界最後木料 consumed 後第二輪憑空形成第二零件 | 第一零件保持一份，無 background supply，2 NPC/1 裁定 |
| 無關實體阻擋合法背景 | 場上蛋糕阻擋首次確認的普通茶葉背景 | 蛋糕保持 active，合法茶葉背景形成茶飲，1 NPC/1 裁定 |
| physical materialize 佔位未正規化 | 合法 v3 expectedRemaining=0 在共用候選 parser 被拒絕 502 | 僅編譯時正規化與 expectedRevision 相同的 sentinel；全域 validator 不變，物主與許可不變，保存未許可事實 |

最初兩個 spec 缺陷使用 reviewer 原始 repro 實跑紅燈，再整合到 `tests/routine-world-changes-api.test.cjs`。consume 實際派送提示、移走至同場所與跨場所、無關蛋糕背景均先建立紅燈；所有活動、效果、提交與 SQLite 保存走正式流程。模型回覆、認證、時間、Workers bindings、SQLite adapter 為 fixture；沒有聲稱模型替身驗證了真模型推理。

額外驗證發現：上述無關蛋糕阻擋與 physical 佔位是本輪修復回歸擴展所發現，並非初審 reviewer 新增 finding。

## 有限來源的工程範圍

規則只在成功綁定當前有限來源後保存 `finiteSourceBindings`，每規則最多 8 operation × 8 role。移走或終結不會讓該 role 退回普通背景；新的真正 active 來源仍先被選用。回歸使用正式 form 把另一份樹枝形成新木料，原規則恢復製作：4 NPC/2 裁定（原規則一次，新來源形成一次），未多次核准日常規則。

沒有既有 role 約束時，可知同場所的當前具體物件事實（包含終結與別區域）仍優先；另一場所無關存量不封鎖本地普通背景。沒有掃描／補造舊歷史，沒有 GET migration，沒有追補舊證據。直接來自 renewable background 的物件不建立有限標記。角色私密資訊隔離及技術存取控制保持原契約。

標記是 server-only，模型 wire 注入測試拒絕 502，NPC 派送輸入沒有標記。observer 的新操作有界 evidence result.rules 可見 operation/roles，方便連同已確認的 background 判定 fallback 為何受限；不複製歷史理由。已知條件受阻沿既有 blocked audit 加上安全原因，UI 明示「規則受阻，無新增裁定」，公開 API 斷言 2 NPC/1 裁定，避免把未派送的阻擋顯示成付費例外。

## 驗證

`pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm build:production` 的最終結果見下方完成記錄。新增案例也保存 SQLite snapshot 對照，原有保存失敗、提交不明、版本與租約衝突、原 ID replay、五段結果、自然變化、資訊隔離和舊世界回歸一併執行。

真實 Chromium 應用 UI 新增 `BROWSER151_SCENARIO=finite-material` 與 `material-subject`：點下一回合兩次，GET 世界 API 與實際 SQLite 重讀，重送原 ID、reload，再檢查分析頁。前者 2 NPC/1 裁定，後者 2 NPC/2 裁定（無茶葉為真正新例外，不消耗蛋糕）。沿用 `tooling/verification/browser151-world.mjs`，網路以 `no-network.mjs` 封鎖，沒有外部模型呼叫。

部署後仍應按既有 `world-changes-live-runbook.md` 執行受預算與回合／時間限制的驗收；fixture 綠燈不等於正式站已驗收。


完成記錄：完整 `pnpm test` **560/560**（世界 API 518、auth 32、Workers/D1 10）；typecheck 0 error；lint 0 error、既有 4 warning；production build 通過。review 修復的 v3 API 為 30 項（原22＋8），沒有略過既存 regression。

UI 新增兩個案例及既有同杯循環／自然變化／未許可物理／餐點分拆重新執行；各次均有原 ID replay、reload 與 SQLite 對照。新增畫面與 JSON：

- [有限來源畫面](assets/world-routine-151/finite-material-world-method.png)、[狀態與呼叫數](assets/world-routine-151/finite-material-world-method.json)
- [材料主題畫面](assets/world-routine-151/material-subject-world-method.png)、[狀態與呼叫數](assets/world-routine-151/material-subject-world-method.json)

保留限制：語義主題與合理轉化仍由模型確認；引擎只驗證有界已保存事實，不建造完整物理模擬或掃描未保存歷史。只有 fixture 驗證；正式付費模型及部署後驗收仍依 runbook 另行授權執行。
