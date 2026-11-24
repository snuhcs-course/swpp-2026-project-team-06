# DEV-464 local reference validation

Base: 22b66cc5; branch zahra/dev-464-source-guided-reference; draft PR816. FEAT-03/04/07, AC-SRC-1/2/5/7/9/11, M-11/13/18. No backend/schema or default caller changes.

| Execution | Result |
| --- | --- |
| node --test scripts/test-source-guided-story.mjs | 13 passed, 0 failed |
| npm run typecheck | all five workspaces passed |
| npm run test:mock | 507 passed, 0 failed, 0 skipped |
| Local Chromium 360/390/430/1440 plus five fallback modes | 51 assertions passed, 0 failed |
| Exact source-region/native-dimension and rejection checks | 21 passed, 0 failed |

The browser verifies exact 35-item saved text/order, five intended contextual placements, no horizontal overflow or uncaught page errors, bounded desktop width, invalid/default fallback, hidden group exclusion, empty inputs and honest failed-image display. The coordinator inspected the complete mobile capture and opened size-guide viewer. Individual assertion counts are not independent quality samples.

Initial localhost IPv4 connection failed because Expo listened on IPv6; localhost then succeeded. Initial screenshot clipped the ScrollView below its viewport and was preserved; capture viewport expansion fixed it. Private fixture TypeScript inference was fixed before the successful typecheck. No failures are recast as product-quality successes.

The assistant curated this one design and five source regions. No automatic planner, segmentation accuracy, new product-model call, human acceptance, production save/apply workflow, release adoption, merge or deployment is claimed. Frozen copy still repeats content and has detached quantity lines. Private source text, regions, fixture, full logs and captures remain outside git. Existing revisions stay archived when the new private comparison is published.

Final viewer regression: original Escape failed because focus stayed outside modal. PrivatePhotos web onShow now focuses close button. After waiting for opening animation/focus, 23 additional actual-browser assertions passed/0 failed (five native dimension/aspect/no-upscale checks plus viewer open/button-close/Escape). Full mock suite rerun after fix: 507 passed/0 failed/0 skipped. Existing 51-assertion layout matrix is a separate check cohort. No change to story pixels or frozen text.
