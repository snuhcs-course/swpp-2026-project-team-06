# PDF photo offline results (DEV-457/458/459)

The revised offline extractor reaches the motivating packaging-photo page and exports its two images at their native 400×266 resolution. This establishes a useful extraction prototype. It does **not** establish photo relevance, recovery accuracy, safe publication or improved generated-page quality. Per-photo human reference labels and explicit matches are still pending; DEV-459's adoption decision remains incomplete.

## Preserved development iterations

The sample was frozen before candidate extraction: six existing development PDFs, 68 total pages, 11 selected source-review pages. The same source bytes and sample were retained for both runs. No sealed holdout, provider call or production integration was used. Full aggregate data, exact code/library versions and anonymous per-PDF outcomes are in [results.json](results.json).

| Diagnostic | Frozen v1 | Predeclared v2 |
| --- | ---: | ---: |
| Processed / total pages | 8 / 68 | 45 / 68 |
| Skipped pages | 60 | 23 |
| Successful / partial / failed sources | 1 / 5 / 0 | 2 / 4 / 0 |
| Image/form occurrence records | 39 | 482 |
| Exported image occurrences | 10 | 62 |
| Distinct PNG assets | 9 | 58 |
| Total objects visited | 1,001 | 10,674 |
| Unique PNG bytes | 257,923 | 33,313,456 |
| Whole six-PDF batch wall time | 0.88s | 2.42s |
| Motivating packaging page | skipped by object cap | two native-resolution crops |

The v1 total-object cap of 200 counted text objects and stopped several documents near their beginning. This failure is retained. Before the v2 run, the protocol declared a 10,000 total-object cap and a separate 200 image/form-object cap. Other limits, filter thresholds, sample and proposed accuracy targets stayed fixed. The 23 v2 skipped pages are outside the 20-page limit. Partial sources also include two image-object-capped sources and one candidate-capped source. Forms/unknown geometry remain unsupported, rather than being silently removed from future recovery denominators.

An initial sandboxed CLI attempt failed because macOS denied process enumeration; no benchmark was claimed from that attempt. CLI handling was subsequently fixed and tested to kill/wait and record monitoring failures. Actual corpus runs used the permitted process monitor. Input SHA-256 values were checked against the frozen source index before and after both runs.

## Scoring and review status

The strict scorer returned PROVISIONAL / PENDING_HUMAN_REVIEW against the pending reference template and unmatched predictions. There are **zero verified photo labels**, not zero useful source photos. Recovery, relevance and placement accuracy are therefore not reported here. More exported pictures cannot substitute for those denominators. Synthetic tests verify the scorer's arithmetic and gates only.

A private three-page review packet includes the actual two packaging photographs, one other recovered photograph, original-page context and non-exporting outcomes. The complete private report retains all 482 occurrences, capped/unsupported outcomes and source warnings. The focused packet is a convenience view, not a replacement benchmark or product-renderer preview. No raw PDF or producer content is committed.

## Verification

- Combined target: DATABASE_URL set to isolated local farmclub_dev458, make test-pdf-photos — **53 Python tests and 15 Node tests passed**.
- Python Ruff on extractor and regression file — passed.
- Focused report browser checks: desktop 1440×1100 and mobile 390×844, 7 cards / 10 images each, **zero broken images, zero horizontal overflow, zero page errors**. Source/candidate photographs visually inspected.
- npm run test:mock — **507 passed, 0 failed, 0 skipped** in the permitted local-loopback run. The initial sandbox run was blocked by loopback-server EPERM and is not a passing test result.

## Practical boundary and next step

Keep the prototype offline until source-region labels, usefulness/product identity, crop integrity and visible privacy content are reviewed. Then score the same frozen sample and record an explicit native-gallery proceed/revise/defer decision under DEV-459. DEV-460/461/464 remain conditional product work; DEV-462/463 are optional. Human code review and DEV-412/413/433 release decisions remain required. Nothing was merged, deployed or enabled in the app.

maxOutputBytes and metrics.outputBytes mean **unique exported PNG bytes**, excluding JSON manifest/checkpoint metadata. CLI processing is monitored at 20ms intervals for time/RSS; parent hashing of at most 100MiB occurs before that child budget. No exact peak RSS was measured. The declared 512MiB threshold is not a measured usage claim.
