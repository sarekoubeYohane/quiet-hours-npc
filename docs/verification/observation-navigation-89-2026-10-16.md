# #89 觀察／設定／分析切片驗證

基準：`cae80db`；工作分支：`feat/89-observation-navigation`。

採用使用者已授權的真實 WorldApp + 世界 GET/POST + SQLite fixture、可控時鐘與 Chromium seam。模型 transport 只回固定 fixture，不使用正式世界或付費模型。

## Red → Green

- `tooling/verification/browser89.mjs` 對基準 checkout 執行失敗：找不到「觀察室分頁」導覽（1500 ms）。
- 實作後同腳本通過：第 10 秒切設定及分析，第 30 秒仍按原期限只送一次 advance；地圖播放中切頁仍序列化；設定頁共用暫停；套用 30 分鐘步長由真實 API payload 及世界結果驗證；重載不自動恢復；背景停止；模型替身回 429 後停止原因可見且切頁不恢復；390 px 窄畫面無水平溢出；無 pageerror。
- `node tests/run-tests.mjs`：全數通過（與基準相同的 257 案例）。
- `tsc --noEmit --incremental false`：通過。
- 變更元件與 browser89 ESLint：0 errors；保留原有自動計時 effect 的 `act` dependency warning。移除 world-app 原先 ref render 寫入、同步 effect setState 與首頁 anchor lint errors。
- `git diff --check`：通過。

## 行為與界線

各分頁是同一 WorldApp 內的可操作 view，保持同一世界、操作冪等 token、控制器、地圖播放及 ForecastPanel 採樣元件。隱藏的頁面不供鍵盤／輔助技術存取，但不因切頁重掛；設定只有實際操作才套用，查看設定不 refresh、不停止。地圖保留 mounted，避免切頁清除正在播放的序列。費用 editor 草稿、歷史 ledger、預估樣本不因切頁消失。

主頁僅保留大地圖、最近 5 則動靜、按需完整生活紀錄、輕量狀態及既有互動；感知／意圖等既有詳情移至分析。感知線索改為「視覺線索／聽覺線索」避免與原內容「看見／聽見」重複，不改判定。

本切片不實作追溯、裁定引擎或 #56 新記憶展示。#90 將接續擴充輕量角色面板／人物檔案；素材 #88 未接管。
