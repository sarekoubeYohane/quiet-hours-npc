# 開局完成導覽原帳號與混版場景覆核

本輪修正 #288 完整垂直切片的兩個獨立已重現 P2，沒有開始 #289。原 `80b9689` 已通過的帳號寫入 guards／原操作恢復保留；本輪不宣稱整份 #281 完成。

## 提交後切帳號的完成導覽

原真 App Router 反例在本樹 `d061da2` 重現：A 與 B 經產品 API 形成人物卡、保存開局，使用同一 public save UUID。A 建立已提交 201，但 hold 回覆期間只將 Cookie 換為 B（未卸載原頁），釋放後裸 save ID 導入 B 的既有世界。A 的新世界其實也已保存。log：`/tmp/quiet-hours-context/t7-late-nav-red.log`（controlled 2、paid 0）。這是完成導覽缺少原 owner 前提，不是原保存寫到了 B。

`5face37` 採共用 `boundPath`，將原 raw owner 隨已綁資源的 URL 傳遞。SSR 先驗真正登入帳號與 expected owner，再讀資源；query 只是前提，不能代替 Cookie 授權或用來讀他人的資料。裸直達頁先 canonicalize 到當時帳號的 bound URI，之後重載仍保留該前提。錯帳號明示返回選檔，A 已提交的世界不回滾、不重送。

同一規則套用完成卡／開局製作頁的 author 與安全 returnTo、草稿 replaceState、選檔／草稿接續／重新開始、已完成草稿連結、另存完成後導覽與共同導覽。returnTo 只允許本站 `/new` 的單一合法 draft／同 owner，拒絕外部網址、其他參數、重複參數與錯 owner。fresh `/` 明確建立新的選檔 context，不強行沿用原 owner。SavePicker 以 SSR 原 owner 固定列表讀取，不能因兩次讀取期間 Cookie 改變而混入另一帳號的草稿。

固定 `5face37` 的 `browser-opening-bound-owner-288.mjs`：相同 held 201 回覆後回 `/?accountChanged=1`，不顯示 A 或 B 的故事；A 正確已存、B 既有世界不變，兩者 turn 0。五種 bound SSR 入口錯 owner 均拒絕；切回 A 可續讀剛保存世界。controlled 2、paid 0；見本文件同名 assets 的 navigation 圖與 evidence。

## 同源場景版本各自保留

原真 API／SQLite 反例在 `d061da2` 重現：v1/public 場景已凍結，來源更新 v2/private，再將同一來源的 v2 加入同一開局。原 draft snapshots 與 world source.version 都正確，但 access 只按 ID 找第一份 v1，誤把新場所保存成 public／允許 npc:1。log：`/tmp/quiet-hours-context/t7-mixed-versions-red.log`。

新增真產品 API 反例先 RED：`/tmp/quiet-hours-context/t7-mixed-version-api-red.log`。修正 `prepareCityAccess` 按 configuration 的 id **及 version** 取快照；同來源不同版不受限制，既有 v1 不洗成 v2。查核 city-creation 與 opening-drafts 的來源查找已按 id/version；UI 合併庫／已保存來源也改 composite key，混版選項清楚顯示版本，room lookup 使用同一版。

固定 `5face37`：opening API 16/16（新增混版 preview→保存→產品 GET，含各自房間／門／物件／權限、原卡值與取骰次數不變）；`browser-opening-scene-versions-288.mjs` 真頁接續 step 2，可分別選 v1/v2、在配置選到不同房間、重載仍保留兩版，最後確認及保存原 v1/public、新 v2/private，各 turn 0。controlled 1、paid 0；見 scene-versions 圖與 evidence。

## 舊 reset 驗收與 Workers setup

`acceptance-scene-api.test.cjs` 原完整檔兩處仍期待新 reset 400，本樹窄跑已確認實為正確退役 409（原 log `t7-acceptance-retired-red.log` 保留）。改驗 409，且對完整 SQLite world row 與 player_accounts row 前後逐值相等，包含 acceptance／原故事／帳務。沒有放寬 guard，也不把只讀零用量 window 投影時間差當保存改動。整檔 9/9 通過，包含後段預算、不可壓縮 backup 與舊備份還原正例。

已合純 Workers setup `7bb7b4b`：普通 post 使用 first cookie 初始 GET 捕捉的原 scope，明示 scope 不覆寫；原 AES、TTL、密文損毀與大型 backup assertions 不變。本樹 `5face37` 實際 Workerd／D1 全檔 1/1 通過（`t7-5face-worker.log`）。

## 固定驗證與未涵蓋範圍

- `5face37` 新兩 negative 真頁、normal 五步／返回修改／author-return／草稿接續／兩世界各續玩 2／1、durable 關閉重開、同帳 pending 恢復及 analysis 兩私有證據 reader 均通過；每條 normal／durable／analysis 各 controlled 1、paid 0。
- 原 WATCH1 異帳草稿假同步與 WATCH2 卸載後 late-create 導覽，setup 及 URL assertion 升級後通過，controlled 1、paid 0。fresh `/` 的 assertion 明確不要求 owner，避免將新的選檔 context 誤判失敗。log `t7-5face-recovery-rerun.log`。
- `71888ee` 受影響 acceptance／city access／creation／travel／phone map／world configuration 24/24 通過。首輪 23/24 唯一舊 DOM selector 只認裸 `/new`，已改驗 `/new` 且原 owner，沒有放寬產品條件。
- `71888ee` typecheck、lint（0 errors／4 個原有 warnings）、build 通過。四支舊 modern browser driver 只升級 bound URL assertions，語法檢查通過；沒有宣稱本輪逐支重刷。

root 固定 `5bdc6db` 的原 full 結果仍是 core 1265/1267（兩個上述舊 reset assertion），補組 auth40/40、assets61/61、Workers14/15（唯一 setup 已合修）、source-pin21/21；各 raw exit1 log 保留，不能合算為一次全套通過。這批舊 full 不包含本輪兩 P2 修正，最終 #289 後仍須 fixed integration 的完整現行套件。

全部本輪模型結果皆受控 transport；真模型語義品質未驗收。未付費、未動正式世界、未正式遷移、未推送、未關票。

最後補強 `49f6d85` 固定真頁：從只有已凍結 v1 的開局草稿開始，來源更新 v2 後，在真場景步驟實際點「加入 同源場所（版本 2）」。保存後在配置來回選兩場所得到各自房間，重載、確認並完成世界保存；舊 v1/public、新 v2/private 仍獨立，門／物件與原卡值維持正確。controlled 1、paid 0；scene-versions assets 已更新為此版本，evidence 明示 `addedVersionViaUI:true`。這次新增僅擴充驗收 driver，產品 runtime 仍 `5face37`；target ESLint 另通過，未為純驗收腳本再次跑整份 build。

獨立覆核：Spec 固定 `5face37` 原 late-navigation 與 mixed-scene 反例各 remaining 0（controlled 合計 3、paid 0，原 A 已存／B 不變／各 turn 0、正常 A author-return、preview/save/read 權限一致）；Standards 本輪 hard 0／judgment 0，opening16/16 及同帳恢復＋兩分析 reader GET200／turn1／新增 POST0 也獨立確認。此結論僅本輪 findings，不等於最終完整分支 review 或 full suite。
