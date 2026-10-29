# #208 自由查找世界確認驗收（2026-10-28）

依 #205／#208，從整合 `4170ade` 承接 #207；已核對各票完整內容、空留言及 #203／#204 去重。產品 `03e2452`，修正 `642a0f2`，並合入 #207 相容修正。全程明示 NPC／裁定 transport fixture，外網只允許該替身攔截的模型端點；0 真實付費呼叫，未操作正式世界、部署或合併 main。

## 端到端與回歸

首個反例：角色向已知區域自然提案查看，原版主持只取得已知物品，無法查出 unknown-object；API 502 且無新知情。修正後 world authority 提供相關未知對象，候選 discover 通過純解析／完整世界驗證，活動實際提交後才沿感知建立可知結果，SQLite 重讀後下一真正 request/messages 含對象，沒有 hidden／權利名單／未核實理由。

本票 `tests/discovery-api.test.cjs` **13/13**；加 #207、主動感知與裁定故障 **33/33**。九檔相關 API／世界／長活動／裁定契約／操作證據回歸 **135/135**；`pnpm typecheck`、變更程式與測試 ESLint 通過。固定回覆證明程式能力，不能代表店主自主選擇改善。

- 查找既有未知物品及供應；發現不取得、不授權、不改餘量，下一輪合法 materialize 真正扣減 2→1 並形成持有物件。
- 權威資料只限當前可見本地，各類 32、最終物件／供應投影 64 KiB，明示 omitted／complete；關門藏物、私人內容及僅改裁定 explanation 的對照不洩漏到 NPC。
- 空 discover 是本次無新線索，denied／unsupported 與 explanation-only 空成功分開；不存在、遠端、pending、重複 ID 及心理 patch 候選拒絕，不建立永久缺貨。
- 30 分鐘查找首輪 0 感知骰／0 知情，到真正完成才新增線索；結果分支預演、投入上限與中斷不留下預先成果。原 ID 重送、同義重查及重讀不重複發現；供應與角色／帳號世界隔離。
- 私有 trace 對照實際主持 request、rawCandidate、已提交 knownTo、觀察來源及下一正常 NPC request。較後角色錯誤、provider 失敗及最終保存衝突保留已派送用量，回復物件／供應／記憶／receipt，不留未提交知識。

## 審查修正與保存邊界

兩個獨立反例皆先失敗再通過：

1. 同物品先單獨查探失敗，再與新供應併成另一候選組合，原群組 key 會替舊物重擲。新增 `resource-probe.v1` 身份／接觸條件索引，共用既有 probeResults；舊群組 receipt 直接 fallback，讀取不補索引。只新候選合為一次 D20，舊失敗不重擲、舊經歷不重寫，沒有每物件新增模型或固定行動。
2. `completion.maxMinutes=5`、裁定完成 15 分鐘的投入上限預檢，原 clone 仍會擲一次感知骰。該分支明示 validateOnly，現在 0 骰、0 觀察、0 知情。

索引與群組合用 2048 receipt／1 MiB，事前保留本次容量、滿時 fail closed，保留舊結果而不淘汰重擲。無 SQL migration；optional supplyId／來源 supply 與 v5 舊資料相容、GET 不補造歷史。既有故障診斷的大標籤 fixture 由 3000 倍改 1000 倍，使其仍落在新主持 64 KiB 上限內，繼續驗證既有 9 KiB failure receipt 的合法 JSON 截斷；超出主持容量的明示省略另有本票反例，未放寬產品限制。完整契約／回退見[工程契約](../design/world-discovery.md)。

## 既有 WorldApp

`tooling/verification/browser-discovery-208.mjs`：真 Edge／WorldApp、正式 API／SQLite，4 次既有「下一回合」按鈕；30 分鐘長查找 → 物件與供應察覺 → 後輪實際取用 → 下一真正輸入。**3 NPC＋2 裁定＋1 感知骰**，沒有新模型鏈。重載／讀取／原 ID 重送零派送，1280px／390px 無水平溢出，0 pageerror。已目視核對[感知來源](assets/discovery-208/search-perception.png)、[實際使用](assets/discovery-208/used-source.png)、[手機分析](assets/discovery-208/mobile-analysis.png)。

[機械量測](assets/discovery-208/evidence.json)：最大 NPC input 9,739 bytes、主持動態物件／供應投影 898 bytes、世界 19,523 bytes。這是有界 fixture 代表量測，不是任意世界大小保證。

本票只發現既有 nonpending 來源；查找確認未建檔普通背景由 #209 承接，跨角色服務由 #210 整合，真實自主行為由 #211 驗證。未以合法拒絕、口頭承諾或固定回覆宣稱整體行為已修好。
