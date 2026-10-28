# 物品主動觀察工程契約（#207）

`observe/sight` 沿原活動、`probeCurrent → resolvePerception → Observation → addExperience` 發現既有未知物品。移動不枚舉物品。物件必須 active、區域可見，持有人若存在須仍在相同區域；門、區域遮擋及睡眠沿既有規則。物品候選仍需 focused D20，失敗沒有身份，mixed 只有模糊線索；不以世界真相校正錯誤感知。

資訊欄位為向後相容的 optional `Observation.objectId` 及 `MemorySource.object`，各物件 ID 最多 128 UTF-8 bytes，與人物 `source/person` 分開。清晰物品感知才將角色加入既有 `knownTo`；不變更 revision、holder、owner、allowedTo、數量或 lifecycle。公開狀態沿既有 knownWorldObjects 投影，hidden 不曝光。下一次正常決策沿原有 memory/objects 輸入，沒有新模型鏈。

共用入口：`objectObservationCandidates(world, character, ids?)` 只讀世界，供裁定候選／clone 驗證；`discoverWorldObjects(world, character, event, ids)` 在真正活動提交後承接同一感知／經歷路徑，回傳 trace 並更新 event.perception。後者不是直接授予知情，仍可能沒有察覺。呼叫者不能把 clone 中的結果當成已提交角色資料。

相同角色、位置、方法、相關候選與能力條件沿 `probeResults`／`perceptionTrials` 重用，不因發現後 knownTo 改變而開新機會；同條件重試不新增 observation，也不從 trace 復活已遺忘的經歷。角色實際改變位置仍形成新機會。新觀察有活動事件 ID、來源、時點與清晰度，分析畫面顯示物件來源。

保存沿既有 JSON、短期 80 筆／64 KiB／總量限制及世界最多 512 個具體物件；物品列表超限明確拒絕，不截斷執行依據。物品探查新機會達 2048 probe receipts，或保存的兩類 receipt 加本次候選估算超 1 MiB 時拋出 `PerceptionCapacityError`，沿整輪技術失敗回復，保留舊 receipt 而不淘汰重擲；新物件資訊不形成永久無界知識庫。容量錯誤不是世界缺貨或人物拒絕。舊世界缺欄位仍可讀，GET 不補造發現、不觸發模型；無 SQL migration。新資料寫入後回退需保留理解 objectId/object 的讀寫器，不可丟欄位或重置世界。

本票不新增容器、逐物遮蔽規則、供應探索或自由查找裁定；物品可察覺條件沿當前世界已保存的區域／持有／生命週期。後續 #208 使用同一入口接通裁定，本票不宣稱真實模型必然選擇觀察。

## #207 審查相容修正

原版人物／聲音 receipt 的候選 tuple 維持 `sense/kind/text/source/region`，只有資源候選才附加物件身份，不因升級插入空欄而重擲。觀察記憶 ID 沿事件／角色／索引維持有界，完整 objectId 仍留在來源；128-byte 物件身份不會膨脹成超長記憶身份。API 固定原版 receipt JSON（人物／聲音 × probe／trial）重讀0骰；128-byte物件可提交、SQLite重讀後進真正下一次 request/messages。兩反例先red後green；object／active／false perception回歸22/22通過。
