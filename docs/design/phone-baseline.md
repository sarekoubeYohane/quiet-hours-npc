# 手機工程基線（#188）

啟用在第一個成功 advance 的回合副本，GET 不生成裝置；每角色對應既有 kind=phone、owner 本人的第一件物件，沒有才首次配發。保存 schemaVersion=1 與 activatedAt；之後遺失／損毀不補生。舊訊息不回填。

手機身份及位置沿 WorldObject，私人資料在 World.phones.devices 中，永不放進 object.state。資料屬於手機，搬動與物主無關。操作要求實際可達且未被別人持有；擁有者的讀寫權與物理條件分開。一般 allowedTo 與持有不是私人資料授權。物主可以以 share 明示向某讀者分享指定資料；也可以用 display 將有限指定資料留在可讀畫面。其他人實際在可達手機上 read 已展示的指定項目，可以是未獲同意的閱讀，保存真正讀者，不解鎖全部內容。沒有可讀畫面則拒絕。

正常動作 type=phone，target=手機物件 ID，content 為 JSON：collection=memos，operation=list/read/create/update/delete/share/display，id、version、text、reader 依操作填寫。建立用新 id 與 version=0，更新／刪除等用已知有效版本。每次一項完整操作，沿現有15分鐘單次動作；不新增模型或附帶操作引擎。list 只取得 ID／版本，read 才取得原文。手機投影只有可操作裝置身份，不能遠端取得內容。

每裝置32則備忘錄，每則300字且最多1024 UTF-8 bytes，操作 JSON 沿現有500字契約；容量滿明示失敗，不刪改舊文。分享每項至多8人，畫面至多4項，讀者歷史每項至多角色數；這些值控制世界與模型輸入成長，並不表示產品平衡值由使用者指定。刪除明示移除目前資料；沒有自動FIFO。新增狀態與記憶、意圖、物件及活動同輪提交，既有journal負責故障及重送。

列表每頁8個身份／版本，可用offset繼續；只有實際展示的項目才建立presentation，連到當次短期經歷ID。同次決策依真正送出的短期／長期記憶核對引用；濃縮後未再保留明示身份／版本不會憑索引復活。每個角色／每筆外部紀錄僅保留最近一次presentation，最多32×角色數；刪項同步移除。readers亦只保留每角色最近一次真正閱讀，不累積逐次歷史。世界目前四角色；不新增人物生成機制。

手機操作失敗沿MemoryValidationError使整輪共同回復，不沿一般行動攔截吞掉錯誤，避免本次認知已保存卻假裝資料寫入成功。容量失敗透過世界API錯誤與既有錯誤UI可查；同operationId重試仍沿journal，不增加派送。share改變資料存取版本，過去引用不能繼續修改。display仍僅展示既有版本；手機被別人持有時，只能list/read其有限已展示畫面，無法修改。

最終審查補充：來訊沿原 action 的原始正文保存，含前後空白及換行，不套敘事文字的 trim／截字；空白正文及超過原 500 字行動上界明示拒絕。手機操作 JSON 的語法／shape 使用單一純解析責任，派送快照引用與真正執行前的版本、物理條件、私人可讀範圍仍分別驗證，不信任舊候選而略過重驗。

## #189 收件匣與送達基線

沿既有message聯絡人入口，發訊者須有本人可操作手機；對方裝置只需仍存在、active且未broken，不要求本人攜帶或清醒。成功送達在同一世界副本保存不可由收件人改寫的原文、from/to、deliveredAt、真正readers。送達事件只有發訊者知情，事件摘要沒有正文，發訊者自身經歷保留原文。收件人須真正list/read，閱讀只寫真正讀者；無回條或額外理解／回覆模型。裝置未提供有效收件條件，明示失敗，不造送達、不重試。

每部手機收件匣最多64則，每則沿原message最多500字。與32筆備忘錄分開，滿時停止而不默默刪除未讀；可由本人明示delete指定有效項目。list每頁8筆且不讀正文，read指定有效已展示身份／版本，第三人讀不改收訊人已讀。收件人可share/display有限既有內容，但不能create/update來訊正文。裝置由別人拿著時，即使物主或曾獲分享者也只能list/read目前明示展示的有限畫面，所有權不能穿透實際遮擋。持有不會取得他人的全部資料。

既有手機缺inbox欄位時，首個成功advance加空收件匣與inboxActivatedAt，GET不改。啟用前既有主觀記憶原樣保留；歷史事件audience、睡眠略過、缺失與已忘內容均不推算成readers或回填收件匣。歷史知情／閱讀狀態未知明示在觀察面板。不查舊trace復活正文。

phoneExperience延伸collection參數，共用裝置存取、有效版本、實際記憶來源與列表分頁；presentation上界每機（32備忘錄+64訊息）×角色數，不累積逐次歷史。私人trace的世界快照包含phones，用於驗證送達／讀取／故障，絕不進NPC輸入。#190沿deliverPhoneMessage回傳的device/message承接通知責任，本票送達不宣稱已通知或已察覺。

## #190 裝置通知與一次正常考慮機會

成功送達在同一回合裝置發出一次普通提示音。`emitPhoneNotification`共用message/reminder、資料ID／版本與condition key去重；依裝置實際區域建立外在線索，由真正perceiveEvent/D20判定每個角色的感知機會與察覺。通知不含正文、寄件人或對方意圖，不能將物主當聲音來源。關閉隔門與不同場所沒有普通提示音機會；同區噪音沿既有感知干擾。睡眠先沿共同刺激過濾，普通音不喚醒或擲骰。錯過的聲響不重播，未讀保留由之後主動查看發現。

每部通知最多128筆，每角色一份exposure狀態，只有真正短期感知來源仍在本次有限輸入時才列handle；每次最多4項，與原88KiB輸入共同受限。缺口明示。獨立`reevaluationOfferedAt`表示這批察覺已取得一次正常重新考慮的排程機會，避免被省略的多則通知每輪額外開模型；只有真正派送給該NPC的handle才有`handledAt`。未展示仍未處理，可在後來本來就需要的正常決策承接。這不是已讀、相信或安排完成。128筆硬滿明示回復，不默默刪未處理；不建立背景清理或額外AI。

通知資料、觀察、知情、排程機會、實際處理與活動同輪保存。continue沿共同活動進度；待命不被迫自主決策。短期觀察consume不等於notification已處理，不依全體游標一併標記。模型回想後重新依最終實際輸入綁定handle，原ID回放不再發音／擲骰／決策。

通知128筆達滿時，僅回收最舊的所有察覺均已處理、沒有實際察覺、或使用者／NPC明示刪除／取消／新版本取代的結算細節，notificationHistoryDropped明示缺口。未讀正文和未處理察覺不因回收刪除。每個目前來源另以notificationDedup保存最高recordVersion／generation／key，最多128來源，重載和舊generation不能重響；message generation=1，提醒generation沿共同條件epoch。舊聲音細節被釋放仍保留當前來源的去重。cancelPhoneRecordNotifications給行事曆明示取消／換版本使用，不偽造handledAt；明示刪除來源才釋放其去重handle。沒有背景清理／模型呼叫。

模型輸入採中性的self.noticeOpportunities，只有handle與實際可見observationIds；不將observer知道的手機來源、正文／寄件人或內部通知種類注入角色。D20誤認或模糊聲響沿原主觀內容，不以欄位名稱更正為「這其實是手機」。
