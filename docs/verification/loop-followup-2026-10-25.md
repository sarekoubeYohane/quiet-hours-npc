# 30 分鐘有限續測：再次在末次裁定逾時（2026-10-25）

**沒有跑滿 30 分鐘；第一個新回合約兩分鐘就因技術故障停止。泡茶 loop 仍為證據不足。** 店主再次在候選世界完成新杯與茶飲，但第八次 Vera 裁定讀取回覆本文逾時，整輪回復。不能把候選成果當成已提交，也不能以本次中斷判為 loop 重現／未重現。

## 授權、版本與起點

使用者在[上次報告](pr162-live-observation-2026-10-24.md)後要求「測出現在 loop，或跑30分鐘」。本批次沿原停止紀律，先告知按最多30分鐘實際觀察、6次 advance／48次派送／已知500,000 tokens，先到者停止；任何技術故障立即保留原操作並停，不自動新建 operationId 重抽。

- main／正式站 UI 為 `4c54b15`，台北2026-10-24 23:47建置，包含 #162。相較上次部署 b97edf2 只有 #164 報告，產品程式相同。
- 原 daily-life-v1 隔離場景 version=330、minute=750、turn=2，累計603 calls。與上次終點逐欄比對，僅 aiUsage 的小時窗口更新，故事欄位相同。
- 原杯 active、revision=2、contents=tea、clean=yes、holder=null；allowedTo 包含 owner／vera。沒有獨立茶飲，routineRules=[]。原日常世界仍暫存，未切換／推進它。
- Key配置仍存在；瀏覽器初始規則試玩，正常選回 OpenAI 直連 gpt-6-luna。裁定維持 OpenAI gpt-6.1-sol；真實 request 再核對。沒有換模型、改參數或讀出憑證。
- 玩家有效每小時240 calls／5,000,000 tokens，起點小時用量為0。本輪第一回合預留最多8 calls，250,000 tokens作保守估算，不是硬上限或精確預約。沒有修改帳戶預算。
- 世界起點與上次原逾時實錄先私有保存、JSON解析及重讀驗證後才開始；全部原件不進公開 repo。原世界暫存快照仍未另行匯出／還原測試。
- 全程手動、自動暫停。沒有重建、清空記憶、加介入、改物件／規則／提示／Playbook或直接改 DB。

## 唯一新 advance 與派送

operationId：`1792903190773:9d9c6634-d693-4389-b32d-3a483aff124d`。API requestId：`f586ff56-766a-4abe-8534-325341a003e1`。台北2026-10-25 12:39:55.248受理。

| 順序 | 角色／task | 模型（皆OpenAI） | input／output | 取得的結果 |
| --- | --- | --- | --- | --- |
| 1 | Kris／NPC | gpt-6-luna | 9,839／389 | propose acceptance-meal，合法候選 |
| 2 | Kris／裁定 | gpt-6.1-sol | 16,310／259 | denied，未新增餐點成果 |
| 3 | 店主／NPC | gpt-6-luna | 9,193／406 | propose acceptance-tea-kit，替自己泡茶 |
| 4 | 店主／裁定 | gpt-6.1-sol | 18,120／1,198 | accepted、v2日常核准，候選世界形成另一杯茶 |
| 5 | Cass／NPC | gpt-6-luna | 9,422／358 | propose acceptance-meal，合法候選 |
| 6 | Cass／裁定 | gpt-6.1-sol | 16,303／219 | denied，未新增餐點成果 |
| 7 | Vera／NPC | gpt-6-luna | 9,190／346 | propose acceptance-tea-kit，合法候選 |
| 8 | Vera／裁定 | gpt-6.1-sol | 未知／未知 | HTTP headers=200；response body未收到，timeout |

第八次 requestId：`1792903190773:9d9c6634-d693-4389-b32d-3a483aff124d:vera:adjudication:76bdb3f4-36ee-4d7e-8a0b-08f4a3fcf7ce`。

原操作定案HTTP502、outcome=rolled-back、lastKnownStage=world-commit-confirmed；failure.kind=timeout、stage=response-body。沒有可解析的最後裁定原文或usage，不捏造其答案或說它否決泡茶。

version 330→331，但minute=750／turn=2。比較完整起終 world，僅排除aiUsage後深度相等；物件、時間、記憶、認知、意圖、事件、活動、供應及規則沒有半提交。沿原ID GET重讀確認，不重送POST、不恢復、不建立第二個新操作。

## A．記憶選留與安全診斷

四筆 NPC 真實 request 都使用 strict json_schema；逐筆取 user message 的 self.shortTerm 配對集合，與 memorySelections.items.anyOf 的 id／version成對限制一致。四份收到的選留全部在該次集合中，全部進入 npc-parsed。

| 派送／角色 | 當次短期筆數 | 實際選留數 | 檢查 |
| --- | ---: | ---: | --- |
| 1 Kris | 8 | 2 | 合法 |
| 3 店主 | 7 | 3 | 合法 |
| 5 Cass | 9 | 2 | 合法 |
| 7 Vera | 8 | 2 | 合法 |

店主的模型、system message、response_format、max_completion_tokens及reasoning_effort與上次實際request一致；本次未改提示以誘導行為。輸入已包含原杯tea狀態，以及兩筆前次本人行動回饋，不可說回饋完全未傳入。

本輪沒有非法NPC候選，故新版候選安全原因分類沒有自然觸發；不能用timeout當記憶引用錯誤。選留成功持久化也未驗證，因整輪回復。只有四筆合法候選，不宣稱 #85 已修復或所有模式都已驗收。

## B．泡茶候選、成果及loop界線

店主派送3是用共用茶具替自己泡一杯普通茶；沒有再混入對Vera的grant。其意圖仍是make-tea，interpretation說明已同意Vera用杯、現在替自己泡茶並等待物件結果。這是模型自述，不是已提交事實。

派送4裁定 accepted，routine.version=2、operation=tea，tea timing原值15分鐘。explanation說明核准不等於完成、須檢查空杯／原料／供應與權限，不能覆蓋既有茶；這同樣是裁定自述。機械紀錄起點no-matching-rule，因原場景沒有保存規則，不能描述為已確認規則無故沒有重用。

後續機械世界快照及店主npc-feedback則證明本回合候選世界已實際形成：
- 另一只日常茶杯：active、holder=owner、contents=tea。
- 獨立一份茶：active、holder=owner、state.beverage=tea、state.vessel指向新日常茶杯。
- 本人回饋表示日常茶杯有茶、取得一份茶、這次嘗試已結束。
- 原驗收杯仍tea、holder=null；沒有把原借杯授權／原杯tea狀態單獨當成本次新成果。

這表示本次方法在候選世界取得進展，不能只因再次提「泡茶」就判相同不可行方法loop。然而整輪後來回復，新杯、茶、日常規則及完成回饋都沒有進入保存世界；店主完成後下一次真正派送沒有發生，成果後正常決策數為0。

**B結論：證據不足。** 無法觀察到完整已提交成果後最多三次正常決策，不能稱有限條件下未重現。Kris／Cass重提餐點亦只是同批次中的其他候選，不據此推論所有NPC有泛loop。不要求店主喝茶、每回合換行動或放棄意圖。

## 反覆截斷的可定位技術線索

| 面向 | 10/24原操作（#164報告） | 10/25本次 |
| --- | --- | --- |
| 故障位置 | 第8次Vera裁定 | 第8次Vera裁定 |
| failure stage | dispatch，未見headers | response-body，HTTP200 headers已保存 |
| 受理至round-failure | 約110.4秒 | 110.617秒 |
| 末次派送至失敗 | 約9.6秒 | 10.790秒 |
| 新茶杯／茶飲 | 候選世界有、整輪回復 | 候選世界有、整輪回復 |
| 真正故事推進 | 0 | 0 |

本次第八次派送在受理後99.827秒才開始。現行route建立120秒租約，模型signal採min(25秒, 租約截止前10秒的剩餘時間)，所以末次裁定並非必然有完整25秒。兩次都在約110秒截斷，**支持「整輪剩餘工作期限限制了末次等待」的推論**；不能只說供應商每次用了25秒或斷言供應商本身是唯一根因。沒有取得Cloudflare階段日誌或供應商後台紀錄，亦未測延長租約／改派送架構的效果。

這是目前阻擋行為觀察的具體技術問題，不是NPC主觀反覆泡茶的證明。反覆開新回合會再次付費重做前面候選，沒有增加成果後樣本，因此按原停止規則結束，不為湊滿30分鐘無界恢復。

## 用量與私有證據

- 本輪1次advance、8次實際派送（4NPC／4裁定）、0次故事成功推進；沒有跑滿30分鐘。
- 已知input=88,377、output=3,175，合計**91,552 tokens**；cached input包含在input中，不重複加算。第8次用量未知，不當零。
- 累計603→611 calls；input 7,617,437→7,705,814；output 174,558→177,733；未知用量calls 4→5。
- 終點version=331、minute=750、turn=2，原隔離世界／原日常世界保留，自動暫停。
- 完整私有起點、前次追溯、本次定案實錄及終點另存；JSON、zip完整性與SHA-256重讀通過。trace gaps=[]、redacted=false，不代表最後回覆存在；第8次無body及usage仍保持未知。
- 公開repo只存本去識別化摘要，不含完整transcript、記憶正文、operationScope、Key、Cookie或認證header；停止畫面不進公開repo。

## 下一個最小可反證步驟

先分析兩次原操作的派送／checkpoint時序與剩餘期限，必要時對照安全stage logs，釐清為何四角色八次派送無法在整輪工作窗口完成，再決定獨立技術修正；本輪不改產品、模型、期限或規則。

技術阻擋處理後沿原故事重測，先取得真正提交的茶杯／茶飲與回饋，再觀察店主後續正常決策。不要清空歷史、把候選世界成果灌回世界、換模型或用「不要重複」提醒繞過。本輪未建立修正票、未關閉#85、未合併或部署。

文件驗證：沿repository diagnosing-bugs／pr遮蔽及證據分級；核對main變更、真實request配對範圍、派送用量加總、完整故事回復、原ID GET重讀、私有包重讀及Markdown相對連結。只新增報告，沒有重跑產品測試，不把過往fixture算成本輪行為通過。
