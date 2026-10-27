# #187 柔性安排：本地驗證

基準 main `148a75d`。本輪只驗證 fixture 機制，不呼叫付費模型／回想服務，不操作正式世界。

- 首個切片 `node tests/run-activities.mjs tests/arrangements-api.test.cjs`：未支援 arrangementUpdates 時 API 502（預期200），接線後通過。歸檔切片：未支援 archive 時502，加入僅限完成／放下明示釋放後通過。
- 最終 `node tests/run-activities.mjs tests/arrangements-api.test.cjs tests/preferences-api.test.cjs tests/life-cognition-integration-api.test.cjs tests/recall-api.test.cjs`：55/55 通過；其中新增安排8項。覆蓋建立／延期／keep／drop／archive、自主空意圖、錯過保留、短期容量淘汰、長期選留後合法forget、16筆滿額、無效較後角色／來源／版本／共同心理工作量回復、存檔前後故障／CAS及原ID重送。
- TypeScript 全案通過；變更的11個程式／測試／runner ESLint通過；git diff --check通過。
- 真正 Chromium 執行 `tooling/verification/browser-arrangements.mjs`：8次模型 transport fixture，既有 WorldApp／世界API／SQLite，建立→分析頁→客觀時間已過／主觀知情區分→重載→自主放下。0 pageerror，重載未改故事，intents保持空；[建立畫面](assets/arrangements-187/saved.png)、[放下畫面](assets/arrangements-187/dropped.png)、[保存證據](assets/arrangements-187/evidence.json)。啟動曾受0byte既有Chromium與缺GLES阻礙；以task-specific解壓實際binary及swiftshader後重跑通過，未以失敗啟動宣稱UI成功。

API測試沿真實路由及SQLite保存重讀；只替換模型transport、時間／感知相關fixture基線，沒有替換安排／認知／活動／提交helper。普通續做、既有喜好及認知共同工作量由適用回歸承接。Vector Recall回歸通過，但本切片未單獨實跑「初次省略安排、經向量回想才取得安排」的新案例；#193須補此整合覆蓋。#191的條件喚起及手機仍為後續票責任，未宣稱本切片通過A1–A30全部。

私有實錄透過既有真正派送保存原輸入／候選；actor snapshot新增安排。觀察者開啟分析不代替角色想起或閱讀；內在安排只由當次實際可見的完整本人記憶授權，省略投影不得修改。工程與回退基線見 [柔性安排](../design/flexible-arrangements.md)。整合分支最終兩軸code-review另由implement-spec收尾，不把本切片自檢當獨立兩軸終審。
