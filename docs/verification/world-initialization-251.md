# 世界初始化整合驗收 #251

以 [規格 #238](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/238) 為驗收基準。

## 重現

使用 Node 22.13 以上及專案鎖定的依賴。設定 `PLAYWRIGHT_MODULE` 指向已安裝的 Playwright。若 Playwright 未安裝其對應的 Chromium，可設 `CHROMIUM_EXECUTABLE` 指向本機 Edge 或 Chromium。執行：

```sh
node tooling/verification/browser-city-251.mjs
node tests/run-activities.mjs tests/character-generation-api.test.cjs tests/city-creation-api.test.cjs tests/city-access-api.test.cjs tests/city-travel-api.test.cjs tests/city-phone-map-api.test.cjs tests/city-activity-hints-api.test.cjs
node --test tests/character-templates.test.mjs tests/scene-templates.test.mjs
```

瀏覽器腳本在 loopback 掛載正式人物、場景及觀察室元件，透過 HTTP 呼叫正式 API handler，以 SQLite 套用真實遷移。測試使用既有空帳號的預設開場，自訂城市由介面逐步建立。腳本捕捉真正的模型請求，外部傳輸由確定性的替身回覆。帳號身分及保存故障在測試環境注入。跨切片流程和個別票的反例使用不同層次的測試，對應如下。

本機 Chromium 執行完成五個階段，捕捉兩次角色場所描述與八次正常 NPC 決策。最後重讀的角色只有孟澄與秋杉，累計用量為 14 次模型呼叫。配套的正式 API 回歸共 11 項通過。

## T1–T12 與故事對照

| 組別 | 故事 | 可重現的結果 |
| --- | --- | --- |
| T1 範本與城市 | 1、2、3、4、6、7、8、9、10、20、34 | 瀏覽器建立兩位角色與含文字物件的場景。兩份同源場所分別命名，同住者共用一處，改動一盞燈後另一盞及來源保留原值。共用人物與場景範本的另存與保存錯誤由各自編輯器測試覆蓋。[人物](character-templates-240.md) · [場景](scene-templates-241.md) · [城市](city-creation-242.md) |
| T2 人物編輯 | 11、12、13、14、15 | 瀏覽器用自然語言生成後保存並讀回。模型回傳改寫建議，已填「安靜」及「沒有」原樣保留，空白背景採用生成內容。故障、重送與用量另有 API 反例。[人物生成](character-generation-243.md) |
| T3 開局關聯 | 16、17、18、19、21、22、23 | 瀏覽器分別指定住處、工作、所有與起點。自然語言候選、描述型起點、背景人物不進入回合，以及必要起點缺漏的阻擋與修正由開局整合案例覆蓋。[開局關聯](opening-relationships-244.md) |
| T4 NPC 描述及定稿 | 29、30、31、32、36 | 瀏覽器用兩位同住者的受控描述生成各自房間與共享杯，改名後共用物件仍只有一份。未選地點拒絕、明示配置優先及草稿衝突不進 NPC 輸入由初始化與知情測試補足。[定稿](city-initialization-246.md) · [認知](city-initial-knowledge-247.md) |
| T5 文字物件與連接 | 33、35 | 瀏覽器保存文字台燈、生成共享杯及 35 分鐘連接，台燈經正式裁定保存新狀態。門、被阻擋路線及既有房間物件的完整反例由定稿與移動測試覆蓋。[定稿](city-initialization-246.md) · [移動](city-travel-248.md) |
| T6 權限 | 24、25、26、27、28 | 瀏覽器設定個別授權並在預覽核對。實際授權測試涵蓋同源雙場所、區域覆寫、朋友授權、實際裁定及私有理由隔離。[權限](city-access-245.md) |
| T7 預覽改動 | 38 | 瀏覽器修改生成物件並確認保存版本使用新名稱。搬家時相依起點、權限與認知更新，明示公園起點與不相關設定維持，由實際掛載的編輯器與模型回合測試覆蓋。[認知](city-initial-knowledge-247.md) |
| T8 開始與全自訂 | 39、46 | 瀏覽器在生成、編輯與預覽後核對時間與回合數。開始後 SQLite 重讀與正常回合只保留兩位全自訂角色與兩個選用地點。 |
| T9 知情與手機地圖 | 37、42、43 | 實際模型輸入確認未讀目的地與隱藏物件未出現，只有讀取者下次請求收到公開目的地。裝置損壞、未讀內容、觀察者開啟檔案與私有道路的反例由手機地圖測試覆蓋。[手機地圖](city-phone-map-249.md) |
| T10 場景與移動 | 5、40、41 | 瀏覽器途中查看目的場景，角色尚未出現在房間內。到達後世界保存位置及手機位置同步；路線阻擋、重送與既有感知隔離由移動案例覆蓋。[移動](city-travel-248.md) |
| T11 活動提示與自由 | 44 | 真正 NPC 請求有本地可知活動提示，自由方法仍經裁定點亮台燈。相同提示因實際條件不同而允許或拒絕的反例由活動提示案例覆蓋。[活動提示](city-activity-hints-250.md) |
| T12 保存與隔離 | 45 | 瀏覽器旅程注入開始前保存故障及已提交但回應遺失，核對版本衝突、重送、用量、人物及場所未重複、第二帳號看不到自訂範本與城市。舊世界歷史備存另在城市 API 驗證。[城市](city-creation-242.md) |

## 程式碼審查後續

- 場景保存採草稿 UUID 與版本。SQLite 測試覆蓋新增與修改的提交前故障、提交後遺失回應、重送及競爭寫入。
- 新手動城市沒有已確認道路時保存空道路清單，跨場所移動須有可走的路。既有存檔缺少道路欄位時沿原本的移動相容路徑。場景範本可明示門的開啟、關閉或不通行，舊範本未設定的連接沿用開啟。生成不能覆蓋明示狀態。
- 開關未知的門、聽到門邊聲音或從門口看見他人，依各角色可知內容提供名稱。API 測試開啟受限房門，檢查操作者與旁觀者後續真正送入模型的內容。
- 開局為每位人物保留手機的物件容量。API 測試驗證兩位角色加 510 個場景物件可進入正常回合，加 511 個時預覽與開始會拒絕。場所／房間識別碼與城市操作的請求長度判斷分別沿用同一組定義。

可用上方 Chromium 腳本重跑跨切片旅程，並用下列命令重跑審查回歸。

```sh
node --test tests/scene-templates.test.mjs
node tests/run-activities.mjs tests/city-creation-api.test.cjs tests/city-access-api.test.cjs tests/city-travel-api.test.cjs tests/perception-api.test.cjs
```

## 環境與相容性

- 本機瀏覽器路徑使用固定身分與控制時鐘，沒有執行正式 OAuth 或部署。受控模型驗證產品採納、拒絕、輸入隔離及用量保存，真實模型的描述品質未驗收。
- 部分保存與權限反例使用 Node SQLite／實際掛載元件，而瀏覽器旅程用 Chromium 操作。表中個別證據標明覆蓋層次。
- 新世界啟動時在同一保存交易保留舊世界資料。開始操作與模型生成沿既有版本及重送契約。新格式寫入後，回退須保留新版資料與能讀取世界配置的執行器。單帳號多世界管理、歷史重開及範本自動同步均在規格範圍外。
