# 日常背景查找與來源續用（#209）

查找沿既有一次 v3 日常核准，`supply` binding 宣告 `background`，階段 `discover.supplyIds` 引用該角色。不需先 materialize；原有已知方法仍可直接準備，沒有新增 NPC 任務、意圖或額外付費鏈。

`bindRoles` 在本回合候選副本建立 pending 來源；查找用途的新來源 `knownTo=[]`。正式 phase 必須具有 server 編譯的 `routineSourceScope`、相符 v3 rule／角色／來源、當前場所 operator 與權利，且沒有本範圍的有限來源／具體物件限制，才能在 `applyEffects` 的原子副本解除 pending。一般模型不能提供這個內部 scope，單次自由裁定仍不能發現任意 pending 供應。

已知普通方法也能直接接觸已成立而尚未知悉 ID 的適用普通來源：只在 server routineSourceScope、當前 operator、當地可見、原權利、canonical用途／主題及有限約束成立時，可綁定其身份；真正 materialize 階段才承接接觸、knownTo 與實物。compile／候選綁定不提前知情。一般自由 materialize 未知來源仍拒絕，不讓漏看查找反而迫使已知方法先搜索成功。

既有日常分析／驗收畫面對 pending 背景明示「背景待活動確認，尚未成立」，正式成立後才顯示已確認背景。

成立來源與角色察覺分開：解除 pending 不扣 remaining、不增 sequence、不生成持有物件；正式提交後沿 #207／#208 感知，只有清晰觀察增加 knownTo。compile、分支／續做／恢復驗證使用 validateOnly，不感知或擲骰。相同來源、位置、感知條件的既有結果重用，漏看後換措辭也不重擲。

新建來源保存 optional `background.scope={version:1,role,subject}`，值來自已驗證 binding 的 sourceRole／sourceSubject，不另建分類或 canonical 索引。canonical 重用依區域、種類及已確認來源用途／主題識別既存適用來源，再核對方法明示必要的 state subset；顯示名稱、新 rule ID 及 prospective background 空白初態不產生新來源。保留來源真實的額外狀態、份量、曝光與 consumable，不用新方法的背景描述重寫來源。無權使用既有適用來源時拒絕另造自己所有的替代供應。無指定時合法有限來源先於普通背景，選定時先經時間可用性、必要狀態、知情及權利篩選；明確 target 保持優先，不讓耗盡／未到時／無權來源誤擋另一合法來源。多位 operator 先選已有許可來源；只有同一無權來源時，查找可辨識它但不授予許可，也不另造自己所有的替代供應。既有 owner／allowedTo／sequence 保持。

未知但適用的有限來源是世界權威限制，查找確認不以 knownTo 過濾它；可以發現該來源，但不補回耗盡，也不把其私有原因送入 NPC。真正 phase 再驗當前 operator 與本範圍限制，較晚出現的限制阻止待確認背景。已知／未知的已成立普通來源實際 materialize 也使用相同有限約束檢查；自由候選可由來源 optional scope 核對，舊來源缺 scope 時僅在已綁方法可知真正範圍，不猜全場所限制。

單份原料適合某方法，不表示它限制所有同類普通來源。跨來源原料限制須由權威來源明示 optional `finiteScope={version:1,coverage:'region'|'location',subject}`；subject 最多128 UTF-8 bytes並與方法 sourceSubject 相同。region 限原區域，location 沿既有地圖映射涵蓋同場所各區域，不能換到儲藏室繞過。單份 label、kind、material／category 均不推定整體範圍，即使名稱或 category 同為「食材」。來源自身 remaining、明確 target 及既有 finiteSourceBindings 仍生效，不藉缺 metadata 復活既有耗盡來源。舊世界讀取不補 finiteScope；未知版本、額外欄位或格式無效於使用時技術失敗並回復，不能轉成缺貨經歷。

同場所遠端明示 location 限制以主持專用 `finiteRestrictions` 提供 type／id／region／scope／readOnly，不帶遠端 label、狀態、私有理由或其他庫存，也不允許遠端取得／查探。最多32筆，與當地物品／供應共用64KiB上限，explorationScope.restrictionsOmitted 明示省略並影響 complete；正式執行仍檢查完整世界。NPC 投影保持不含此權威 metadata。

普通與特殊、大量的合理性由同次世界裁定依場所背景確認，程式維持既有 quantity／資料上限及權利，不增加物品白名單或額外分類模型。程式不能證明所有語義裁定必然正確；拒絕案例與格式無效候選分別驗證，不將替身拒絕宣稱為所有真實模型必然拒絕。

取消只刪未提交 pending；已成立背景、已生成物件及消耗後果保持。角色改選方法時，binding 在 prepared clone 先依舊計畫 future 供應引用執行相同 pending 清理，再綁定新方法；正式 startActivity 仍負責原活動取消，避免候選引用即將刪除的來源。world／rule／source 與感知隨原回合提交，保存或較後角色失敗全部回復，原 ID 重送不生成或重派。

保存有界：最多512來源，沿既有32日常規則、8程序×8角色及 #207／#208 receipt／記憶上限；來源新增只增加固定有界 scope，沒有無界旁表。第513來源在候選階段拒絕並回復。舊來源缺 scope 保留原資料，先沿既有可知來源 pool 綁定，舊 rule／label fallback 不升格語義；GET 不補 scope、來源、歷史或模型。無 SQL migration；寫入新語義後回退須保留理解新讀寫器，不丟欄位或重置。

驗收見 [#209 API／SQLite／真正輸入與既有 UI 證據](../verification/routine-discovery-209-2026-10-28.md)。
