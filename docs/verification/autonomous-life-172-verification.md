# 自主生活循環 #172–#181 整合驗證

本輪交付四需求、真實攝取／恢復、共同長活動、可恢復進度、實際睡眠、主觀喜好及兩類跨日習慣。所有產品變更在同一整合分支；前置切片完成並驗證後才供後續使用。沒有付費模型、正式世界操作、重置、合併或部署，不據此關閉 #85／#104／#106。

起點為最新 main `271495c`；完整讀取 #172–#181、Parent／Blocked by、留言（皆0）、AGENTS、Matt Pocock、GLOSSARY、相關 ADR 及適用 skills。#167／#169／#170／#171 已合併；沿用 #169 的400秒工作／430秒固定租約／445秒前端政策，沒有修改它們或既有預算政策。

## 工程基線

下列為實作前定稿及相容整合時明示的工程選值，不是使用者已確認的產品平衡值。理由、版本、上下界、啟用及回退細節見[工程契約](../design/autonomous-life.md)。

| 項目 | 基線 |
| --- | --- |
| 四需求 | 各0–100、兩位小數；飢餓／口渴／體力疲勞／睡眠需求分開。 |
| 首個成功advance啟用 | 原世界分鐘起算，20／20／15／20；GET不初始化、不回算歷史。 |
| 清醒每世界小時 | +3／+6／+1／+4；感受在40／65／85分級，降低後可再觸發，同級不反覆催促。 |
| 活動後果 | 世界確認有界ingest及profile；內建清醒休息體力淨-8/時、睡眠仍+4；內建工作體力淨+4/時。 |
| 睡眠 | 建議profile體力額外-6／睡眠額外-14，合計淨-5/-10；睡眠需求20自然醒。只算真睡分鐘；強烈／危險聽覺或直接身體刺激須先有感知機會。 |
| 長活動／暫停 | 15分鐘粒度、最多1440分鐘／四階段；API仍只15或30分鐘。每角一個暫停槽，原條件重驗，不自動復工、不重放骰子或效果。 |
| 有限證據 | 需求變化32；喜好16筆/16KiB、喜好變更24筆/16KiB；自主開始96筆/30日；時段習慣24、事件候選12、每關聯14組來源。 |
| 跨日形成 | 21日視窗，至少三世界日、強度≥0.2，七日半衰；同日重複不刷天數。 |
| 心理更新 | 記憶選留／整理、認知、喜好、事件候選共4項/8KiB；新增投影留在原88KiB心理輸入及208KiB記憶容量內。 |
| 舊規則 | 保留原義；角色可明示沿原slot再確認身體後果，另存v3範圍再免費重用；未確認receipt32筆防相同條件重費。 |

## 真正應用證據

模型transport、初始世界、時鐘、骰子、auth／Worker bindings為明示fixture；活動、效果、物件、需求、認知、序列化、SQLite及操作恢復為真正應用程式。最高seam為世界GET／POST與既有WorldApp Chromium，不新增測試專用UI。

同一世界透過134次advance推進3735世界分鐘（62小時15分）：需求升級自主暫停四小時工作→消耗同一餐點／飲水→兩小時清醒休息→自主復工保留唯一判定及已提交材料→真正睡眠跨90分鐘→自然醒→三世界日自主整理／休息、明示喜好與事件關聯。沒有在初始fixture後直接改分鐘、歷史或習慣。30次NPC＋3次裁定fixture，0付費呼叫。真Chromium以24次既有按鈕操作及110次相同公開API完成，重載與原ID重送一致。

- [完整跨日流程、故障、舊世界及畫面](autonomous-life-integration-181.md)
- [共同認知預算與真D20失敗仍喜歡](life-cognition-integration-181.md)
- [權威快照、私有追溯及自然醒預估](life-trace-181.md)
- [雙軸審查](autonomous-life-code-review.md)／[修復回歸](autonomous-life-review-fixes.md)

## #172 A1–A25 覆蓋

| 條件 | 本地機械證據 |
| --- | --- |
| A1 四狀態與時間 | `life-needs-api`、`sleep-api`：分開數值、讀取不推進、實際分鐘及上界。 |
| A2 真正需求循環 | `life-integration-api`、`life-needs-api`：攝取／休息降低，再隨真世界時間升高。 |
| A3 自主延後及差異 | `life-integration-api`四種同口渴選擇；意圖保持fixture自主排序。真實性格表現未驗。 |
| A4 感受與觸發 | `life-needs-api`：合併需求升級、續做不重開、同級／重載／重送、攝取後再升級；睡眠訊號分流。 |
| A5 資訊邊界 | needs／cognition／trace／world-external API：只本人感受／合法來源，拒絕身體狀態旁路喜好；無他人內情或trace灌入。 |
| A6 提案／開始／完成 | needs／long／sleep／integration API：否決、上限、部分階段與實際恢復分開。 |
| A7 消耗連續性 | needs及既有routine／formation API：同份與分拆部分、容器、餘量、耗盡與重送。 |
| A8 跨長睡眠 | sleep／integration API及Chromium105分鐘畫面、八小時睡眠、自然醒。 |
| A9 提前醒與部分恢復 | sleep API：強刺激／不可達／普通介入、兩小時與區段內六分鐘恢復，醒後另選。 |
| A10 其他長活動 | long API／Chromium：四小時開放閱讀與完成目標，重載、階段、到期語義。 |
| A11 暫停／恢復 | long／integration API：真正暫停→吃喝休息→自選resume，cursor／材料／骰子不重放。 |
| A12 世界不凍結 | long及review修復API：他人移物／身體變化、暫停期間自然變化、過期復工拒絕並保留進度。 |
| A13 放棄／不可暫停 | long及review修復API：放棄保留已提交，無效pause不凍結原活動已到期後果。 |
| A14 喜好維護 | preferences／cognition-integration API及Chromium：形成、修改、保留、撤回、來源／版本／容量。 |
| A15 喜好與成敗 | cognition-integration API：真正D20 failure及critical-failure後仍喜歡，同成果可不同評價，沒有額外擲骰。 |
| A16 時段／場所習慣 | habits／integration API：跨三日、明示活動身份、換杯／換措辭、淡化／有限來源。 |
| A17 事件候選 | habits／cognition／integration API：本人活動及感官來源、版本、時序／場所、跨日成熟與非法拒絕。 |
| A18 開始≠完成／喜歡 | habits API：否決／無來源純續做／重送不累積；首次真正開始但失敗仍有證據。 |
| A19 與意圖分離 | preferences／cognition／integration API：喜歡或有習慣仍可先工作／社交，程序不排序意圖。 |
| A20 重用／派送 | needs／integration／long／trace API：首次確認後免費新綁定、純進度零新增、原slot喜好／習慣／再確認。 |
| A21 整輪故障 | integration／cognition／sleep API：較後角色失敗，所有新故事狀態共同回復，早先成果和已知用量保留。 |
| A22 保存／原ID | 新API與既有operations／deadline／trace故障矩陣：CAS、租約、提交前／後、不明結果、原ID不重派。 |
| A23 舊世界／規則 | needs／preferences／habits／integration API：缺欄位GET不補造；舊consume原義、明示再確認、獨立v3範圍重用。 |
| A24 既有UI | 各切片Chromium＋同一跨日WorldApp：需求／感受、進度、喜好來源、習慣證據、重載、390px。 |
| A25 交付界線 | 固定版本測試、雙軸審查、GLOSSARY／ADR／設計及本紀錄；正式部分僅runbook。 |

上述「通過」只涵蓋受控機械路徑。真實模型是否自然形成生活循環、選留偏好及跨日習慣，全部仍待另行授權的正式驗收，不用fixture替代。

## 最終固定版本檢查

產品程式固定提交 `fd8b422811becb21d8318f97173546ba715a6983`，於獨立checkout執行，不與合併中的檔案混用。

| 檢查 | 結果 |
| --- | --- |
| `pnpm test` | **716/716**：世界／活動／UI／API674、登入／Key32、實際workerd／migration10；失敗0、跳過0、取消0。 |
| `pnpm typecheck` | 通過。 |
| 49個變更程式檔ESLint | 0 errors、1項既有 `world-app.tsx` 的 `useEffect` 缺 `act` dependency warning；該effect未改動。 |
| `pnpm build:production` | 通過；產物 `dist/server/wrangler.json` 斷言 worker=`quiet-hours-npc`、APP_ENV=`production` 通過。只建置，不部署。 |
| 最終Chromium跨日重跑 | 通過：24 UI＋110公開API、3735世界分鐘、30 NPC＋3裁定fixture、原ID不增加派送；無pageerror。 |
| 雙軸獨立複查 | Standards剩餘0、Spec剩餘0，詳見審查紀錄。 |
| 證據／文件 | 中文畫面已目視核對；新增Markdown本地連結、`git diff --check` 與驗證腳本語法檢查通過。 |

後續只更新文件、篩選fixture證據及瀏覽器腳本的輸出目錄選擇；`lib/ app/ components/ db/ drizzle/ package.json pnpm-lock.yaml wrangler.jsonc .github/` 相對固定驗證提交沒有差異。輸出路徑小修另經Node語法／ESLint及同一瀏覽器完整重跑，不改產品流程。

早期合併進行中的全套曾記錄一次未在固定提交重現的generic identity解析失敗；未據此放寬驗證或宣稱根因已修。原案例與額外組合metadata案例原樣保留，固定checkout最終全套均通過。舊測試將105分鐘視為非法的假設已改成合法105／1440與非法非粒度／超上界對照。

交付PR以Git tree核對本地已提交內容；驗證提交與遠端快照commit的SHA可不同，但檔案內容由blob／tree逐一校驗，不以分支名稱冒充已測版本。

## 正式交接與剩餘限制

按[唯一有限正式驗收流程](autonomous-life-live-runbook.md)另行取得授權，核對部署／模型／隔離起點、回合／派送／tokens上限、停止與原操作恢復；本輪不啟用。舊規則不會被暗中升格為模型已確認，未選再確認時仍可能吃喝而沒有新需求緩解。活動復工採保守條件重驗；條件不同可拒絕過期候選，角色可放棄後提出新方法。證據、喜好與候選有容量／淘汰缺口，不能宣稱永久完整心理史或完整自然語意分類。

新JSON寫入後，舊binary不理解完整需求／進度／資訊語義；回退須保留完整資料與可理解的執行器，不丟欄位、不以重置達成相容。沒有新SQL migration；雲端D1、真實provider、部署效能及真實NPC行為本輪未驗。
