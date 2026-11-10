# 正式站「＋新開存檔」導覽失效

基線為 `569066c`。正式站 `/api/environment` 於本次查證回覆 production、569066c、2026-11-10 14:24 台北。使用者在已登入的正式站確認：hover 導覽即報 `[vinext] RSC prefetch setup error: TypeError: d is not a function`（`link-VgCClS6C.js:2:4492`）；點擊報未捕捉的 `TypeError: e is not a function`（`:2:11941`），無法開啟新存檔且後續導覽失效。這是使用者協作重現，不是 agent 取得正式站登入後的操作。

代理工具只能開啟 Codex 內建分頁，未提供該分頁的操作入口；雲端 Chromium 不共用登入，且本聊天的 `open_in_codex` schema 沒有 cloud-desktop。可執行的 workaround 是使用者操作同一已登入分頁的 Console，再提供去敏錯誤文字。沒有傳遞密碼、Cookie、session token，也沒有繞過正式站認證。

## 根因與修正

從正式站下載公開的 JS，兩個精確位置分別是 `getPrefetchInterceptionContext(fullHref)` 與 `navigateClientSide(...)`。Link 以動態 import 取得 navigation namespace，但實際載入的共同 browser entry 只匯出壓縮別名，缺少這些具名函式。乾淨的正式模式建置在本機產生同樣錯誤，排除「只存在正式站的快取混版」作為必要條件。

只對 Vite client build 設定 `rolldownOptions.preserveEntrySignatures: 'strict'`。修正後產物保留動態匯入需要的 namespace projection；壓縮仍啟用。沒有修改導覽 URL、帳號綁定、資料庫 schema、OAuth、開局規則或應用層按鈕。此設定與 vinext 1.0.0-beta.5／Vite 8.0.13 的產物問題相關；日後升級仍須通過同一建置後測試。

## 回歸接點

`tooling/verification/browser-built-navigation.mjs` 直接載入 `pnpm build:production` 產生的 Workers JS 與 client assets，使用 Miniflare 的隔離 D1，套用全部現有 migrations，只在隔離庫建立短效測試 session。使用產品的認證驗證、真實 route、React Link、router.push 和 API，不替換 navigation transport，也不讀取正式資料或連外模型。啟動時把伺服器 bindings 指向本機，不改建置產物。

流程：首頁 → hover／點擊「＋新開存檔」→ 新開世界 →「建立人物卡並返回」（保存真實草稿並 router.push）→ 設定 → 存檔。斷言 owner 綁定、草稿存在、Console／pageerror 為空、對外請求為零。此測試驗證導覽及進入開局；不宣稱已完成五步建立世界或正式站驗收。

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build:production
pnpm test:built-navigation
# 若使用環境已有 Chromium：CHROMIUM_EXECUTABLE=/usr/bin/chromium pnpm test:built-navigation
```

CI 已在 production build 後加入同一瀏覽器檢查。Playwright 1.64.0 固定為開發相依，沿用既有 `browser-runtime.mjs` 的瀏覽器設定。

| 驗證 | 結果 |
| --- | --- |
| 無修正的正式模式產物＋上述真實頁面測試 | RED：停在首頁，hover／click 同樣的 TypeError，新開世界未出現 |
| 保留入口匯出後的相同測試 | GREEN：五個頁面節點、草稿 1 份、錯誤 0、對外請求 0 |
| 正式模式建置 | 通過 |
| 本機 typecheck、變更檔 ESLint、diff check | 通過 |

原始精簡證據：[修正前](assets/built-navigation-2026-11-10/before.json)、[修正後](assets/built-navigation-2026-11-10/after.json)。隨機 draft UUID 與 loopback 埠只來自隔離測試。

## 發布狀態

此紀錄建立時：正式站故障已由使用者提供 Console 證據，本機相同故障已重現且修正通過；修正尚未部署，正式站修正後驗證尚未完成。只有發布後重新讀取 `/api/environment`，並由已登入的正式站再次執行 hover／新開存檔／後續按鈕流程，才能更新後兩項狀態。
