# #198 替代食物來源：本地機械驗收

基準 `148a75d`（PR #182）；主規格 #186。這份驗收使用明示 NPC／裁定 transport fixture；不是 PR #184 當次輸入重播，也不證明真實模型已改選方法。公開報告沒有記錄完整的「另找食物／請店主另做」候選，因此不從當時末態補造它曾遭引擎否決。

## 定位與交付

`routineOffer` 的普通背景確認入口目前限場所操作者；這個限制不阻止訪客在一般裁定中使用自己可接觸的具體來源。v3 `material` 綁定會依來源主題分開舊 `food` 類別，明確有限供應優先；沒有既有相符具體來源時，操作者可在同一次正常裁定確認有界的新普通背景。

先在基準上建立已確認的 API → 實際活動／效果 → SQLite 重讀 → 下一次實際 request/messages 路徑，確認「舊簡餐耗盡、另一份麵粉做薄餅」已能成立。本切片因此補實際驗收與交接，不放寬全域來源驗證、不另加食物腳本，也不把 operator gate 當作所有角色的物理禁令。測試開發中的錯誤 fixture（generic 新方法誤帶第二個 operation、未標記 seed 自動加入店主的控制模式）已修正；它們不是產品 red→green 缺陷證據。

## 證據

`tests/alternative-food-api.test.cjs` 透過正式 `POST`／`GET`、真實形成／攝取及暫存 SQLite 保存，沒有 mock 內部 matcher 或效果執行器。`check=null` 不擲骰；每次 advance 明示 15 世界分鐘。所有模型回覆是固定替身，目的地額外核對 OpenAI transport，runner 預載 no-network，禁止未預期外網。

| 案例 | 可核對結果 |
| --- | --- |
| 已知 cafe 場所提出新方法 | 不虛構物件 ID；另確認麵粉背景，形成薄餅；舊簡餐 remaining 仍為 0 |
| 分開製作與攝取 | 製作後 hunger=20.75；下一次自主選擇攝取後=9.5；原料、成品及來源鏈沿 SQLite 重讀保存 |
| 下一次正常決策 | 實際 request/messages 含薄餅及攝取經歷；沒有新增摘要／探測模型 |
| 同操作重送 | 攝取原 ID 重送不重派、不重複消耗／恢復 |
| 同來源換名 | 已耗盡麵粉不能藉改 background label 再生成；無成品或需求恢復 |
| 訪客具體合法來源 | 非操作者的 routineOffer=null，仍可用獲准的真實麵粉經一般效果製作及攝取；沒有取得背景生成權 |
| 無條件訪客背景 | 偽造 ordinary background 核准回復整輪，沒有新供應、規則或成品；已派送用量保留、重送不重派 |
| 有條件物理操作 | 訪客取用真實有限麵粉，保留原物主與 allowedTo、未獲許可紀錄；不補 grant／consent，不把製作當作攝取 |
| 請另一人製作 | `say` 請求不替店主建立活動、同意或成品 |
| 保存衝突、後續角色錯誤 | 新背景、來源、成品、規則及需求共同回復；已知派送用量保留，原 ID 重送不再派送 |

本切片 8/8 測試通過；連同既有 sharing／world-programs 回歸 51/51 通過。新增測試與 fixture 的 ESLint、`git diff --check` 通過。兩軸整合 review 另由 #201 彙整。

正常新背景製作與後續單次攝取各使用一個既有裁定 slot（共 2 NPC＋2 裁定）；第三次 reflect 再使用 1 NPC。這不是已確認攝取方法的免費重用案例，免費範圍由 #199／#200 及 #201 組合驗收覆蓋。

重現命令：

```sh
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-activities.mjs tests/alternative-food-api.test.cjs tests/routine-sharing-api.test.cjs tests/routine-world-changes-api.test.cjs
```

## 相容及既有畫面

不新增保存欄位、不升格舊 v1/v2 規則、不推定舊物件的新營養效果。新方法沿既有 v3 單一 generic operation 範圍確認；製作與攝取仍是分開選擇，純請求不表示另一角色已接受。

已核對 `components/routine-status.tsx` 的既有來源／餘量／物主／形成來源／物理許可及日常方法顯示，以及 analysis 的 operation evidence／decision traces 接點。這是程式接點核對；整合分支的應用瀏覽器驗收由 #201 另列，這份文件不冒稱已執行瀏覽器或正式站觀察。

## 限制與後續觀察

基準已支援代表替代來源，不代表所有自然語言方法都能可靠解析，也不證明 NPC 一定會想到麵粉或主動吃飯。已知方法、可知結果與自主評估須與 #194／#195 合併後再跑跨回合組合。沒有提高任何模型、回合、預算或租約上限。

需另有明確有限真實模型授權及部署後，才能在固定版本、同一隔離故事觀察是否提出實質不同方法，記錄其當次輸入、選擇、裁定、效果及真正提交。未公開原件、未操作正式世界；#85／#104／#106 等歷史行為票不因本地 fixture 通過而結案。
