# #263 正式精神電量啟用與完整旅程驗證

本票基於 #256 已完成正式 core（`366b781` integration），沿已批准契約 D，未修改政策數字或新增原生依賴。實作入口見[啟用契約](../design/formal-mental-enablement.md)。以下 API 使用真正 GET/POST、模型 transport 邊界與 SQLite；不是直接呼叫內部算式取代生活驗收。受控回覆只能證明契約、來源及記帳，不能證明真實模型的心理語義品質。

## TDD 與適當回歸

- 第一切片先驗明示啟用 API：`263-red1.log` 為 operation 未支援的真實失敗；`263-green1.log` 通過。第二切片先驗實際新城市：`263-red2.log` 為 schema 不接受開局設定，`263-green2.log` 修復。後續逐一加入來源、控制、保存及錯誤反例並跑綠；沒有將名稱包含 red 的既有成功日誌冒稱失敗證據。
- `node tests/run-activities.mjs tests/formal-mental-enable-api.test.cjs`：13/13。新檔已列入預設 runner。其中新城市預覽同時驗不合法目前80／未指定容量：無骰拒絕，合法草稿才於成功 start 形成65/46，原 ID 不重抽。
- 同 runner：啟用13、新城市六組22、人物建角6，共41/41（`263-city-final.log`）。新正式城市 fixture 改用真實五分鐘、向後開始與真正完成後觀察，沒有把新規則改為選配或放寬 inactive schema。
- 正式政策、既有精神／來源／成果／過程／調節／受控、個人需求與五分鐘九組125/125（`263-related-regression.log`）。這些正式 core 測試和既存隔離政策測試分開維持。
- typecheck 通過（`263-typecheck-final.log`），diffcheck 通過。同步 `25c790f` 後13組108/108（`263-integrated-regression.log`，含d100、時間修復、正式政策、個人需求、新城市），typecheck及diffcheck通過；lint 0 errors／4既有warnings（`263-lint-integrated.log`）。最終全套及 build 由整合者統一記錄，不將本地適當回歸寫成完整 npm test。

日誌根目錄：`/private/tmp/npc-handoff-20261109/`。首輪與最終browser日誌分開保留；資產連結對應最終合後版本。

## #255 T1–T14 正式承接

| 驗收 | 正式政策與應用證據 |
|---|---|
| T1 狀態分離與邊界 | 正式 core 的零／容量／精確階段案例；新 API 3/65仍低落且不可付5，合法獨立收入後才支付，卡片分開顯示。 |
| T2 時間與睡眠 | 正式 core 真實有效格、固定睡眠及已發生醒點；125項含身體自然醒、睡時餓渴、非預支恢復。GET/reload不變。 |
| T3 自主差異 | 真實作品完成不等同滿足；另一次合法獨立成果主觀評估才回電；低電仍可自主選擇，追求保持active。 |
| T4 過程向後修正 | 真實提案15分鐘、後續三次5分鐘才完成；純續做零新決策，介入後過程調整只向後。 |
| T5 來源去重 | 原 ID與reload保存來源收據，已消耗成果不再提供；既有正式／來源回歸覆蓋共根與別名。 |
| T6 負面負擔 | API後續明示負面過程，沿真實活動結算；既有過程／來源案例覆蓋負面來源一次性與不以台詞重扣。 |
| T7 調節交易 | 真實獨立成果收入後明示心理努力並扣5一次；不足、受控越權、純續做、回放均不多扣。 |
| T8 自然反應與調節 | 成果情緒與付費調節分開、合法null保留餘裕；真實request含優先考慮、至少小幅緩和及能承受就停止規則。 |
| T9 控制權 | takeover→direct rest→受控新過程→純續做→新陪伴，使用者活動不變，無自主費用／習慣；預算拒絕不多派。 |
| T10 輸入與畫面 | 斷言實際provider input無精確值／容量／policy／骰果；四張PNG顯示心情、電量、原始／整組實際收支、壞資料不可用。 |
| T11 隨機一致 | 真實初始化／原ID／實體SQLite關閉重開禁骰；正式core既存分段coverage／多角色／重載序列回歸。 |
| T12 故障原子性 | 下列故障矩陣，共同rollback精神／來源／心情／活動／物件，known用量保留，原ID不派；unknown與late沿既有回歸。 |
| T13 舊世界與入口 | 缺欄位明示啟用；null／空／未知／損壞拒絕；合法formal原樣保留partial coverage；舊追求gate、test隔離、production拒test；新城市真正start初始化。 |
| T14 證據界線 | 已記錄真實request規則、前後心情、心理努力與calls。fixture數值未成正式參數，沒有付費或正式世界驗收。 |

## 跨功能故障矩陣

| 邊界 | 觀察 |
|---|---|
| 精確開局矛盾／支持集部分合法 | preview／enable在抽樣前400；保持草稿／無精神狀態，合法80–90原權重兩端仍為80與90。 |
| saved null、{}、未知kind、損壞formal | 入口及factory拒絕重建；GET保留；UI不可用而非整頁crash。 |
| 同世界test／production test | 不轉正式、不回退fixture；production的新正式入口可用（僅本地fixture env，未操作正式世界）。 |
| 較後人物無效、非法來源、過期物件revision、lease失效 | 來源、心情、精神收入／費用、活動及效果共同回復；已知真實嘗試用量保存。 |
| 保存前失敗／CAS衝突 | 啟用與生活交易皆不發佈世界進度；原ID回讀結果，不重派或重抽。 |
| 保存後拋錯 | 保持已提交狀態、來源及一次費用；原ID讀回不再提交。 |
| 不足五點／受控越權調節／預算不足 | 不免費改心情、不換使用者活動，不因重送多call；後續合法選擇仍可繼續。 |
| 實體SQLite close→open | 同一資料庫及原ID讀回精確capacity/current及正式歷史，不補值、不重抽。 |

## 真實 WorldApp

可重跑 `tooling/verification/browser-formal-mental-energy.mjs`；受控固定時鐘，每次新 mutation遞增毫秒，原 ID回放不換 ID。首輪由整合者執行及目視四張圖，log `263-browser.log`；同步25c後定稿runtime的第二輪也PASS，log `263-browser-final.log`。本頁資產已更新為該最終輪，[JSON](assets/formal-mental-enable-263/evidence.json)：NPC2、judge1、feelings2；真實付費0。

- [明示啟用3/65、心情獨立](assets/formal-mental-enable-263/formal-opening.png)
- [實際d3過程、獨立d4成果與五點調節](assets/formal-mental-enable-263/formal-income-result-payment.png)
- [接管、新過程／陪伴與重載](assets/formal-mental-enable-263/formal-controlled-reloaded.png)
- [壞狀態安全呈現](assets/formal-mental-enable-263/formal-unavailable.png)

沒有部署、合併main、真實付費模型或正式世界推進。browser旅程沒有宣稱覆蓋 #276 branches提前效果／demo60分反例；合後108項已包含該票修復的真實API反例，最終全套由整合另驗。
