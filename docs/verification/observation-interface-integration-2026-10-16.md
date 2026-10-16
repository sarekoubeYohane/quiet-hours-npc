# 觀察介面與狀態地圖整合驗證

整合 PR：[#96](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/96)。起始及發布前核對的 main 為 `cae80db0c8e1c132a55a521fe6604809ae7aa513`；功能與審查修正的本機整合提交為 `aa7ffdf`。GitHub 發布以相同來源樹驗證，不要求遠端保留本機 merge commit 的識別碼。

規格依 #87、#89、#95、#90、#56 的完整正文／留言，以及 #50 的記憶邊界；沒有重新 Grill。原生 blocked-by 查詢為空，依票面關係執行：#89／#95 無外部前置；#53／#54 已關閉，PR #63／#64 已合併；#89 在同一整合分支測試通過後解鎖 #90／#56。已核對關聯 #68、#84、#86 的實際合併狀態。

## 本輪完成

| 票 | 結果 |
| --- | --- |
| #89 | 觀察／設定／分析入口、同一前景運行與暫停、精簡近況與按需完整紀錄、設定／費用與推估搬移、既有操作保留 |
| #95 | 世界時間日夜、實際分區與門、真實活動短文、播放後與重載後收斂至已提交狀態、減少動態／窄畫面／缺圖相容 |
| #90 | 輕量面板、人物檔案、正確角色互動與分析／返回；已有店主單次指定、接管、待命及交還流程 |
| #56 | 唯讀短期、有效長期／摘要、現行信念與確信、自由關係標籤、有限更正理由與來源；精確版本、缺失與已忘來源分別呈現 |

地圖與人物檔案共用 `lib/character-assets.ts` 的穩定角色 ID／用途接點。未知角色及圖片失敗保留文字與操作。沒有改寫人物設定、補造歷史原文、額外生成分析或增加角色模型呼叫。

## 實際檢查

所有測試使用既有世界 HTTP API、真實序列化與 SQLite／Workers fixture。模型、登入及外部服務在邊界使用替身；時間和骰值可控。沒有真實玩家 Key、正式世界、服務啟用或付費模型壓測。

- `pnpm test`：**258／258**（世界／介面 216、登入／Key／重置 32、Workers／migration 10），0 失敗。預設網路 guard 生效，沒有 `test-network-denied` 事件。
- `pnpm typecheck`：通過。
- `pnpm build:production`：通過；產物核對 `name=quiet-hours-npc`、`APP_ENV=production`。
- 全部變更的 runtime／API 測試／瀏覽器腳本 ESLint：0 errors、4 warnings（既有排程 effect dependency，以及三處直接載入像素圖）。
- 全域 `pnpm lint`：仍有 `tests/d20-api.test.cjs` 四個既有 `no-require-imports` errors；起始 main 為 8 errors／3 warnings，本輪已移除所觸及 UI 的四個既有 errors，沒有宣稱全 repo lint 通過。
- `git diff --check`：通過。

九份真實 Chromium＋WorldApp＋世界 API runner 在整合來源執行通過，無 pageerror：

| Runner | 主要驗證 |
| --- | --- |
| `browser89.mjs` | 運行到第 10 秒切頁，仍於原定第 30 秒只派送一次；共用暫停、播放序列化、設定、故障停止、背景／重載、390px |
| `browser95.mjs` | 世界時間日夜、API 開門／移區、通用合法活動、播放中重載與背景、375px／減少動態／缺圖及舊世界 |
| `browser90.mjs` | 點角色→檔案→介入→API audience 重讀→同角色分析→返回；角色切換、運行更新、缺圖／未知角色、店主完整控制流程 |
| `browser56.mjs` | 桌機／390px 記憶→信念→更正來源、缺失與舊版本、選取、共用暫停、0 POST／模型呼叫 |
| `browser80.mjs` | 預算草稿、驗證、取消、保存／重載、無上限確認與前景停止 |
| `browser81.mjs` | 玩家／站主／供應商／技術停止原因與回復、正常提交 |
| `browser82.mjs` | 自訂價格、歷史價格、未知／部分費用、失敗已發生用量與重載 |
| `browser83.mjs` | 推估採樣、重播、暫停／恢復、設定失效、未知／零價、背景及重載 |
| `browser-action-analysis.mjs` | 真實工作判定 `10 + 4 − 16 = -2`／部分成功，分析與完整紀錄都可讀取已保存的行動／感知判定 |

新增 GET 回歸另驗證：指定另一人的 owner query 不會跨帳號讀取、未登入 401、重讀 world／version 不變、0 外部模型／索引呼叫、沒有直接改寫信念的操作入口。這是既有權限的回歸，不冒充原本缺少權限修復的 Red。

各切片的真正 Red→Green 見 [#89](observation-navigation-89-2026-10-16.md)、[#95](authoritative-map-2026-10-16.md)。#90 首例找不到人物檔案入口後實作；#56 首例找不到記憶與信念區塊後實作；其餘缺圖／控制與權限檢查按實際行為作回歸，不把所有通過測試都稱為新增功能 Red。

## Standards

獨立 Standards 代理檢查起始 main 至完整整合 diff，依 AGENTS、Matt Pocock、domain、GLOSSARY、感知 ADR 與完整 smell baseline 審查：硬性違規 0、需提出的 smell 0。人物檔案與唯讀分析分成元件，素材用途以 registry 集中；未見觀察者追溯回灌 NPC。

增量複審 `dcfde1a..aa88c6b`：共享 `ActionResolution` 避免兩處維護同一格式，沿用既有 `Resolution`，沒有新增世界計算或多餘抽象。剩餘 0。

## Spec

首次獨立審查發現 1 項 P2：#89 要求行動／感知詳情移到分析，但分析事件只顯示感知判定，漏掉 `event.resolution`。已由單一實作代理補上共用展示，沒有改變判定或知情語義。

修正前真實 API 已保存工作判定，但分析頁找不到骰點；修正後同腳本通過。Spec 代理獨立重跑驗證 `10 + 4 − 16 = -2／部分成功`，確認分析及觀察紀錄一致。最終剩餘 **0 項**，未發現範圍偏離。

兩軸最終：Standards 0，Spec 0；兩軸沒有互相抵銷。

## 素材與後續

功能流程與新素材品質分開：本輪沿用既有 Cass／Vera／Kris PNG 及店主 SVG，未生成或接管 #88，也未把放大既有像素圖當成新肖像完成。來源、尺寸及替換方式見 [圖像接點](../design/character-visual-assets.md)。#88 後續替換 `portrait`／`pixel` 路徑並驗收身份、透明、尺寸與幀資訊，再跑地圖／人物檔案實際尺度檢查。

截圖供流程與版面檢閱：[白天地圖](assets/95/browser95-day.png)、[夜晚地圖](assets/95/browser95-night.png)、[缺圖地圖](assets/95/browser95-mobile-fallback.png)、[人物檔案](assets/96/profile-desktop.png)、[窄畫面檔案](assets/96/profile-narrow.png)、[唯讀分析](assets/96/analysis-desktop.png)、[窄畫面分析](assets/96/analysis-narrow.png)。這些是測試 fixture，不是正式世界或小說新設定。

PR 只關聯關閉 #89、#95、#90、#56；#87、#50、#88 保持開啟。不包含 #69–#75、#91–#94、#85、住宅／街區擴建、追溯引擎或自由效果裁定。未合併、未部署、未執行正式遷移或重置。

## 重現

取得 PR 分支後，執行 `pnpm install --frozen-lockfile`、`pnpm test`、`pnpm typecheck`、`pnpm build:production`。瀏覽器依 [工具說明](../../tooling/verification/README.md) 設定 Playwright／Chromium 路徑，逐一執行上述 runner；各自啟動獨立測試資料庫，不需要真實 Key。
