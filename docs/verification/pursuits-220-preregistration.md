# #220 L1–L5 獨立預登記（#228／#229）

本批使用新版分層追求與同次發散／收斂契約，與 #211 原批獨立。#211 的 JSON、場景、commit、checker 與未完成狀態均保留。此文件及 `tooling/experiments/pursuits-220.json` 是方案上限，**不是付費授權**。真實模型呼叫目前為 0；不宣稱 NPC 行為改善。

## 場景、順序與互動

公開合成場景為 `pursuits-220.service.scene.json` 與 `pursuits-220.creative.scene.json`，實際 SHA256 在同名 manifest。只含 seed 初始方向，不預植子追求、任務或承諾；服務場景保存普通食材的已知方法、有限麵包與明確耗盡舊來源。創作場景保留 Vera 自己的設定方向與原工作能力，店主接管待命。未讀私人內容不作條件。

| 組別 | 次數 | 公開合成互動與分支 |
| --- | --- | --- |
| L1 | 2 | Cass 在第一次合法 NPC 活動詢問現在有什麼可以吃的。 |
| L2 | 2 | Cass 明確表示想吃一份普通簡餐。 |
| L3 | 2 | Cass 只表示有點餓但還未決定；焦點角色自行提出協助後才接受。沒有提出則記未到達接受分支。 |
| L4 | 2 | Vera 在自己的房間與既有創作機會中自行選擇；沒有外部服務要求。 |
| L5 | 2 | 同L2起點；只有真實提交相關餐點承接、由外部controller人工讀證據確認並綁定run/trial/operationId/pursuitId/version/scope後，Cass下一個合法說話機會表示現在不需要餐點。無關整理、資訊only、拒絕或未確認均不觸發、不消耗變化機會；未承接或未變更保留未到達／未驗證。 |

固定順序：L1:1 → L2:1 → L3:1 → L4:1 → L5:1 → L5:2 → L4:2 → L3:2 → L2:2 → L1:2。每組最多8次15分鐘 advance，成果後仍保留下一次正常決策。任何停止保留全部10個位置與未到達分母；不延長、重試、換場景補成功。若創作合理時長需替代窗口，須另封存整批方案，在首筆付費前完成，不能與本固定批次混算。

`pursuit-partner-228.cjs` 明示控制非焦點 NPC transport，並非另一角色的自主行為。它只讀該角色真實 input：初次台詞一次；遇可知問題答覆一次；可知提出「幫你／替你／為你／願意…準備」時接受一次；可知要求同意且眼前真有餐點時，走真正 propose/consent。其世界裁定仍經真正 provider 流程。這些有限中文識別式可能漏掉不同措辭，原始證據保留，無法識別不能補焦點台詞或算成功。拒絕後不重複催促。L3/L5 的 partner receipt 僅表示受控分支是否到達，不是行為評分。

## 界線與停止

同一 payer 使用同一 private file SQLite；trial 間真 reset API 只重建故事，完整小時／累計用量、價格與玩家限制保留。初始 scene 安裝是本機隔離建置，不能在組內使用。live 使用真實 Date.now；15分鐘只從世界 advance.minutes 推進，不以假時鐘刷新用量。

payer資料及已用授權claim固定在output以外的private account.sqlite；同runId或授權reference換output不能重領，真正新grant也不換payer。既有未明派送會阻止新grant，先只讀原ID，不由刪除output繞過。L5人工確認只控制事前登記的partner世界內台詞，不注入焦點角色意願、記憶或動作，也沒有付費classifier。

方案全批上限：160次真正 provider forward、2,000,000已回報input+output tokens、US$1、首個派送起45分鐘。有效值取方案、明確有限授權餘量與原玩家政策的最小可用範圍。fixture角色回覆仍佔引擎原用量，不能扣除它製造玩家額度。全批有限餘量按逐次真正body bytes＋max output保守預留，玩家沿既有已知累計guard；單次回覆可跨玩家token門檻，已知用量照記並停止後續派送，不聲稱供應商硬切斷。可能提早停止，不能因此提高上限。

runner 遇 STOP 檔、technical error、pending／uncertain、unknown usage/cost、版本／scene hash不符、到限或私有證據缺口時停止新派送，只讀回原 operationId。重新啟動同 output 目錄會拒絕，不能換 ID、reset 或重骰補成功。獨立新批次須重新登記與授權。

## 判讀

逐試驗分列形成、承接、有效推進、滿足／暫時足夠、實際世界成果、合理等待、可知受阻、拒絕、縮小／放下、無新資訊反覆、技術中斷與不足。候選未採用不等於拒絕，候選缺席不證明沒想到，短自述不等於完整內部因果。

完整成功鏈須由真實焦點模型形成跨行動追求、在至少兩次正常決策維持身份／範圍、帶來相符成果或可核對新資訊，並在後續依本人可知結果明示滿足。L1–L4 各2/2才稱重複通過，1/2部分、0/2未證實；通用能力至少一個服務組和 L4 重複通過。供餐改善另須兩次真實準備／取得／可取用或交付，縮小範圍不算原大成果。

L5 須先有真實自主承接、實際可知變化、明示改變及一致下層／活動處置；繼續原追求不代表退出通過。三次正常決策實質重做且無新進展才列反覆，排除純續做及合理等待。runner 自動輸出永遠為 `unassessed`，人工評讀必須保留失敗與未到達樣本。

沒有新舊可比預登記對照只報新版觀察，不能歸因發散策略；受控回覆只證明程式承接。#220、#229、#211 與其他原問題均不因此關閉。

## 首筆付費仍缺

最終已 review 的產品完整 commit、runner digest、正式封存參數／場景／順序、官方價目原件及hash、使用者明確有限授權（payer/scope/run/expiry/各餘額）、可用憑證的指定來源與原玩家餘量。預檢不讀真 Key，亦不呼叫 provider 探測；本 prompt 沒有付費授權，#229保持未完成。

2026-10-29另完成零派送官方文件預檢：[gpt-6-luna官方模型文件](https://developers.openai.com/api/docs/models/gpt-6-luna)。私有來源原件4111bytes，SHA256 `20b10b062d96a4b0745f7675624c564271a229046c5fafc9e63c76f776dcee59`；Standard短context列input US$0.10／output US$0.50／cached input US$0.01每百萬tokens。官方另列>272K完整request倍價、Fast 2倍及regional +10%。此處只記已查證來源，不公開整份官方原文、不把合成測試價目升格；實際account/tier與適用價目尚未核對，仍須首派前另封存，default manifest仍未paid-ready。
