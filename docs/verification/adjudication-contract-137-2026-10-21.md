# #137 一般自由裁定契約

本地基線 `ae68420` = main `5e172d5` + 未合併 PR #144 `53f4298` + 已批准設計 `de0d7d0`。這不表示 #144 已在 main。

一般自由裁定的提示規則、provider schema、候選解析已由 `adjudication-contract` 負責。共同 status、難度、五段結果、時間、容量限制供三者使用；自然語意與跨欄位驗證仍保留。模組僅接受候選字串，沒有世界執行、亂數、保存或付費能力。`world-effects` 保持公開相容 re-export，正式 API 仍經當前世界效果驗證。日常核准的世界綁定分離由下一票 #138 完成。

驗證為本機模型 transport fixture、受控 D20；沒有呼叫付費模型、修改正式世界、合併或部署。

- Red：公開契約測試無模組失敗；之後加入實送 prompt/schema + API/SQLite 路徑，識別測試需保留接管的店主，避免 seed 相容機制另補自主角色。
- Green：公開契約、自由活動、模型隔離 34/34；合法耗時 .1/15/15.1/90 向上對齊，0/-1/90.1/字串拒絕，非法 status/effect/超量拒絕；既有自由 API 覆蓋過時、無權、有限供應、重送、保存／版本故障及 denied/unsupported。
- 真實 WorldApp Chromium `browser127-case.mjs success` 通過：開始→跨回合完成→SQLite重讀→原 ID 重送→重載→分析頁；NPC/裁定/D20 = 1/1/1，原物 identity 保留，材料未消耗。[截圖](assets/adjudication-contract/free-success.png)。
- typecheck、變更檔 ESLint 通過。

本票不改新世界能力，也不把 fixture 當正式站驗收。一般自由候選只讀解析並不代表當前世界可執行，仍須通過既有現場驗證。
