# #210 跨角色需求閉環驗證

這是固定模型回覆的程式能力驗收。所有模型 transport 都是本機 fixture，沒有外網模型或付費呼叫；不能以此宣稱 NPC 自主推進需求已改善。真實行為留待 #211。

`tests/demand-integration-api.test.cjs` 透過真正世界 API、SQLite 保存重讀及攔截的實際 request/messages 驗證；`browser-demand-integration-210.mjs` 沿真正 WorldApp 的既有下一回合、分析與活動畫面驗證同兩條路。共享情境保留 seed 店主 personality／goal／intents（初始0服務意圖），公開 JSON、hash 及使用限制見[契約](../design/demand-integration.md)。

| #205 能力 | 本次組合證據與前置驗收 |
| --- | --- |
| 1 既有未知物件 | #207 object-observation API 已驗物件感知、SQLite、下一輪輸入；本票不重做物件發現引擎 |
| 2 移動不全知 | #207 原驗收；本票客人不取得店主私有來源 ID／權利欄位 |
| 3 自然查找 | explore 真正 propose → 主持 → discover → 來源感知，不轉貼主持 explanation |
| 4 有界主持資訊 | #208 bounded authority／omitted 與隱藏資訊反例；本票隱藏 A/B 仍得到相同下一輪可知輸入 |
| 5 普通背景確認 | explore search 當次只有已成立來源，尚無原料／餐點 |
| 6 來源身份及續用 | 保存後 prepare 用同來源，sequence 續增；舊世界缺 scope 不補造 |
| 7 有限範圍隔離 | 耗盡舊餐、有限香料及合法麵包並存；同 kind 的無關耗盡單份另有組合反例 |
| 8 明確世界限制 | 換名特殊配料仍 blocked，不復活耗盡來源或舊成品；整體限制沿明示 finiteScope |
| 9 發現不等於取得 | source-only → 後輪 materialize → 原料 consumed／meal active → 下一輪實際可見 |
| 10 未做／拒絕／無收穫 | 承諾、wait、客人拒絕／改選與 drop 不產生成果；無線索沿 #208，不變永久缺貨 |
| 11 角色及隱藏隔離 | 實際 request/messages 的隱藏 A/B 深度相等、無 private marker；客人無店主來源權利 |
| 12 重試不重骰 | #208 method API 驗同 A／同義0骰、主持確認 B 新機會1骰；本票原操作重送0派送 |
| 13 跨輪活動 | 15+60分鐘配方遭客人真正 say 中斷，pause／resume／abandon；已生成原料保留，成果不提前 |
| 14 原子性／重送 | 保存 CAS、保存前失敗、較後客人錯誤、租約失效均回復本輪 grant，先前餐點保留；用量保留、重送0派送 |
| 15 舊世界／容量 | GET 不寫回舊 scope／receipt；不同帳號隔離；trace／輸入／receipt／短期記憶有量測及上限斷言，極限拒絕沿 #207–#209 |
| 16 選擇及成本 | direct 不搜索；wait／refuse／drop／pause 仍合法；回合預算在派送前阻止後續裁定，無額外反思鏈 |
| 17 完整需求故事 | explore 9輪、direct 8輪：真正對話／確認／準備／授權／客人 consent／交付／雙方下一輪輸入，API 與 UI 兩路 |

首條完整故事即 green，沒有為建立 red 而改產品。後續來源範圍組合反例在舊產品確實 red：既有普通 pantry 加無關耗盡單份同 kind 奶酪後，第二次準備沒有新增餐點（1≠2）；沿 #206／#209 共同範圍修補再驗。其他 fault 分支從真正 API 已提交的 prepared checkpoint 分叉，保留單調時鐘，沒有偽造需求記憶。

正常 API explore 為18 NPC＋4裁定＋1感知骰；direct 為16 NPC＋3裁定＋0骰。Fixture 每呼叫報告30 input／10 output tokens，帳本呼叫數及 token 數逐項核對；這不是正式模型價格或真實費用。包含世界 reload、search／最後操作同 ID 重送都不新增派送。失敗回合依真實已派送數記帳，不把 rollback 當免費。

UI 共17輪，explore／direct 同上述計數；1280px 與390px檢查無水平溢出、0 pageerror。grant 圖明確無 consent，交付後餐點仍 active、owner 不變，客人沒有被代吃。

- [來源成立但沒有實物](assets/demand-integration-210/explore-source-only.png)
- [店主接到客人真正回答](assets/demand-integration-210/explore-offer-observation.png)
- [準備成果](assets/demand-integration-210/explore-prepared.png)
- [grant 尚無客人 consent](assets/demand-integration-210/explore-grant-without-consent.png)
- [後續真正交付](assets/demand-integration-210/explore-delivered.png)
- [直接準備路徑](assets/demand-integration-210/direct-prepared.png)
- [手機分析](assets/demand-integration-210/explore-mobile-analysis.png)
- [最終 UI 計數／容量／hash](assets/demand-integration-210/evidence.json)

API 隱藏對照代表量測為 request107423 bytes、NPC input15015 bytes、trace369241 bytes、world59018 bytes、receipts3591 bytes、2規則、短期經歷最大7821 bytes／17條；UI各輪量測見 evidence.json。沒有無界需求佇列或額外保存索引。未推進正式世界、部署、合併 main 或修改／關閉 #205。

最終合入來源範圍修補 `82a3b3c` 後，本票11條加來源、普通背景、方法機會及方法承接相關局部 **50/50** 通過，0失敗／略過／取消；包含上述同 kind 奶酪反例 red→green。真WorldApp雙路也在該產品重跑通過，主要來源／授權／直接準備／手機圖已目視。Typecheck、變更檔 ESLint、diffcheck 通過。完整 repository 回歸由整合分支最終統一執行，不把本票局部稱為全repo驗證。

## Standards

固定基準 `9bd0e56`，產品及整合證據版 `69dc75e`。獨立審查對照 AGENTS、docs/agents、相關 ADR／工程契約與 Fowler smell baseline；覆核完整差異，另檢查後段 finiteScope、#210 測試、UI 與公開情境。最終 **0 findings**，未發現硬標準違反或具實際風險的 smell。

## Spec

同一固定差異對照 #205–#211，最終 **0 新 findings**。先前重現的舊感知 receipt、長物件 ID、預檢誤擲、候選改組重擲、有效方法新機會、普通來源重複／權利及有限範圍問題均已修正，反例與證據保留於各票紀錄。#210 的對話、感知、保存、下一次實際請求、雙方同意、交付及故障回復均走正式程式。

兩軸最終皆為0，沒有剩餘最高級別 finding。這是程式能力及工程證據審查；#211 真實模型尚未執行，不能解讀為自主需求行為已改善。固定公開情境與離線材料見 [#211 預註冊及缺項](autonomous-demand-211-preregistration.md)，產品 pin 保留 `69dc75e`；後續材料／驗證紀錄提交不改寫該產品版本。

## 最終整合檢查

固定產品 `69dc75e` 的完整 `pnpm test`：世界 **859/859**、認證 **32/32**、Workers／D1／migration **10/10**，全部0失敗／取消／略過。外網封鎖保留；Workers 本機服務在具本機啟動權限的環境執行。另 #211 離線材料測試 **4/4** 通過，並已納入預設測試清單；材料檢查正常 exit0，`--paid-ready` 正確 exit2拒絕，沒有模型派送。

最終整合的 `pnpm typecheck`、`pnpm build`、`git diff --check` 通過；`pnpm lint` 為0 errors、4個既有 warnings（既有圖片及 effect dependency）。沒有為本工作擴修無關 UI 警告。原始完整本機執行紀錄保留在 ignored `outputs/`，公開報告只含合成場景證據及量測，沒有私人世界、API Key 或歷史原件。

#211 的固定情境與產品版本已封存，但缺少可核對的適用付費授權餘額、官方價格／呼叫前預留、可用 live credential/runtime 及真正連續多輪執行器。它仍是未執行、未通過的行為驗收；本次0真實模型呼叫，不能由上述程式測試或合法拒絕推論自主需求行為已解決。
