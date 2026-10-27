# 手機工程基線（#188）

啟用在第一個成功 advance 的回合副本，GET 不生成裝置；每角色對應既有 kind=phone、owner 本人的第一件物件，沒有才首次配發。保存 schemaVersion=1 與 activatedAt；之後遺失／損毀不補生。舊訊息不回填。

手機身份及位置沿 WorldObject，私人資料在 World.phones.devices 中，永不放進 object.state。資料屬於手機，搬動與物主無關。操作要求實際可達且未被別人持有；擁有者的讀寫權與物理條件分開。一般 allowedTo 與持有不是私人資料授權。物主可以以 share 明示向某讀者分享指定資料；也可以用 display 將有限指定資料留在可讀畫面。其他人實際在可達手機上 read 已展示的指定項目，可以是未獲同意的閱讀，保存真正讀者，不解鎖全部內容。沒有可讀畫面則拒絕。

正常動作 type=phone，target=手機物件 ID，content 為 JSON：collection=memos，operation=list/read/create/update/delete/share/display，id、version、text、reader 依操作填寫。建立用新 id 與 version=0，更新／刪除等用已知有效版本。每次一項完整操作，沿現有15分鐘單次動作；不新增模型或附帶操作引擎。list 只取得 ID／版本，read 才取得原文。手機投影只有可操作裝置身份，不能遠端取得內容。

每裝置32則備忘錄，每則300字且最多1024 UTF-8 bytes，操作 JSON 沿現有500字契約；容量滿明示失敗，不刪改舊文。分享每項至多8人，畫面至多4項，讀者歷史每項至多角色數；這些值控制世界與模型輸入成長，並不表示產品平衡值由使用者指定。刪除明示移除目前資料；沒有自動FIFO。新增狀態與記憶、意圖、物件及活動同輪提交，既有journal負責故障及重送。

列表每頁8個身份／版本，可用offset繼續；只有實際展示的項目才建立presentation，連到當次短期經歷ID。同次決策依真正送出的短期／長期記憶核對引用；濃縮後未再保留明示身份／版本不會憑索引復活。每個角色／每筆外部紀錄僅保留最近一次presentation，最多32×角色數；刪項同步移除。readers亦只保留每角色最近一次真正閱讀，不累積逐次歷史。世界目前四角色；不新增人物生成機制。

手機操作失敗沿MemoryValidationError使整輪共同回復，不沿一般行動攔截吞掉錯誤，避免本次認知已保存卻假裝資料寫入成功。容量失敗透過世界API錯誤與既有錯誤UI可查；同operationId重試仍沿journal，不增加派送。share改變資料存取版本，過去引用不能繼續修改。display仍僅展示既有版本；手機被別人持有時，只能list/read其有限已展示畫面，無法修改。
