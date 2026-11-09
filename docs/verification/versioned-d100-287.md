# #287 新能力 d100 與版本相容驗收

狀態：ready-for-fix，尚不結案。#286 關閉後才開始本票；起點 `b653e6f219ecf46c7777a833a790b1b14b238e79`，已合最新 integration `c2a38a3`（純文件）。2026-11-09 重新讀 GitHub #281／#287 本文、留言（#287 為 0）及原生 blocked-by，只有 #286 且已 closed。載入 implement-spec、TDD 與相依參考，沿用已授權的真頁／API／SQLite／模型 transport／骰接點。

產品固定點 `105197b`。本票以明示 `attributes.version=2` 且 `authority=formed-card` 選 `d100-v2`；能力 3–18 不按值大小猜版本。新活動保存 checkSystem／attributeVersion，結果保存 system／attributeVersion／threshold，原有規則、活動與結果不經 GET 升版。

## 驗收矩陣

| #287 契約 | 產品路徑及證據 | 結果 |
| --- | --- | --- |
| 相關一項能力×5，無相關 55，合法修正後 5–95 | 真草稿→形成→配點→完成卡→場景→city save API→NPC 受控工作；靈巧 3＋困難達下限 5、12 一般 60、18 一般 90、18 容易達上限 95。無相關能力的新世界裁定為 55 | 通過 |
| 01–05／96–100 優先及部分區間 | 26 組受控骰邊界：門檻 5 的 1/5/6/25/26/95/96/100；60 的 5/6/60/61/80/81/95/96；90 的 5/90/91/95/96/100；95 的 5/6/95/96。逐項核對 literal 預期，不抽樣 | 通過 |
| 可行性／不確定先取骰，外觀不作關聯能力 | 確定 check=null、denied 行為不取骰；appearance 作 attribute 在受限模型候選驗證即拒絕，0 骰、原操作重送不重新派模型 | 通過；下述舊版專長反例待修 |
| 專長／感官／關注責任與去重 | 共享已確認合法 modifier／alias 去重計算。真卡人物主動查探以感知 12×5＋關注 10 得 70，重複同資源查探保留原 receipt。舊版 API 組另涵蓋專長／感官去重、硬限制及多感官最強途徑 | 真旅程及舊組通過；未另提供新專長編輯產品 |
| 人物／規則／活動／結果版本，舊義保留 | 真活動在開始就保存 d100-v2／能力版本 2；新世界裁定由 server 固定 v2。既存 v1／D20／已進行活動與已存結果相容組 17 項。數字 3 在新卡仍走 v2，舊 3 則走 v1 | 主路徑通過；獨立審查另有一項 v1 反例待修 |
| 世界 API 保存及觀察／結果畫面 | 真首頁→人物頁；透過產品 API 形成／保存卡、建立場景與世界；首頁續玩→真 observe，顯示 d100 61／門檻 60／部分成功／d100-v2／能力版本 2，重載一致，分析頁亦可讀回 | 通過（畫面見下） |
| 原操作恢復／重送／續做／切檔隔離 | 同一 operation ID 重送沿既有 receipt；同方法再完成一整活動不重骰。慢 NPC 回覆時讀另一世界，來源活動／結果仍綁原 save；另一帳號讀取 404。原機會改裁定能力／難度仍沿用舊結果 | 通過 |
| 磁碟 DB 關閉／重開後沿用原結果 | 隔離外部 SQLite 檔由合法產品旅程建立，關 server／DB 後重開，僅 GET 與原 operation replay，不提供模型或新骰 | 重開案例 1／1 通過；沒有模型或新骰 |

## RED → GREEN

第一個合法完成卡世界（能力 12）可保存建立，但原 d100-v1 在活動完成時回 502「人物檢定資料無效」。加入明示新版本後，同一完整旅程以能力×5 得門檻 60、受控骰 60 成功，保存及原操作回放一致。

驗證工具早期兩次中斷為 locator 嚴格模式誤選到隱藏分析副本、以及誤期望 `/analysis` 路由；現有產品共同導覽實際為 `/observe?save=…&view=analysis`。改測試定位與路由期望後重跑，不把工具前提誤判為產品失敗。

## 命令與固定證據

```sh
node --test tests/versioned-d100.test.mjs
node --test --test-name-pattern 'formed card is used' tests/versioned-d100.test.mjs
node tests/run-activities.mjs tests/d100-api.test.cjs
node --test tests/character-cards.test.mjs tests/character-drafts.test.mjs tests/model-settings.test.mjs
PLAYWRIGHT_MODULE=/tmp/quiet-hours-browser/node_modules/playwright CHROMIUM_EXECUTABLE=/tmp/chromium BROWSER_ARTIFACT_DIR=/tmp/t6-browser-final node tooling/verification/browser-versioned-d100-287.mjs
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

舊 d100／D20 相容組 **17／17**；人物卡／草稿／模型設定接合 **31／31**。Typecheck、build 通過；lint 0 errors／4 個既有 warnings；diff check 通過。T6 真 App Router 全組 **6／6**（含 26 組門檻邊界）通過；另加關閉／重開磁碟 DB 案例 **1／1** 通過。瀏覽器旅程 `105197b`，origin `http://127.0.0.1:46381`（以 evidence.json 實際值為準），模型恰 2 次、付費 0 次。

所有新世界由合法卡形成及保存、場景及存檔 API 建立，沒有測試產品路由或直接安裝 fixture 冒充建立成功。舊版 17 項屬相容歷史快照組，不用它代替新世界旅程。真 App Router runner 使用磁碟 SQLite 套全 migration；僅替換 hosting、cookie 登入邊界、外部模型 HTTP 和骰亂數邊界。模型外網禁止，付費 0；骰序列耗盡即拒絕多取骰。受控模型通過不代表真實模型語義品質。

## 畫面

- [觀察及保存結果](assets/versioned-d100-287/observe-result.png)
- [分析結果與明示版本](assets/versioned-d100-287/analysis-result.png)
- [origin／版本／登入與模型／骰次數](assets/versioned-d100-287/evidence.json)

## 獨立審查待修

Standards 在 `105197b` 找到 P2：新增 appearance／外觀 alias 排除誤套 v1，使合法舊 actor 的 `check(attribute:null,ability:'外觀',difficulty:12)`、已存專長 `外觀 +20` 從舊門檻 75／專長 20 變成門檻 55／專長 0。這是已重現的舊契約回歸，主旅程與舊 17 項通過未涵蓋此反例。已交唯一修復者 `t1_navigation`，本分支不平行修 review finding；合入修正且獨立重驗後才能將本票標完成。Spec 獨立軸亦確認同一 P2，無額外 finding；Standards smell 0。兩位獨立 reviewer 另跑新 API 6／6 與舊版 17／17 通過，沒有以測試全綠否定這項新反例。

## 遷移、回退與未驗證

本票沒有新 SQL migration；在既有 world JSON 新增版本化活動與結果欄位，舊資料保留原樣。所有 migration 僅套隔離本機資料庫，沒有正式資料異動。若回退到不識別 d100-v2 的程式，不能安全推進已保存 v2 活動；應先保留資料備份並使用支援該版本的程式，不能刪骰果或升降版來重判。未演練正式回退。

未驗真實 OAuth／跨真裝置部署、真模型語義、正式世界或遊戲平衡。新專長／感官編輯器不在本票範圍，沿原保存契約。T7 尚未開始，五步開局完整 UI 並非本票 city API 接點已完成的內容；本報告不宣稱 #281 全部完成。

## 唯一修復者的版本相容修正

接合最新 integration `c2a38a3` 及完整 ready-for-fix `2206886` 後，補上真產品 API／SQLite 的舊 v1 反例：原本合法 `外觀`／`appearance` 領域專長 +20、無關聯能力、一般難度、骰 70，先重現錯誤門檻 55（應為 75）。修正只讓 `d100-v2` 將新 appearance／外觀別名加入去重排除；v1 沿用原四項能力與感官 aliases，不把舊領域專長解讀成新外觀數值。

修正後同 API 保存重讀與原 operation ID 回放保持 v1 門檻 75、專長 20、成功、僅一次骰與原模型呼叫；中英文兩個別名都驗證。另以 resolver 契約快照補驗 v2 仍為門檻 55／專長 0／無相關能力，這個補充物件測試不冒充新世界建立旅程。原新卡真 App Router 測試仍負責完整形成、保存與世界旅程。舊相容組含新增兩項 **19/19**；red／green log 分別為 `/tmp/quiet-hours-context/review-t6-legacy-appearance-{red,green}.log`。新版完整 API、固定來源真頁與 type／lint／build 驗證待最後證據補入。
