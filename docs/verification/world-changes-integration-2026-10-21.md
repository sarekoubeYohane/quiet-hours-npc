# 通用世界變更整合驗證

本報告記錄 #136、#145 及 #137–#139、#146–#151 的本機交付。模型 transport、受控 D20 與故障邊界明示為 fixture；WorldApp、世界 GET／POST、活動、效果、提交、重送及 SQLite 保存重讀走正式程式。沒有呼叫正式付費模型、修改正式世界、合併 PR 或部署。fixture 通過不等於正式站驗收。

## 最終整合結果

獨立 code review 修正後，本機固定點 `44f9a8a9aeddac7d809653e04c1a1cc2d601be9c`／tree `0932b5ca2852a6f7e2c2f6b376f3b37709bbfda8` 經 root 重跑 **560/560**（518 API、32 auth、10 Workers/D1），零 fail／skip；typecheck、lint（零 error、4個既有 warning）、production build及產物環境檢查通過。此後變更只有交付文件；遠端交付 commit/tree 對照見整合 PR。

初審 Standards 1／Spec 2全部修復，原兩位 reviewer 獨立複審均零未解決、零新增；focused API 各36/36與32/32。[雙軸審查](world-changes-code-review-2026-10-21.md)與[修正紅綠證據](world-changes-review-fixes-2026-10-21.md)記錄完整理由。

root 先重跑七組 v3 UI（19 NPC／9裁定）與既有綜合 UI（62 NPC／6裁定），修正後再重跑有限材料、材料主題、同杯循環、餐點分拆四組（11 NPC／6裁定）。所有新 UI 走真 WorldApp／世界 API／SQLite 保存重讀、原 ID 重送及 reload；重送零新增派送。修正實作者另重跑自然及未許可物理等六組，詳見修正證據。這些是 fixture 結果，不能當成正式模型或正式站驗收。

## 整合基線

- 最新核對 main：`5e172d51f999f28ca17f5a207fb109d3f8c305e2`。
- PR #144 仍為 open、未合併；本分支承接其 head `53f42981fb0666bc85bb91fedc963dc666eb4645` 的杯子能力、有界 v2 操作證據與安全失敗回饋。這些成果不能宣稱已在 main。
- 已批准設計：`de0d7d0376f30e2fa656e8280094703f0992ac3b`；保留其 ADR、訪談、詞彙與拆票文件，再以工程實作補充具體限制。
- #137–#139 尚無已合併成果，按依賴在本輪實作；#146 後再完成 #147／#148／#149，#148 後完成 #150，全部前置完成才實作 #151。沒有平行裁定契約或重開工作票。
- #143 已取得的正式站餐點、首次泡茶、保存與原 ID 重送結論保持有效；不追補當時未保存的證據，不自行關閉 #104、#106。

## 具體重現與各票證據

| 工作 | 先重現及修正後的範圍 | 可重跑證據 |
| --- | --- | --- |
| #137 | 集中效果及日常候選契約，保留舊匯出與舊語義；schema、提示與解析共用上限 | [契約集中化](adjudication-contract-137-2026-10-21.md) |
| #138 | 純解析不收可變世界；世界綁定及 audit 只在執行邊界發生 | [純候選解析](adjudication-contract-138-2026-10-21.md) |
| #139 | 自由／日常活動接相同解析、階段及五段分支，未選成果不提交 | [正式流程整合](adjudication-contract-139-2026-10-21.md) |
| #146 | 新物件狀態原先 502，修正後保存、重載、原 ID 重送及失敗消耗通過；較大靜態 schema 導致診斷 JSON 截斷另先重現再修正 | [新物件狀態](world-object-146-2026-10-21.md) |
| #147 | 物主許可與物理可達分開；保存意外損毀、擅用／拿取及事前許可，不補造 grant／consent | [物理後果](world-physical-147-2026-10-21.md) |
| #148 | 同一事件承接物件、環境及身體；可知鍵投影、外在線索、中斷、位移攜物及自主界線 | [環境與身體](world-external-148-2026-10-21.md) |
| #149 | 形成候選、來源證據、隱藏狀態及身份碰撞各先 red；形成／分拆保存來源、份量、權利及重要差異，不複製原物 | [形成與細分](world-formation-149-2026-10-21.md) |
| #150 | 自然安排從真提交起算、到期先行、條件破壞永久失效；保存接續、曝光與本次操作證據接通 | [自然變化](world-natural-150-2026-10-21.md)／[時間取捨](../design/natural-changes-time.md) |
| #151 | 明示通用v3方法、當前subset／來源／份量綁定、fresh成果、自然重用及實際派送分開計數 | [通用日常程序](world-routine-151-2026-10-21.md) |

## 階段性完整回歸

整合至 #149 的本機 `a161bce`／tree `9ec89a4bd81d8c79598878df7fd9cfe8d6ae72ae` 經 root 實際執行 `pnpm test`：**517/517**（475 activities/API、32 auth、10 Workers/D1），零 fail／skip。遠端 `a390da179f2526e584141fb080ad8b99899641b1` 保存相同 tree。這是階段證據，最終 #150／#151 與獨立 review 的結果另補，不能以此宣稱全部交付。

各票 Chromium JSON 分開記錄實際 NPC／裁定派送，不能把總模型數當裁定次數。原 ID 重送須零新增派送、效果及骰子。截圖由真 WorldApp 取得；root 另檢查分拆、外在狀態畫面的中文、份量、來源及角色資訊呈現。

#150 實作者最終完整回歸530/530，相關聯合回歸70/70；root 在整合後獨立重跑自然變化真 UI，8次推進、8 NPC／5裁定、8份保存快照及原ID零新增派送全部通過。root 額外檢查條件失效畫面，確認當前狀態恢復為熱並不把舊安排改回 pending。這些是自然變化的階段證據，最終整合仍須包含 #151。

## 使用者情境對照

下列 API 測試透過真正世界 route 及 SQLite；UI runner 使用真 WorldApp。測試的受控回覆與骰子不代表正式 NPC 一定會選相同行動。

| 情境 | API／保存回歸 | UI／證據 |
| --- | --- | --- |
| 餐點取得、消耗、形成與分拆 | `world-formation-api`、`live-acceptance-cup-api` | `browser149`、`browser-live-gaps`；[形成證據](world-formation-149-2026-10-21.md) |
| 自主授權後借杯、攜帶、洗淨、歸還 | `live-acceptance-cup-api`、既有活動／授權測試 | `browser-live-gaps`；[既有整合基線證據](live-gaps-browser-2026-10-21.md) |
| 同杯喝洗再泡、不同合理新狀態 | `world-changes-object-api` 保留原杯；v3同杯循環及fresh形成由 `routine-world-changes-api` 覆蓋 | `browser151-world` cafe 的 v3 喝茶→洗杯→同杯再泡、fresh形成及保存；`browser146`、既有v2證據另保留 |
| 意外損毀、未經許可拿取／擅用／損壞 | `world-physical-api`、`world-formation-api` | `browser147`、`browser149`；所有者與許可事實保持 |
| 同事件物件／環境／身體影響、自主及資訊隔離 | `world-external-api`、`npc-failure-feedback-api` | `browser148`；public／subject／hidden 由公開 API 核對下一個角色輸入 |
| 自然變化、永久失效及保存接續 | `natural-changes-api` | `browser-natural-changes`；[時間順序](../design/natural-changes-time.md) |
| 日常重用與真正例外、裁定／NPC分開計數 | 既有 v1/v2 回歸保持；新 v3 由 `routine-world-changes-api` 的多scope／新方法／中文證據覆蓋 | `browser128`／`browser129` 舊程序證據；`browser151`／`browser151-world` 新v3證據獨立計數 |
| 跨回合、五段、失敗消耗、部分成果及中斷 | `activity-results-api`、`routine-results-api`、新物件／形成／自然測試 | `browser127` 七組、`browser129` 六組；[前置整合證據](adjudication-contract-139-2026-10-21.md) |
| 重載、原 ID、保存前失敗、提交不明、版本／租約衝突 | 新效果各票 API 與既有原子提交回歸 | `browser-live-gaps` 保存前後故障及原 ID；各新 UI runner 重載及重送 |
| 舊世界、舊規則、帳號隔離及敏感資料 | 既有 auth／Workers/D1、新效果舊資料回歸、`operation-evidence-api` | 讀取不補歷史；證據遮蔽、截斷與舊 receipt 不追補由公開 API 核對 |

每個簡稱對應 `tests/<名稱>.test.cjs` 或 `tooling/verification/<runner>.mjs`。完整執行方式見 [verification README](../../tooling/verification/README.md)，單獨 API runner 必須保留 `NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs"`。

## 正式站界線

[部署後有界驗收流程](world-changes-live-runbook.md) 包含版本、現有預算、24 個新回合／30 分鐘上限及立即停止條件。正式驗收需要後續授權與實際部署；未到達的自主行為記為未到達，不強制成功、不改模型行動，也不在正式站注入故障。

新資料寫入後的舊 binary 回退並非安全的雙向門：舊讀取器不理解逐鍵曝光、形成份量或後續的新程序／自然安排。向前讀取舊世界保持相容；回退須保留新讀取與執行語義，不能丟欄位、重置或補造歷史。

#151實作者完整回歸552/552（510 activities/API、32 auth、10 Workers/D1），22項新增正式API／SQLite案例全部通過；typecheck、production build通過，lint無error、沿既有4個warning。七組真UI共19 NPC／9裁定，逐組原ID重送0新增；[完整證據與限制](world-routine-151-2026-10-21.md)。此為實作者階段證據；修正及最終整合結果見本報告前段。
