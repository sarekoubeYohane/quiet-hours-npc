# #128 模型確認日常階段與效果

依 [#125](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/125) 與 [#128](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/128)，基於整合提交 `84ea862`，沿用已驗證的 #126／#127 與獨立 PR #124 的 #122／#123。未部署、未重置正式世界、未呼叫付費模型。本票完成確定日常；不宣稱 #129 不確定日常結果分支已完成。

## 實際新增能力

`routine.version=2` 保存完整核准範圍的 `programs`，每項包含 operation、起始準備 effects 及確認時點的 stages。模型確認受限 materialize／consume／transfer／state 與時點；不是只選舊 brew 程序。咖啡館一次確認六項、住家保持原有較窄範圍。規則保存符號角色，不保存首次杯子 ID、revision 或骰子結果。

純 schema／程序驗證／提示位於 `routine-program-contract.ts`；`routine-programs.ts` 綁定當前角色，編譯成 #127 共用 branches／既有 Effect。原 binder 保留 #123 的杯子與工具區分、知情、權限、有限材料及背景供應選擇；其舊候選只提供合法引用，v2 不執行舊內建效果。實際效果與各階段模擬、執行仍使用既有效果驗證器，活動進度及物件同回合保存。

可選角色的省略條件由程式固定：沒有明確原料時 materialSupply／material 為背景而略過；使用現有杯子時沒有 vesselSupply；拿取已持有的杯子、已滿足的 state 不重做；clean 欄位未宣告時略過該欄位。這些不允許繞過短缺、明確指定、工具或權限。必要的 vessel／drink／product 由合法 binder 承接，程序須明列普通成果與消耗步驟；不完整、越權、重複供應、提前完整成果及不能安全重綁的批次均拒絕。綁定後仍限制每批 4 效果／4 物件前提。

program 內的 effects 是受限起始準備，與一般自由分支頂層 effects 的最終成果語義明確分開。此表示保留 5 分鐘對齊一回合時「有限原料＋新杯子」的準備批及完成批，不擴大單批容量。完整茶／食物仍只在最後確認時間出現。明確上限不足時先保存合法規則，未建立供應候選、物件或骰子。

version=1 舊規則及舊合法空效果核准保持原義與既有執行，不補造模型確認紀錄。新送出的提示要求 v2；只有實際提供日常 offer 才派送程序規則，避免對一般自由活動增加無關提示及截斷診斷。整個既有裁定契約集中化仍屬另外的 #136–#139，並非本票已完成。

## API／SQLite 與 red-green 證據

使用正式 GET／POST handler、SQLite adapter 保存與 API 重讀，僅控制模型 transport 及隨機輸入。沒有私有函式呼叫順序驗收或測試專用 UI。

- 首個新測試在實作前回 502「日常規則核准格式無效」，實作後完成首次水→茶、第二只杯子重新綁定、零新增裁定與零骰。
- 六操作測試先捕捉 return 杯子仍由 owner 持有，修正符號引用後通過；不完整程序反例先回 200，加入必要承接檢查後回 502 並原子回復。
- 有限原料測試檢查 raw 單位確實消耗，後續階段不再要求已消耗原料仍 active；取消保留已提交消耗、水與杯子並清除未來茶。
- 新增 API 測試 11/11。最終針對性回歸（本票、#122／#123、裁定診斷）26/26；完整活動 runner 380/380，0 fail／skip。最後程序靜態防護追加後，再由上述針對性回歸核對。
- 覆蓋六項操作免費重用；不同杯子；明確髒杯、他人持有、有限杯子短缺、工具損壞／移走；舊角色缺 region；44 分鐘對齊 45；5 分鐘對齊 15；上限不足；起始成果偷渡；無效未使用程序；保存前故障、保存後提交不明、版本衝突與同 operationId 重送。已知 2 次派送用量在技術故障仍可重讀。
- typecheck、變更檔 ESLint、diff-check 通過。整合後仍由父流程執行完整 test／build 與獨立 code review。

## 真實應用 Chromium

`node tooling/verification/browser128.mjs` 使用真實 WorldApp、既有畫面控制、正式 handler 及 SQLite。模型為明示 transport fixture。

首次核准→15 分鐘水→重載→30 分鐘茶；新活動重新綁定 cup-b、零新增裁定；暫時接管取消後保留 cup-b 水並移除 pending 茶；交還後使用 cup-a 喝茶、清洗、歸還。同 operationId 重送與 UI／API 重載後物件身份、狀態一致。共 **5 NPC／1 裁定／0 骰子**。

重載後照既有 browser119 流程重選 OpenAI 決策方式；第一次腳本未重選而回到 demo，不能將該次未完成當成功，最終腳本已修正並重跑。

截圖：[不同杯子重用](assets/routine-program-128/rebound.png)、[取消、清洗及歸還後](assets/routine-program-128/cancelled-washed.png)。執行環境沿 `tooling/verification/README.md` 的 Playwright／Chromium 設定。

## 輸出容量與限制

六項完整 fixture 序列化 2,210 字元，低於 8,192 候選容量；未提高既有輸出額度。本機捕獲裁定 request 的 max_completion_tokens=4096，較小模型及其他供應商沿原設定 2048。fixture 使用量為替身數據，沒有用它推論真實 tokenizer 數量或模型可靠輸出率；真實模型是否能在額度內穩定提出合理程序尚未驗證。

以上是本機 fixture／SQLite／真實應用瀏覽器驗收，不是正式站或真實供應商驗收。#129 的必要判定、失敗／部分成果分支及重試身份仍待下一票，沒有把普通活動零骰當成不確定結果已完成。
