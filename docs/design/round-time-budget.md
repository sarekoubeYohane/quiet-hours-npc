# 完整回合的有界時間政策（#166／#168）

規格：[#166](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/166)，唯一工作票 [#168](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/168)。本文件是工程契約；[原診斷](../verification/round-deadline-diagnosis-2026-10-25.md)保留修正前證據，[Grill](round-deadline-grill-2026-10-25.md)記錄較長但有限等待的取捨。數值不屬於領域詞彙，不加入 GLOSSARY。

## 容量推導

N 是當輪角色集合大小，R 是當輪合法回想續答數，0 ≤ R ≤ N。聊天上限 C ≤ 2N + R ≤ 3N；一個 slot 最多一次初次決策、一次回想續答、一次裁定，玩家原有預算可能更早停止。這項修正不增加呼叫、重試、角色或模型。

| 成本 | 有限包絡 | 四角色預算 |
| --- | --- | ---: |
| 完整聊天處理 | C ≤ 12；每次 25 秒，包含該 signal 內的準備、派送、headers、body 與必要保存 | 300 秒 |
| 完整回想 | R ≤ 4；每次 10 秒，包含搜尋、索引及必要資料庫工作 | 40 秒 |
| 外層工作 | Key／guard、活動／驗證、signal 外保存等累計最多 60 秒 | 60 秒 |
| 工作窗口 | 12 × 25 + 4 × 10 + 60 | **400 秒** |
| 提交／回復與故障收尾 | 固定額外餘量，不續租 | **30 秒** |
| 固定租約 | 400 + 30 | **430 秒** |
| 前端 POST | 另容納受理前與 HTTP 交付累計 15 秒 | **445 秒** |

各格互不重複：聊天與回想窗口內的保存不能再算入外層 60 秒；外層工作不包含最終 CAS 與回復收尾。這是完整鏈的容量包絡，不能把 25 秒理解為純 provider 網路時間。單次與總截止取較早者；prepared 記錄不等於 fetch 開始。有限包絡的完成支援範圍是目前最多四角色完整鏈；沒有新增四人產品限制，更多角色仍可嘗試，但不能承諾完成。

這些上限是應用政策，並非 Cloudflare 固定執行時間。CPU、序列化、遠端 D1 與 provider 的正式表現仍待部署後另行授權驗證；本地受控時鐘不量測它們。任意慢保存、無限大世界或服務失聯不在成功保證內。單次工作須在截止前返回，邊界相等不承諾成功。永久測試的接近包絡例為12次聊天各22.9秒、四次回想各9秒、每個trace寫入0.4秒及58秒外層guard，實際394秒提交；派送checkpoint與網路可重疊，不把兩者再相加成實測耗時。

## 順序、停止與不可取消工作

NPC 仍逐 slot 決策，承接先前候選的可知變化。故事、記憶、意圖及回饋在同一次世界 CAS 提交；提交前技術失敗回復整輪，保留已知用量與未知標示。正常 denied／unsupported 仍是角色可知回饋。沒有並行 NPC、部分提交、續租、heartbeat 或背景接續。

必要保存維持 await 與原序列 queue。截止只能停止等待，不能宣稱底層 SQL 或服務已取消；晚到工作只能完成原本的證據責任，不能重啟 parser、決策、擲骰或候選提交。租約、版本、原 pending 與 CAS 共同防止覆蓋較新世界。CAS 拋錯先查 durable journal；已提交世界不因最後 trace 故障回復。資料庫完全不可用時回報不明，不能承諾所有用量立即持久化。

## 相容與恢復

新前後端共用等待政策。舊分頁的 125 秒計時器無法由新版 server 延長，新付費advance必須送出 `X-World-Time-Policy: round-v1`，否則受理前回426／clientUpdateRequired要求更新；原有已受理 ID 的查詢與精確回放仍可使用，不要求新header。受理前setup／租約取得超過15秒則在首次付費前停止；HTTP總截止也傳入工作signal及實際CAS時間fence，不能讓較晚受理的工作在回應停止後繼續。15秒是受理前與交付的合計餘量，並非兩者各15秒。既有 pending 依資料庫原存的絕對期限解析，不能套新常數延長或縮短。

重載、斷線及回到前景先以原 ID 唯讀查證。pending／uncertain 保留 sessionStorage 與原 payload，停用新的 advance；自動運行不能重疊。唯讀查詢不派送，已定案同 ID POST 精確重放原 status／body，不重套效果或計費。

## 證據與隱私

時間證據沿既有私有決策實錄保存：租約／工作／signal 截止、prepared 與實際 fetch、headers／body、usage 已知、checkpoint 與提交／回復窗口。缺失時間是未知，不能從差額猜 provider 或 D1 責任。沿用原 owner 權限、Key 遮蔽、1 MiB 單筆／64 筆／16 MiB 容量、淘汰、reset 與晚到 UPDATE 契約。

公開測試只使用合成資料；完整 transcript、記憶正文、世界備份及憑證不進公開 repo 或一般 logs。時間診斷不送進 NPC 輸入。lateUsage 是晚到證據，不重寫原定案費用或恢復執行。

本地驗收、故障矩陣與限制見 [#168 驗證紀錄](../verification/round-time-budget-168-2026-10-25.md)。泡茶 loop 仍由 #85／#106 的獨立正式行為驗收判定。
