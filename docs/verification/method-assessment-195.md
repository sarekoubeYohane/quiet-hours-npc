# #195 本地機械驗收

新`tests/method-assessment-api.test.cjs`透過世界API、SQLite保存／重讀、實際request/messages及私有實錄驗證。明示固定NPC／裁定transport替身，預載no-network禁止未預期外網。`tests/method-assessment-fixture.cjs`只提供可重用的v2wire建構，不執行測試或建立世界。

首個反例：新巢狀回覆未被舊解析接受，API返回502。完成後檢查同次目的、來源、選擇、意圖與實際行動一起保存至私有追溯，原ID重送零派送；下一次真實request含已提交行動回饋。另覆蓋換來源、等待、重試、放下、新活動無歷史與自主continue；程式自動推進不捏造評估。未知／失效來源、矛盾action/type/target或未知intent引用回復整輪，保留已知用量，沒有付費修復。稍後角色格式故障與保存衝突分別保留rolled-back／not-committed候選語義。

直接使用實際派送schema編譯驗證：propose的空／純空白purpose與content不合法，普通休息空purpose合法；schema根層為object，分支在action下。versionless／v1舊回覆保留兼容。最小操作證據保留巢狀action，沒有方法評估或心理資料。

方法評估與操作證據回歸26/26通過，typecheck及相關ESLint通過；舊attention／continue／model-contract／routine-world-changes的schema及版本斷言已改指v2實際介面。更廣回歸與兩軸review結果由整合追加。

`tooling/verification/browser-method-assessment.mjs`走真正WorldApp→API→SQLite→重載→下一次request→分析畫面，兩次NPC正常決策、一次普通裁定；從尚未執行結果自主選等待，實際引用來源，讀取／重送零新增派送。輸出`assets/method-assessment/summary.json`與截圖，不是假歷史原件。真實NPC是否採納、是否再重複未驗證，不宣稱loop解決。

兩軸review：Standards零項。Spec指出2KiB個別評估容量未在實際提示公布，已補明示2048 UTF-8 bytes（含JSON欄位／引用），並以實際API驗證2048接受／2049拒絕、同ID重送零新增派送；schema字數合法不單獨代表符合共同byte預算。較廣相關回歸63/63通過，新增容量邊界後集中評估7/7通過；typecheck與相關ESLint通過。整合分支仍須完成跨票回歸與最終複核。
