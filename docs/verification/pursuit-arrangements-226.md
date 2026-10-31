# #226 追求等待與安排再考慮驗證

2026-10-29，基線 integration `ded9443`（含 T1–T4 與原生候選／收斂 fixture）。本切片新增 Arrangement → 追求關聯，沿既有 matcher、記憶、活動與 SQLite；沒有第二套提醒、排程或背景模型。先以同批追求＋關聯安排 API 得 502 RED，再接通共同候選驗證得到 GREEN。全部為合成隔離世界、受控 provider；真實付費派送 0，未操作使用者世界、合併 main 或部署。

命令：`node --import ./tooling/verification/no-network.mjs tests/run-activities.mjs tests/pursuit-arrangements-api.test.cjs tests/arrangement-cues-api.test.cjs tests/arrangements-api.test.cjs`，**33/33 通過**（16 新原生追求旅程、17 適用安排回歸）。世界／活動／感知／效果使用真實程式，SQLite 保存重讀；只有 transport 與測試所需時間／骰子為受控輸入。

| 驗收 | 證據 |
| --- | --- |
| C15 | 穩定追求＋安排保存，時間及本人所在情境提供一次決策機會；continue 原進度不重啟，明示 waiting／deferred 可保留追求，也可無焦點選其他合法行動 |
| C15、C19 | 改措辭、無關追求升版、持續條件不重 arm；明示延期的新條件可再次喚起。原 ID／GET／重載零額外派送 |
| C16 | 82 次後來經歷使安排正文退出短期記憶後，活動追求及關聯仍保存；下一次真正 request 不含原文、安排 handle 或 cue，不能從 ID 復活 |
| C18、C19 | cue 到期保存衝突不提交／不消耗，原 ID 重送零新增派送，之後成功候選才記處理 |
| C20、C21 | 真睡眠含既有裁定／身體恢復，五輪仍只有 1 NPC＋1 裁定，不因時間提醒喚醒；接管待命無新增決策，交還後正常考慮 |
| C15、C21 | 六個 cue 前四後二，共用正常決策，gap 2 的未展示項目仍未處理；沒有每項或每層模型 |
| C16、C22 | 外角色、缺失／過期端點、額外引用欄位原子拒絕；已放下追求使原 cue 停止，安排仍獨立 active；反向完成安排也不滿足追求 |

`pnpm typecheck` 與變更檔 ESLint 通過。既有 phone／完整容量／多角色最高壓力與最終兩軸 review 仍由後續整合回歸核對，本報告不冒稱全部 repository 測試或真實行為已通過。

本機 `tooling/verification/browser-pursuit-arrangements-226.mjs` 已用 Edge/Chromium 執行真 WorldApp → API → SQLite → 重載分析 → 下一次真正 request。三次 fixture NPC 決策：原連結時 v1、目前追求 v2 且 deferred；重新載入能讀到關聯與一次處理狀態，第三次輸入 cue 為空，原活動起點及完成時間不變，pageerror 0。合成去識別截圖：[安排面板](assets/pursuit-arrangements-226/arrangements.png)、[追求面板](assets/pursuit-arrangements-226/pursuits.png)；[摘要](assets/pursuit-arrangements-226/summary.json)。完整本機輸出在 `outputs/pursuit-arrangements-226/`。

**跨票待驗的明確缺口：** 新承接的同一決策就明示 waiting／deferred，需要 T5 共用 upsert＋assess 同 ID 擴充。已交可執行的 `tests/pursuit-new-waiting-api.test.cjs`，包含 upsert 在前／assess 在前兩種排列：同批 create＋assess(waiting version 0)＋arrangement link(version 0)，期望保存及下一次輸入皆為 node v2/link v2。T5 擴充前 **2/2 RED**，未納入本票 33/33 或 default list；T5／merger 整合後必須補 GREEN 並納入 default list，才能宣稱新形成即等待的完整契約完成。沒有用安排條件自動推論 NPC 的 waiting 意願。

## 共用擴充整合結果

#225 已在 `2118806` 合入上述擴充：兩種新承接等待排列 **2/2 GREEN**，並已加入預設測試清單。七個原生 suites 為 **131/131**，加既有安排／喚起回歸共 **148/148**；整合 typecheck 與 diffcheck 通過。前段 RED 記錄保留作導入證據，這項跨票缺口已接通；完整容量及來源投影仍由 #227 驗證。

#220／#229 的真實多輪形成、有效推進與退出仍未驗收。受控回覆只能證明程式可承接。
