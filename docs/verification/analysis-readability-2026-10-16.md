# 角色分析閱讀性修正（2026-10-16）

## 起點與範圍

使用者要求直接打開任一角色分析頁，改善 padding、文字大小與閱讀性。正式站起點為 `91a10d5`；已登入並打開分析分頁、切換至 Vera，目視確認角色欄約 355px，行動詳情與關注詳情貼框、記憶來源文字偏小。

本次僅調整展示與記憶列表鍵盤操作：分析頁兩欄均分；1000px 以下改為單欄並先顯示角色資料；桌面 24px、手機 18px 主要內距；正文 16px、來源與時間 14px；記憶片段加內距及分隔，捲動區可聚焦並有名稱。規則、世界狀態、模型請求與費用計算未變更。

## 驗證結果

- `pnpm typecheck`：通過。
- `pnpm build`：通過。
- `node tests/run-activities.mjs tests/recovery-ui.test.cjs`：1/1 通過，涵蓋重新載入恢復。
- `pnpm exec eslint components/world-app.tsx components/cognition-analysis.tsx`：0 errors；既有 useEffect 相依警告 1 則。
- `git diff --check`：通過。
- `pnpm lint`：未通過；既有 `tests/d20-api.test.cjs` 的 4 處 require import 錯誤，及既有 4 則警告。本次未改該測試檔。
- 修改後目視驗證未完成：既有 browser fixture 已啟動，但 Cloud Browser 連至執行環境 `127.0.0.1:5173` 回覆 `ERR_CONNECTION_REFUSED`。正式站已觀察的畫面是修正前版本，不能視為修正後證據。

## 待目視驗收

在可存取新分支的預覽中打開「分析」並選 Vera；確認桌面兩欄寬度、關注詳情內距、展開信念與來源、以 Tab 聚焦記憶列表並用方向鍵捲動。以 390px 及 320px 視窗確認單欄、段落換行、沒有水平溢出。合併部署後再確認正式站版本。
