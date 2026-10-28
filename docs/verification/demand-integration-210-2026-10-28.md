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

API 隱藏對照代表量測為 request107215 bytes、NPC input15015 bytes、trace369025 bytes、world59018 bytes、receipts3591 bytes、2規則、短期經歷最大7821 bytes／17條；UI各輪量測見 evidence.json。沒有無界需求佇列或額外保存索引。未推進正式世界、部署、合併 main 或修改／關閉 #205。完整 repository 回歸由整合分支最終統一執行；本票局部結果另列後續最終驗證紀錄。
