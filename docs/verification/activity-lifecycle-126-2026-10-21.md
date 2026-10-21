# #126 活動生命週期驗證

基準：整合分支 `139e972`，包含 PR #124 的 #122／#123 已完成成果。後續核對：PR #124 已合併，原票已由該 PR 關閉；本輪不重做或另行關閉它們。本票集中既有行為；未新增結果分支、未呼叫付費模型、未部署或重置正式世界。

## API／SQLite

以正式世界 GET／POST handler、D1 相容 adapter 的實際 SQLite 保存重讀驗證。模型只替換 transport、骰子沿原有測試控制；效果及活動執行未替換。

- 整理前選定四份回歸檔：32/32 通過；整理後同組 32/32 通過。
- `tests/activity-lifecycle-api.test.cjs` 新增本票回歸：取消計畫只清理該計畫未具體化供應，保留無關 pending 供應與已具體化來源、杯子身份；接管／交還、SQLite 重讀及重送皆驗證，無新增裁定。
- 完整活動／世界 API runner：359/359 通過，0 fail／skip。涵蓋自主／直接指定／規則模式、時間上限、60／90 分鐘續做、開放式到期、換事、工具失效／他人移動、保存衝突、提交不明與操作重送，以及 #122 契約與 #123 杯子承接。
- `tsc --noEmit --incremental false`、變更檔 ESLint、`git diff --check` 通過。

## 真實應用瀏覽器

使用既有 `tooling/verification/browser119.mjs`，實際 Chromium、WorldApp、世界 API 與 SQLite；模型 transport 為明示 fixture，不能據此宣稱正式站／真實模型驗收。瀏覽器啟動時發現既有 `/tmp/chromium` 是空檔，改指定已解壓的 Chromium executable，未修改應用或測試邏輯。

六組均通過：

| 情境 | NPC／裁定次數 | 可觀察結果 |
| --- | --- | --- |
| continue 60／90 分鐘（各一組） | 各 2／1 | 重載後明示續做保留起點、游標及完成時間；重送不重播 |
| open 45 分鐘 | 3／0 | 已到期時再說續做仍只結束原時段 |
| switch 60 分鐘 | 2／1 | 取消未來茶成果，保留已保存的水與杯子 |
| controls 30 分鐘 | 1／1 | 自主、單次指定、接管／交還及規則模式共用階段；重用無新增模型 |
| moved 90 分鐘 | 9／2 | 他人移走物件後取消未來效果，保留實際去向，不向原角色洩漏隱藏資訊 |

[直接控制與規則重用畫面](assets/activity-lifecycle-126/controls-reused.png)。所有呼叫數為 fixture 派送，未新增真實付費模型用量。

重現時由 repo 根目錄執行，設定：

```sh
PLAYWRIGHT_MODULE=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright \
CHROMIUM_MODULE=/workspace/scratch/13535bd2cdbc/browser-deps/node_modules/@sparticuz/chromium/build/index.js \
CHROMIUM_EXECUTABLE=/workspace/scratch/13535bd2cdbc/browser-deps/extracted/chromium \
BROWSER_FONT_DIR=/workspace/scratch/13535bd2cdbc/browser-deps/node_modules/@fontsource/noto-sans-tc \
BROWSER_ARTIFACT_DIR=/tmp/npc126-browser \
node tooling/verification/browser119.mjs
```

這些絕對依賴路徑屬本次執行環境；其他環境依 `tooling/verification/README.md` 指定當地 Playwright／Chromium。完整整合後仍需 code review、整合 build；#127–#129 結果分支與日常擴充不屬本票驗收。
