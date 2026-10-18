## Spec

**Final recheck: no unresolved Spec findings identified.** Reviewed integration `e21badf` against initial reviewed `9edcd27`, with unchanged original baseline `cab08092ac5204d997742ae7210225d59dad8018`; checked source changes and `docs/verification/routine-review-fixes-2026-10-18.md` against #108–#112 and the confirmed design.

Both earlier P2 findings are resolved:

- The 512-object limit is enforced at the authoritative materialization boundary (`lib/world-effects.ts`), including existing generators, immediate effects and activity phases. API regression preserves all 512 tombstones, generator sequence and paid NPC usage; replay adds no product or dispatch.
- `rawRoutineMaterial` consistently excludes finished vessel-bound servings across preparation, obstacles, rights and local completeness. The English-labeled exhausted coffee regression now completes a fresh coffee without restoring the old serving.

The additional integration fixes match the specification: requests for tea cannot consume coffee or silently substitute a specified cup; generic drink requests can consume the actual available serving. NPC method suggestions reflect known available beverages. Linked drink/cup transfers and consumption validate the complete explicit effects batch, preserving holder/region/content coherence without implicit delivery or recipient consent. Legacy unlinked cups retain their existing path.

Independent verification on the final source:

- Approved real world API/SQLite suites: **37/37 passed** (`routine-api`, `routine-obstacles-api`, `routine-sharing-api`), including the two previously reproduced defects and the new subject/coherence regressions. External execution log: `context/spec-final-api.log`.
- Actual Chromium #110 application fixture: **passed** tea → consume → same borrowed cup wash/return → reload → coffee → consume/wash/return → finite cake repeat → ordinary meal → operation replay. **11 NPC calls + 1 adjudication, 480 reported substitute tokens**, original cup owner preserved. Artifacts saved outside the repository; external log `context/spec-final-browser.log`.

No scope-creep finding. The bounded interpreter and controlled scene configuration remain disclosed engineering boundaries. These fixture results do not claim real-model behavioral diversity or satisfy independent #104/#106 production acceptance. No paid models, deployment, production reset or integration mutation performed.

Fixture follow-up `4dcabb6` reviewed against `e21badf`: no new findings. Browser #112 now explicitly transfers the visible linked serving and cup together using their actual revisions, then asserts both remain in the café after relocation. Assertions also verify 13 calls/520 substitute tokens. This fixture correction preserves the runtime continuity rule; runtime is unchanged. Parent independently reran #112 successfully (9 NPC + 4 adjudications).
