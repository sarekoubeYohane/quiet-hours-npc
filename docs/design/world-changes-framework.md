# 通用世界變更：工程契約及交付狀態

依 #145、ADR 0005，沿 #136 的集中裁定契約及既有活動引擎承接新後果。`world-effects.v4` 新增版本化 `change-state`，不改變舊 `state`、v1/v2 日常規則或已保存活動的原義。

## #146 已接通的物件狀態

物件 `change-state` 的封閉欄位為 `version:1`、`access:authorized|physical`、`target:{type:object,id}`、`expectedRevision`、`changes:[{key,from,value}]`、`exposure:public|hidden` 及 `reason`。`from:null` 表示原本不存在該鍵；字串表示當前必須仍等於該值。執行時仍檢查當前引用、active、知情、可見及本地；authorized 另驗持有與使用許可，physical 的邊界見 #147。每項效果只增加一次物件版本，不改身份、來源、歸屬或生命週期；理由留在觀察者操作證據。

共同限制位於 `adjudication-limits`：每項至多 4 個變化，單狀態袋至多 16 鍵、4096 UTF-8 bytes，key 至多 60 字、value 至多 100 字、理由至多 300 字。拒絕重複鍵、prototype 鍵及核心身份／位置／來源／數量／許可欄位。每次候選仍受 8192 字、4 效果、4 階段、5 結果分支與原有時間上限約束。類別是至多 60 字的非空簡單字串；`food`／`utensil` 既有意義保持，類別本身不授予食用等能力。

提示、schema、純候選解析使用同一限制。解析不接收可變世界；活動效果在副本驗證所有分支後，才沿既有 D20、階段、原子保存與重送執行。未選分支沒有狀態成果。新狀態可列入既有階段前提；舊前提的版本語義不被靜默改成弱比較。

一般世界的「日常規則與成果」顯示完整物件狀態及來源。新操作證據維持 64 KiB 與遮蔽界線，增加 `stateEntries` 與變更物件 `beforeObjects`；v3 巢狀形成／自然效果所需的投影深度由 v2 的 11 增至有界的 14，仍明示截短，不重寫舊 journal、不把裁定理由加入 NPC 敘述。

失敗診斷的 `inputProjection.version=1` 保留動態情境與契約版本，明示省略 repository 內的靜態規則／schema；不承諾在失敗快照重複保存完整 prompt。超界動態資料標為截短並維持合法 JSON，沿用既有 input 9000 字、candidate 8192 字與診斷整體 24000 字上限。

## 交付與相容狀態

#146–#151 已接通正式自由活動、通用日常程序、效果、保存及既有畫面；整合獨立review及正式站驗收另記。各票已驗證範圍及最終完整回歸以[整合報告](../verification/world-changes-integration-2026-10-21.md)為準，不能以單票通過宣稱正式站驗收。

相容策略是新增能力、保留舊資料；不自動重置、修改舊杯能力或補造歷史。舊 `state` 仍要求 `stateTransitions`。新裁定才能選擇新通用效果，不能把舊核准或舊證據推定為已確認的新狀態。

## #148 外在環境、身體與可知界線

`change-state` 的版本1外在目標增加 `environment`（已知本地區域）與 `body`（在場可接觸角色），仍沿既有效果、分支、活動及原子保存流程。新袋保存於 `scene.external[region]`／`character.physical`，缺欄位只是當前空袋、revision 0，讀取不建立變化或歷史。新鍵、數量及大小沿同一有界限制。

兩種目標均明示 `exposure`，每個寫入鍵保存其曝光：新版物件與環境為 public／hidden；身體為 public／subject／hidden。public 仍須有視覺機會；subject 是本人有依據可感到的身體狀況；hidden 僅供權威條件，連本人也不自動知悉。新版物件逐鍵 stateExposure 排除 hidden；舊物件缺元資料的舊 state 保留原可知原義。NPC 投影不含權威 revision、曝光表、裁定理由或隱藏值；缺曝光不默認公開。已確認外在線索經既有感知保存與關注規則處理，自己的可知身體影響為直接觸覺，不另擲感知骰。外在變化可觸發重新評估，但角色仍可自主續做。

`state-condition` 版本1按必要鍵值子集檢查，null 明示該鍵不存在；可選 guard 的 region:null／缺 guard 不檢查位置，holder.check=false 不檢查持有、true 的 null 表示要求無人持有。只在物件目標可檢查 holder。不以整體 revision 使無關狀態變化失效；各活動效果仍驗當前版本、位置及可達性。物理前提失效停止後續，早先已提交成果保留。

`displace-body` 版本1可按裁定把在場身體移至同場所、相鄰且通路開啟的區域，同步其所持活物件的區域／版本；不改物主、許可、同意、意願、情緒或後續選擇。不確定的角色／區域目標沿既有五段 D20；首次凍結相關外在鍵與位置，改措辭、DC 或附加未選分支引用不取得新骰。這不是角色表、HP 或戰鬥系統。

狀態合理性仍由模型確認；程式不聲稱能證明每個自然語言身體描述的物理正確性。原子批次只複製外在世界片段，保留活動模組持有的角色／計畫引用。觀察者有界證據記錄必要前後狀態與曝光，不回灌 NPC。
## 物主許可與物理後果（#147）

`physical` version 1 以受限操作表達已確認的拿取、放置、消耗、損毀與有限供應具體化；新外在狀態以 `change-state.access=physical` 表達。這個明示模式與舊授權模式共用效果執行、活動及提交責任，不把遊戲內許可當作帳號存取控制，也不改寫舊核准方法的範圍。所有權、持有及本人 grant／consent 保持不同事實；新方法不自動替 NPC 選擇違規。

物件保留最多 16 筆事前許可的物理操作歷史，淘汰詳細筆數另記，未獲許可累計不因淘汰或後來 grant 而歸零。history 不含裁定理由，不進 NPC 投影，讀取舊世界不補造歷史。物理可達、當前版本、有限供應、容器與成果時間仍受同一批次驗證。已交付及 fixture 界線見 [#147 驗證](../verification/world-physical-147-2026-10-21.md)；新日常適用範圍由 #151 接續。

## 形成、轉化與按需細分（#149）

新 `form`／`separate` 效果 version 1 沿原效果、結果分支、活動階段及整回合保存執行，沒有另一套活動引擎。`form` 在真正執行時驗證當前 active 來源、版本、可達性、份量及單位，從 1–8 個來源扣除明示用量並產生最多 4 個新身份。partition 必須承接一個完整原物，立即保存分拆與原物終止事實；沒有重要差異的成果先以一組份量追蹤，需個別操作時 `separate` 扣減整體並建立一個有直接來源的部分。原物、全部分拆成果及已食用部分不會同時保留為可用資源。

quantity 為至多 1,000,000 的正整數量與至多 24 字單位；當來源扣至零，按模型明示的 `disposition=consumed|destroyed` 保存終止事實，不以動作名稱或食物／器具分類猜測。每批總產量亦至多 1,000,000；全部輸入輸出同單位時，總產量不可大於消耗量。跨單位的合理轉化由天上意志確認，程式不聲稱驗證化學質量守恆。新的 kind 可以是一般材料、糕點或碎片；新成果的 `consumable` 明示布林優先，只有舊資料缺欄時才以原 food 語義相容。

`source` 舊欄保留，新的 `sources` 保存最多 8 筆直接來源及當時版本／用量／單位／所有者；多層形成沿來源身份鏈查回，沒有複製整棵歷史。新產物 id 必須未被任何現有物件、供應、角色、區域或場所使用，不能復活舊物或使目標引用含糊。新物件來源、份量及形成事實從真正操作起保存；舊物件在讀取時不補 quantity、sources 或歷史模型確認，首次新操作把缺量的舊單件按 `1 item` 承接。新日常程序須每次重綁當前來源及 fresh 產物身份，不能重播首次 ID。

共同來源權利以 `coOwners` 保存全部來源權利人；舊 `owner` 欄仍供主展示與相容，不代表其他權利人被抹掉。使用權採各來源既有權利集合交集，共有物件不能僅因 actor 等於主 owner 就繞過；單一角色的 grant 不會代其餘共有人同意。`access=physical` 承接可行情境下的未經許可分拆／轉化及他人持有來源，仍保留知情、可達、active、版本、數量及世界隔離；沿 #147 的共同有界 history 保存每個來源的事前許可及持有，成果／子件不複製來源自行經歷。

形成時不得先 consume 原料再拿已終止物作來源；由 form 自己扣除 active 原料。容器是飲品的關聯，不能當泡茶材料消耗；新 kind／新 beverage 仍驗證杯子與活動中飲品的身份、位置、持有及 contents 一致，同杯不能有重複活動中飲品。同批消耗舊飲品並形成有新來源的新飲品可以成立，不因同款新茶而誤判復活。

形成結果的每個新 state entry 必須明示 `exposure=public|hidden`，保存為物件的 `stateExposure`；既有權威條件與觀察者證據可查 hidden 狀態，NPC 投影沿 #148 共同界線移除它。separate 子件繼承原 stateExposure，materialize 繼承供應的 stateExposure，不能因新身份少了 metadata 而把 hidden 當作舊可公開資料。這不追補舊物件未知的曝光歷史；缺欄位的既有狀態維持原先可讀含義。


## #150 自然後續

`schedule-natural@1` 經集中契約、自由活動／結果分支／階段、世界時間、SQLite及分析UI接線，沿共用state writer與物件容器連續性檢查。已到期自然先於NPC slots，新安排從實際提交時間計時；相關條件或future from曾於已提交批次破壞就永久失效。具體上限、15／30分鐘取捨及資訊邊界見[時間語義](natural-changes-time.md)，證據見[#150驗證](../verification/world-natural-150-2026-10-21.md)。

## #151 明示通用日常程序

`routine.version=3` 在既有首次裁定確認明示methods、bindings、timings及共用效果stages／五段branches。角色種類object／supply／body／environment；選擇target／local／actor／here／linked，使用必要state subset、quantity、sourceRole及來源sourceSubject。新operation是模型確認的資料scope，不增加動作handler；既有角色／場所可提供genericMethods供新方法確認，原六項operation仍須完整涵蓋原offer。v1/v2保留原義，不以讀取自動升格。

物件／供應／身體身份及環境target是`$role`；移動目的地／guard.region可明示既有地圖固定區域，仍驗相鄰可達；expectedRevision／expectedRemaining只能0佔位。綁定先檢查當前可知本地、active、物理位置／持有、必要state及quantity，再於server-only階段metadata中保存物理連續性，正式執行前重新綁當前revision。模型不能提交此metadata。新form／separate成果每活動fresh ID，杯子只作vessel關聯，物主許可與physical承接各自明示。自然安排沿#150，不另加計時器。

背景須模型明示kind／consumable／quantity／initialState逐鍵exposure與material或equipment用途，material須有非空sourceSubject確認來源主題。已知有限同類及當前指定對象優先；木料等新kind沿同kind來源；food與既有food相容來源依該明示主題在已知label／material／category比對，茶原料與蛋糕等餐點分開，不沿legacy食材regex作永久內容邊界。object、supply與背景候選阻擋共用同一材料資格，無關蛋糕不會代替或阻擋茶葉。耗盡不改名補回，背景具體化與形成分開，先取得active原料再form扣量；hidden metadata保存到新物件。

方法最多8個核准別名，server另保留首次原長句（最多9），以有界精確content／purpose重用，不另問classifier。各scope保存不覆寫，相同方法多scope逐一驗當前條件。相關subset不符才走既有有界新裁定；已知有限障礙安全回饋而不反覆付費。已學方法投影不是當前可行性清單，hidden-only改變不藉方法有無洩漏；物件NPC投影不含權威revision。v3骰子足跡採相關state subset與物理／份量事實，無關改變不洗骰。

候選32KiB UTF-8、8程序×8角色、4階段／4效果／5分支沿共用上限；字數與位元組分開處理，並非保證所有最大值可同時塞入。舊候選8192字保持。僅routineOffer裁定的server輸出上限12000 tokens，NPC不變；已知累計budget非費用／token預約，單call超過剩餘門檻的幅度可能增加。receipt64KiB及診斷snapshot上限不增，程序完整shape與本次audit引用／變更規則優先保存，舊receipt不追補。工程及真UI證據見[#151驗證](../verification/world-routine-151-2026-10-21.md)。


### Review 修復：有限來源與背景邊界（2026-10-21）

背景 fallback 先檢查可知的同場所具體來源，包含 consumed、destroyed 與移至同場所其他區域的當前物件事實，不把來源已不 active 解讀為背景可重生。不同場所的無關既存物件不封鎖本地普通背景。

成功編譯且實際綁定有限來源、又有 background 替代選項時，引擎在該場所規則保存 server-only `finiteSourceBindings`：最多 8 個 operation、每項最多 8 個 role。這個約束防止該來源被帶往其他場所後原規則憑背景補回；可操作的新 active 來源仍優先，可正常恢復。它不複製物件歷史，不由讀取補建，不修改舊 receipt，也不把無關場所資料累積進規則。直接來自既有 renewable background 的物件不建立有限約束，因此同杯清洗後再次泡茶仍能重用。

模型 wire 不接受 `finiteSourceBindings`；NPC 輸入不含該內部欄位。新操作的有界 observer evidence 在 result.rules 投影該欄位，與被確認的 background/role 一起解釋為何不能 fallback，仍受既有 evidence 大小與遮蔽限制。材料主題延用既有 schema：legacy food 按 label/material/category 比對確認主題，新 kind 按確認類別匹配，沒有把通用世界種類重新限制為 food。
