# #223 共享下層與局部排序驗證

這是受控 transport 的程式契約驗收，真實付費模型派送為 **0**，沒有操作正式世界。基準為 #221 已整合 `7108d2c`；真實 NPC 形成與推進能力留待 #229，不能由本結果宣稱改善。

`tests/pursuit-graph-api.test.cjs` 使用真世界 GET／POST、真活動與設計結果、SQLite 保存重讀，並核對下一次真正派送的 messages；只替換 provider transport、必要感知骰。創作／送禮共用任務在舊單父產品 red（502），加入有界 DAG 後 green；明示局部排序在舊產品 red，加入 `reorder` 後保留同一進度並可跨分支選擇。

| 驗收 | 實際證據 |
| --- | --- |
| C3、C4 逐步形成／共享 | 同批下層先於兩個上層合法；Vera 創作與送禮共用一份 task，一次實際設計成果，保存／下輪不複製 |
| C5 圖／版本 | 同批更新順序反轉仍有效；重複邊、外人／過期端點、非法邊位置、重複／過期／外人排序成員及錯誤 scope 整輪拒絕，已知用量保留；原 ID 重送零新派送 |
| C6、C8 局部順序／省略 | 根與同上層各自重排，未列工作 v1／範圍保留；同一共享工作在不同上層位置不同，重要等待方向不阻止選另一分支，之後回原焦點 |
| C7、C14 活動／前提 | 排序沒有建立方法執行清單或外在效果；chosen continue 保留原 startedAt／until，一份實際設計成果不重播。外在前提仍沿既有效果／活動驗證，沒有放寬原驗證器 |
| C17 圖上界 | 真 API 三輪形成總 12 節點／16 邊／4 層共享圖，可再選既有焦點；第 13 節點、第 17 邊及保持 12 節點／16 邊的第 5 層均拒絕；有效工作不淘汰 |
| C19、C22 保存／觀察 | SQLite 重讀、下一次 actual messages、既有分析／人物檔案重載一致，root／各父局部順序與單一活動可見 |

新 API **13/13**，連同 T1 API **37/37** 通過。`pnpm typecheck`、變更檔 ESLint、`git diff --check` 通過。完整 repository 適用回歸與兩軸 code review 由整合分支持續執行，不把本票局部測試稱為全 repo 通過。

`tooling/verification/browser-pursuit-graph-223.mjs` 使用真 WorldApp → API → SQLite 三輪；3 次 fixture 決策、0 次付費派送、1 個共享節點、1 份實際設計成果。兩次正常重新評估仍 continue 原活動起點 1260／截止 1320；下一實際 input 7711 UTF-8 bytes。1280px 分析／人物檔案重載和 390px 分析無水平溢出、0 pageerror。完整本機原件在 ignored `outputs/pursuit-graph-223`；下列為公開合成場景的篩選證據，已目視核對中文字、順序及活動連結。

- [共享與各層順序面板](assets/pursuit-graph-223/shared-order-panel.png)
- [手機分析](assets/pursuit-graph-223/mobile-analysis.png)
- [機械摘要](assets/pursuit-graph-223/summary.json)

後續 #224 負責各層主觀滿足／持續方向，#225 負責範圍改變與複雜退出，#227 負責完整滿載、來源遺忘、四角色及故障整合。這些尚未完成，不以本票將 #220、#229 或 #211 結案。
