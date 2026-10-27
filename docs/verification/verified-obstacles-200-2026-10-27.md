# #200 有依據障礙免費重驗

基線為整合 #194／#199 的 `7022599`。沿世界 API、真實活動與效果、SQLite 重讀及下一次實際 request/messages，使用明示 NPC／裁定替身；子程序載入 no-network 邊界，不呼叫真實模型。

- Red：已確認、不含 background 的指定有限供應耗盡後，alias 重試仍新增第二次裁定；已確認指定杯子必要狀態不成立時同樣重複裁定。
- Green：已知有限供應／指定物件的可驗證前提不成立，直接在原程序 guards 上純重驗，無新增拒絕庫；每規則最多32條 server-only 來源核准關聯，依 operation／role／type／身份精確辨識，舊規則讀取不補造。相同 alias 重試新增裁定0、無關 hidden 環境改動不失效、新合法供應可承接。每次仍有正常自主 NPC 決策。
- 回歸揭露並修正：直接對所有新對象 state mismatch 否決，會阻止「深茶漬」另確認第二 scope；加入有界來源關聯後，新來源可正常確認，而同句多 scope 仍優先選可執行者。原同環境已清潔後重試改為免費驗證既有前提，不再要求額外否決裁定。
- 真正授權恢復：物主 Cass 的自主替身另行提出 grant 並經世界效果提交，之後店主才可取得她的供應。請求不代替物主同意；回合輪替使物主先行授權時，後續店主可於同輪依最新條件承接。
- 真正修復恢復：杯子從 clean 經授權 change-state 成 dirty 後，原已確認清洗方法再次免費實際執行；舊否決不永久封鎖。
- 技術對照：缺失 link、編譯效果不成立及無已確認程序的 unsupported，仍走原單次例外，三次提案三次裁定且沒有消耗，不保存 explanation 禁令。
- 保存故障／CAS 與較後角色錯誤：本輪可知回饋、audit、規則、物件及供應共同回復，已知費用保留；原ID重送不重派。既有已提交程序及前輪成果保持。

人工 fixture 不是 #184 私有原件重播。沒有取得原始 transcript，本地資料不支持真實 NPC 行為改善或 loop 已解。沒有已確認且可機械檢查的方法／前提時仍會有有界例外費用；這個缺口明示保留。後續真實模型觀察須另有部署及有限付費授權，並固定版本、隔離故事及call/token/時間邊界。

另以本人身體前提建立紅例（手腕狀態已解除後原方法仍重裁），再驗證同 actor 的已確認身體條件免費重驗；真正身體狀態變化後同方法再次執行。另一可見明示 target 也沿相同身份及 guard 驗證，不替其決定配合。來源關聯容量案例保存32條後，合法新來源仍可免費綁定、最舊釋放並累計1，不靠每輪清空；NPC request沒有 `confirmedSources` 或私有障礙診斷。免費否決後的下一次實際 request 能沿 #194 看到帶來源與時間的本人「尚未執行」經歷，而非權威隱藏原因。

驗證結果：7項新案例連同 routine-world-changes／routine-obstacles 合跑48項通過；補身體與容量案例後新套件另行全跑9項通過。TypeScript typecheck、變更檔 ESLint、whitespace 檢查通過。切片自檢分開核對 Standards（集中guard／保存責任、無付費新層）與 Spec（舊scope／新來源、資訊邊界、原子性），整合流程的獨立兩軸 review 另記，不把自檢稱為獨立 review。

整合最新 #195／#197 後，本票替身已改成實際 `npc-decision.v2` action／methodAssessment 封套並捕捉 v2 request；修正測試中舊 v1 篩選／分流假設。與 partial-drink／method-assessment 合跑24項通過，合併後 typecheck、ESLint、diff-check通過。跨票組合 fixture 仍不冒充真實模型行為。

Spec review 發現 P2：只保存來源身份，會把同杯 light→none 後另一活動改成 heavy 的情況永久否決。本票先新增公開 API 紅例重現裁定次數2而非3，再加入必要前提指紋及真正階段提交的範圍更新；綠例同杯 heavy 正常取得第二 scope，未變 none 重試仍免費。另驗證預檢不能保存尚未發生的 none，較後階段存檔失敗使效果與新指紋共同回復；模型注入 `routineSourceScope` 被純解析拒絕。未以未提交的候選或預測狀態充當已發生世界事實。

P2 修正後，相關 routine-world／partial-drink／obstacle 組合53項通過；最後加入模型 metadata 注入控制後，本票12項全通過。typecheck、變更 ESLint及diff-check通過，尚待整合最終完整回歸與獨立 review 複查。

獨立 Spec review 的 P2 已由另一執行者重跑原始反例通過、無殘留阻擋項。Standards 複查指出權利 predicate 重複，已改用既有 `hasObjectPermission`；相關延後呼叫的 runtime import 經12項 API 全通過，typecheck、ESLint及diff-check通過。
