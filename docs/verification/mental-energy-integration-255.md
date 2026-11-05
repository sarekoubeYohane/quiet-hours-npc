# #255 精神電量工程整合：#257–#262

本次交付已確認行為的工程契約。整合 PR [#265](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/265) 供合入 main 前 review；各工作票已合入 integration 並更新驗證紀錄。

| 工作票 | PR | 驗證報告 |
|---|---|---|
| #257 狀態、時間與觀察 | [#264](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/264) | [mental-energy-257](mental-energy-257.md) |
| #258 感受來源與自然情緒 | [#266](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/266) | [mental-experiences-258](mental-experiences-258.md) |
| #259 真實成果與追求 | [#268](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/268) | [mental-results-259](mental-results-259.md) |
| #260 實際活動與向後修正 | [#269](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/269) | [mental-process-260](mental-process-260.md) |
| #261 自主調節交易 | [#267](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/267) | [emotion-regulation-261](emotion-regulation-261.md) |
| #262 接管感受與用量 | [#270](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/270) | [controlled-feelings-262](controlled-feelings-262.md) |

## 範圍與依賴

沒有正式精神電量政策預設。所有初值、上限、門檻、自然速度、調節費、感受幅度、seed、slot 與倍率均由測試明示；只允許 local/test 使用測試政策，production 連已保存的 test policy 也拒絕推進。普通 GET 保持可讀且不啟用。

#256 的產品政策仍未完成，本次依指示暫緩承接，沒有重開 grill 或採用未定案建角草案。結案前重讀最新 #256 正文：另一段設計已啟動並確認容量可因人而異，但具體來源、範圍、缺省與其餘數值仍未定案；未因此解除工程阻擋。原生 blocked_by 關係顯示 #263 仍由 #256 阻擋（#259、#261、#262 已關閉）。本次不開始 #263，也不關閉 #255；沒有部署或付費真實模型呼叫。

## 驗收對照

下表是隔離測試參數下的機械證據，並非正式產品啟用或真實心理語義驗收。API 測試走實際世界 GET／POST／介入／控制、序列化及 SQLite 保存重讀；六份 browser runner 以真正 WorldApp 核對畫面與操作。模型 transport、時鐘及亂數來源受控，活動、來源驗證、效果與保存流程為實際應用。

| #255 驗收 | 已核對證據 |
|---|---|
| T1 狀態分離與邊界 | #257/#258/#261：心情與權威電量獨立，零／上限／截斷不儲存欠額或溢出，足額才調節。 |
| T2 時間與睡眠 | #257/#260：已發生世界時間、真正睡眠與清醒休息、自然醒／刺激較早端點、GET／reload 不扣電；原身體需求不被暫停。 |
| T3 主觀差異與自主 | #258/#259/#260：方向和等級由合法感受提供，成敗不等於滿足，不強制結束活動或修改追求；提案不預付。 |
| T4 過程與向後修正 | #260：投入、partial slot、暫停／恢復／中斷／換活動；修正只向後，純續做不派模型。 |
| T5 來源去重 | #258/#259/#262：事件／感知／短長記憶／追求別名共根，改寫／合併／手機同版本不重領；真實新結果可另計。 |
| T6 負面負擔 | #258/#260：一次負面來源一次結算，低落文字不重複收費；實際負面過程按投入計入，來源可區分。 |
| T7 調節交易 | #261：明示選擇且足額、固定成本、完整選擇含 recall 最多一次，續做與接管不自動扣款。 |
| T8 自然反應與調節 | #258/#261：零電可自然改善、調節不自補、獨立新收入仍成立；真正模型請求有優先考慮且自主保留規則。 |
| T9 控制權 | #262：pending／active／waiting／traveling／arrival／instant；不改玩家行動、不生自主習慣，預算及用量沿既有契約。 |
| T10 輸入與畫面 | 六份 runner：真實 provider request 無精確電量／policy／骰果／觀察者資料；WorldApp 顯示原因與獨立心情，接管及重載一致。 |
| T11 隨機一致性 | #260：持續 seed stream、角色自己的活動序列、保存 slot 樣本與有效分鐘；同角色／多角色整段及分段一致，重送不重抽。 |
| T12 故障原子性 | 各票：較後角色／非法來源／過期 lease／CAS／保存前後及 uncertain commit，世界效果共同回復、已知／未知／late 用量保留，原 ID 不重派。 |
| T13 舊世界與入口 | #257/#258/#262：缺欄位可讀、明示成功寫入才啟用、不補歷史，不繞舊版本 gate；所有 mood writer 承接新契約，不綁角色名或職業。 |
| T14 證據界線 | #261/#262：核對實際請求的「至少小幅緩和／能承受就停止／優先考慮但自主」規則，記錄前後情緒與理由；受控回答只能證明承接與記帳。 |

## 實際畫面與模型用量

六次 runner 均已執行並目視，證據 PNG／JSON 隨各票報告保存。全部使用受控回覆，真實付費呼叫為 0。

| runner | 模型用途與 calls | input / output tokens |
|---|---|---|
| browser-mental-energy.mjs | NPC 1 | 30 / 10 |
| browser-mental-experiences.mjs | NPC 2 | 60 / 20 |
| browser-mental-results.mjs | NPC 2、judge 1 | 90 / 30 |
| browser-mental-process.mjs | NPC 2 | 60 / 20 |
| browser-emotion-regulation.mjs | NPC 2 | 60 / 20 |
| browser-controlled-feelings.mjs | NPC 3、feelings 2 | 150 / 50 |

最後一條完整流程包含自主取得新滿足→付費調節→UI 接管並指定 rest→實際續做→取得新經歷→原 ID 回放→SQLite 重讀／UI reload→交還控制。純續做及回放不新增 feelings 呼叫；玩家活動、既有調節紀錄及習慣沒有被感受評估取代。

## 最終檢查

驗證的最終程式提交為 `46f15f4`；以下報告文件另行提交。所有模型測試在 no-network 邊界內；Worker／browser 僅開本機 loopback。

| 檢查 | 結果 |
|---|---|
| 首輪 `pnpm test` 活動組（`7181ede`） | 1,158 項：1,155 pass、3 fail；沒有 skip。三個失敗均為共用 fixture 對 inactive wire 多注入 `feelingUpdates`，該輪在活動組後停止。 |
| 三項失敗的修正與回歸 | `a79e20d` 修 fixture 而不放寬正式 schema，新增 inactive 三欄不注入與 active 實際 schema 驗證。7 套 **88/88 pass**；最終整合提交再執行同範圍 **88/88 pass**。新增案例也涵蓋在此數字內。 |
| 歷史追加重構 | `a7573c0` 統一容量 32 與 dropped；5 套 **75/75 pass**，最終 88 項也包含其 writer 行為。 |
| 其餘完整測試組（`46f15f4`） | auth **37/37**、templates **6/6**、Worker／migration／material **15/15**、pinned pursuit runner **21/21**；合計 **79/79 pass**，0 fail／skip。 |
| typecheck | `pnpm typecheck` PASS。 |
| lint | `pnpm lint` 0 errors、4 個既有 warnings（character-profile img、pixel-world 兩處 img、world-app effect dependency），與 main 基線相同。 |
| test build | `pnpm build:test` PASS。 |
| production build | `pnpm build:production` PASS；沒有執行部署。 |
| 工作樹 | `git diff --check` PASS；六個 implementer 工作樹確認 clean 且 HEAD 已為整合祖先後清理，保留 integration。原工作區未提交檔案未編輯／stash／reset。 |

完整活動組只跑一輪；修正測試 fixture 與等價歷史重構後，重跑受影響範圍及先前尚未執行的全部組別，未再重跑其餘未改動活動案例。保留這個執行界線，不能將第一輪 `pnpm test` 的 exit 1 改記為成功。

日誌在本次 session 的 `/tmp/quiet-hours-255-context/`：`final-tests.log`（首輪）、`final-method-assessment-red.log`、`final-method-wire-green.log`、`final-history-refactor-tests.log`、`final-corrections.log`、`final-remaining.log`、`final-typecheck.log`、`final-lint.log`、`final-build-test.log`、`final-build-production.log`。各票 TDD／UI 證據另見上表連結。

## Standards

最終整合 review 0 硬性違規；一項歷史容量重複 heuristic 由同一 implementer 收斂，兩軸窄覆核後剩餘 0 findings。fixture 相容性修正亦經兩軸窄覆核，沒有放寬 production 契約。

## Spec

最終整合 review 0 findings（#257–#262 範圍）。#256／#263 與真實模型語義品質保留未完成；不能因這份機械對照表而關閉 #255。
