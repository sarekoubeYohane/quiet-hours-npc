# #88 角色素材驗證

基準：已合併 #96 的 main `0221902`；分支 `assets/issue-88-character-art`。本輪已使用內建 GPT ImageGen 生成，使用者逐版確認 Cass、Vera、Kris 與店主外觀；未部署或修改正式世界。

## 交付與實際接入

四位各有全解析定妝主圖、人物檔案圖、頭像及透明單幀像素 PNG，共16圖。[清單](../../public/characters/manifest.json) 是 `lib/character-assets.ts` 使用的同一份來源。新人物圖已接入 #90，PNG 已接入 #95；既有角色 ID 不變，店主不再依 SVG 特判。原 `public/pixel` 保留。頭像已提供與預覽，輕量面板沿既有像素元件，未擴張另一套 UI。

| 角色 | 主視覺／頭像／像素預覽 | 正式檔案頁 |
| --- | --- | --- |
| Cass | [四位對照](assets/88/approved-lineup.jpg) | [Cass](assets/88/profile-cass.jpg) |
| Vera | 同上 | [Vera](assets/88/profile-vera.jpg) |
| Kris | 同上 | [Kris](assets/88/profile-kris.jpg) |
| 店主 | 同上 | [店主](assets/88/profile-owner.jpg) |

[桌機地圖](assets/88/map-desktop.jpg)、[390px地圖](assets/88/map-narrow.jpg)、[窄畫面檔案](assets/88/profile-narrow.jpg)。可載入 `/characters/preview.html` 檢視原生與代表地圖尺度，不需對話暫時圖片網址。

## 執行結果

- `node tests/run-tests.mjs`：258通過（216世界/API、32帳號/Key、10 Workers/migration）；0失敗，無外部付費請求。
- `tsc --noEmit --incremental false`：通過。
- `browser88.mjs` 真實 Chromium＋WorldApp＋世界API fixture：四位所有用途解碼，尺寸吻合；48×96 PNG alpha 僅0/255、四周留白、最後不透明列91、基準92；人物檔案高400px／窄畫面300px，平滑縮放；地圖為 `pixelated`，無破圖或頁面錯誤，查看前後世界資料完全相同。
- `browser90.mjs`：通過。檔案→介入→同角色分析與返回、自動運行／暫停、圖片故障、未知角色 fallback、店主單次指定／接管／交還由 API 讀回驗證。破圖注入路徑已改為新 portrait URL。
- 圖像檢視：四位主圖／頭像與小人身份連貫，無多餘人物、非預期文字，髮型、服裝與主要配飾可辨識；手腳裁切與透明暈邊經匯出及實際尺寸檢查。Kris 深色衣髮在夜景依輪廓、耳機與西裝色差辨識；窄畫面細部有限。

瀏覽器驗證使用 `BROWSER_FONT_DIR` 的 Noto Sans TC 產生可讀中文證據。環境原 `/tmp/chromium` 與圖形函式庫不完整，改用獨立解壓的同一安裝版 Chromium 與 SwiftShader；沒有修改產品瀏覽器設定。重現參數見 [驗證入口](../../tooling/verification/README.md)，本票入口是 `browser88.mjs`。

## 兩軸 code review

依 repo `code-review` skill，兩位獨立審查者對固定基準 `02219029da55d1a5859d0e85602d4bf8df67be1a` 至提交 `52acefa` 的差異審閱。

- Standards：0項問題。讀取 AGENTS、Matt Pocock、Domain、GLOSSARY及smell baseline；未找到 CONTRIBUTING／CODING_STANDARDS。manifest共用、穩定ID、文件對已實作與限制的區分符合規則。
- Spec：0項問題。對照 #88 完整驗收與使用者逐版造型，16圖、載入整合、透明與基準線、瀏覽器證據及生成來源齊備，未改世界或小說設定。

審查者檢閱提交與影像證據，未另重跑瀏覽器；上述測試由實作者實際執行。

## 實際生成與限制

[生成記錄](../design/character-generation-2026-10-16.json) 包含所用提示詞、工具、角色來源 blob SHA、參考檔 SHA-256。seed及精確模型版本工具未提供，明示未知。主圖全解析轉碼為 WebP quality95，不宣稱無損原PNG；像素源是實際生成的像素風圖，匯出48×96，不能宣稱工具遵循了prompt中的原生32×48格網。

只交付一幀通用站姿，移動／活動沿既有CSS表現，無新方向／全動作動畫。未驗正式站部署後畫面、真人帳號或其他裝置；不重置世界、改小說設定、更新小說repo、付費壓測、合併或部署。
