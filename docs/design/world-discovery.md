# 自由查找與世界確認工程契約（#208）

自由 `propose` 可對已知場所／目前區域提出查找，不需 NPC 預先猜未知 ID。沿本次既有裁定與活動生命週期承接，沒有額外來源探測、反思、分類或修復模型；查找仍是角色選項，不是準備／服務的強制前置。

## 權威資料與資訊取得效果

`world-effects.v5` 擴充 `discover` v1：`{kind:'discover',version:1,region,objectIds:[],supplyIds:[]}`。每類至多 16 個不重複 ID；空陣列合法，表示本次執行查探但沒有新線索，不證明全場所不存在、不建立缺貨或心理狀態。純 explanation、空白 accepted、任意心理 patch 仍拒絕。舊效果與舊保存資料保持原義。

`authorityForProposal` 提供當前可見本地候選（包含角色未知者），保留主持需要的物件狀態、身份、來源、餘量、權利及供應資料，排除無關 physicalHistory／unpermitted 診斷、其他角色記憶及手機正文。優先本次指定身份與本人持有物件，各類最多 32 筆，物件／供應的最終序列化投影合計至多 64 KiB；供應 materializedObjectId 在量測之前形成。`explorationScope` 明示 region、兩類 omitted 數及 complete，省略集合不能當成完整庫存或執行副本。正式執行始終重驗完整當前世界。

效果要求 region 等於本人當前可見區域、物品 active 且具既有感知機會、供應已成立且到達 availableAt；本票拒絕 pending 供應。主持可看見相關真相，不表示 NPC 自動得到它。角色輸入仍沿 knownWorldObjects／knownWorldSupplies，沒有 authority 或世界私有資料。

## 驗證、提交、可知結果

純解析 → 完整世界 clone 驗證／階段預演 → 實際活動提交 → 私有 observe 事件 → `discoverWorldResources` → 既有感知／短期經歷 → SQLite → 下一正常決策。clone、分支預演、日常 compilePath、完成投入上限預檢均使用 validateOnly，不擲感知骰或帶回推測知情；活動真正到期才處理資訊取得。

物品共用 #207 路徑；供應新增 optional `Observation.supplyId`／`MemorySource.supply`，人物來源、物件來源與供應來源分開。清晰實際察覺才更新既有 knownTo；mixed／miss 不給 ID。找到不改 holder、owner、allowedTo、revision、餘量或生命週期，後輪 materialize／取得仍需原物理與權利驗證。角色只知供應身份，availability 仍 unknown，不直接得到庫存數字。觀察者分析顯示時點、來源與清晰程度，裁定理由不進記憶。

同接觸條件下，按資源身份、角色位置、感官及能力索引既有 probeResults；先重用舊結果，只將本次真正未判定的候選合為一次新感知機會。改查找用字、裁定把既有物品與另一來源改組，均不替原物品重擲，也不重寫舊經歷。原群組 receipt 可直接沿用，舊世界讀取不建立索引或補造歷史。索引共用既有 2048 筆／1 MiB 容量，包含群組與資源 receipt，預先保留本次保存空間；容量滿是技術失敗，保留舊結果而不淘汰重擲。一般人物／聲音原 tuple 與有界 observation ID 保持相容。

## 活動、來源引用與回退

discover 可放在正式完成／階段／結果分支。必要時間、未開始、完成、續做與中斷沿原生命週期。`effectReferenceIds`／`effectSupplyReferenceIds` 對 discover 收集兩類來源，用於完整驗證、分支選中來源、取消尚未執行 pending 資料及暫停引用；日常 symbolic schema／解析承接 objectIds／supplyIds 的 $role，拒絕歷史固定 ID。#209 再沿既有日常背景接通 pending 確認，沒有在本票預先核准。

無 SQL migration。舊世界缺 supplyId／supply 欄位可讀，GET 不觸發模型、不補知情、不從 trace 復活遺忘。所有世界與角色知情沿整輪版本／租約／原子保存；較後角色失敗、技術錯誤或保存衝突不留下發現。新 JSON 寫入後回退須保留理解 v5 與新來源欄位的讀寫器，不丟欄位、不重置世界。

## #208 補修：實質不同的已確認查找方法

先前 resource-probe.v1 只按資源與接觸條件保存，讓首次查找漏看後，即使世界確認真正不同的方法仍永久沿用舊失敗。現在沿既有主持 activityIdentity（最多64字語義 key）或已確認 routine operation（最多60字）形成 server-only `DiscoveryMethod {version:1,kind:'activity'|'routine',key}`。即時效果傳入原感知通道；需要查找的活動階段保存 optional discoveryMethod，經 SQLite 續做仍用同一方法。NPC 原句、方法自述、時點、無關世界版本與物件實例 ID 均不作方法身份，沒有新增模型服務。

有確認方法的群組及資源機會按 resource-probe.v2 保存；同方法別名／改字仍不重擲，主持確認不同方法才讓尚未察覺的來源有新機會，同次新候選維持群組一次 D20。新機會仍沿既有物理與權利邊界，不代表取得／授權。沒有方法身份的舊入口保留原 key；舊無方法資源／群組 receipt 在首次實際確認方法時保守沿用，僅該寫操作建立有界方法 alias，不從歷史猜方法、不在 GET 補資料。之後不同已確認方法可形成新機會。alias／v2／舊 receipt 共用2048筆、1MiB上限，滿時技術失敗，不淘汰舊結果洗骰。

相容與證據見[方法補修驗證](../verification/world-discovery-method-208-2026-10-28.md)。
