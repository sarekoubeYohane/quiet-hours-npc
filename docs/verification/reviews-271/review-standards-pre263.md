## Standards

固定比較：`a9a0ef5...59d2955`；只讀已提交內容，不含尚未合入的 #263。

- **[P3] 明文規範違反：共同裁定限制重新分叉。** `lib/action-checks.ts:8–13` 新增 `enum:[8,12,16]`、`maxLength:100` 與 parser 的同組 literals；原 `adjudicationLimits.difficulties/maxValueLength` 仍供其他裁定限制使用。ADR `docs/adr/0003-adjudication-contract-boundary.md` 明訂「共同限制集中定義，提示與回覆格式盡量由此產生」。這次抽出 check 時反而移除原引用，後續調整原 limits 將漏改新 schema/parser。窄修：兩處改引用既有 limits；保留 d100 的獨立映射。

  **Smell（heuristic）：可能 Duplicated Code**，同一 hunk 的 difficulty/length 規則與既有 limits 重複；與上述同一問題，不另計 finding。

未發現其他可行動規範違反或 baseline smell。數學枚舉與只讀 validator 補證未代替 API 主行為，依既定 seam 不列缺陷；tooling 項目略過。指定 ADR 0011 在本 repo 不存在。

總計：1 項明文規範 finding（P3）；1 個相關 heuristic，非額外項目。
