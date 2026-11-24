# DEV-453: extraction evidence diagnosis and Korean line-wrap repair

The saved extraction losses have multiple causes. A narrow validator defect is reproducible: removing a physical line break **between Korean syllables** can make an otherwise verbatim quote fail. This prototype repairs that layout case and preserves all other evidence/safety checks. It does not reclassify historical tables, broaden OCR/page limits, change gold/scoring, or claim better page quality from a validation replay.

The product boundary is documented in [Korean](../../spec/source-evidence-layout.md) and [English](../../wiki/Source-Evidence-Layout.md). Complete aggregate evidence and private artifact fingerprints are in [results.json](results.json). Raw source text, candidate values, source paths, span reconstruction, detailed traces and replay script stay outside git.

## What was investigated

The prior original-source audit identified 15 critical-selector matches in stage-1 rejection diagnostics, not 15 independent lost candidates or proven extraction errors. This follow-up traces **16 rejected candidates** from three existing development sources (two PDFs and one long image), alongside all 68 accepted candidates from those sources. The two denominators differ because selectors/facts/candidates do not map one to one. No new original-page visual review or full-corpus diagnosis is claimed.

| Saved rejection | Candidates | Cause and decision |
| --- | ---: | --- |
| HISTORICAL_FIELD | 6 | Model returned historical=true with composition and priced table content. Rejection follows the current contract. Do not silently flip the flag or strip prices to publish a current offer; adjudicate applicability/currentness separately. |
| INVALID_EVIDENCE | 8 | Quote differs only by a single line wrap between Hangul syllables. Recover the exact source substring; keep candidate text and evidence references. |
| INVALID_EVIDENCE | 1 | Quote also joins a digit-to-Korean boundary. Leave rejected; numeric-boundary normalization is outside this fix. |
| INVALID_EVIDENCE | 1 | Actual wording changed. Leave rejected, even when semantically plausible. |

The prior PDF audit placed the relevant facts within the existing page cap. Nothing here supports raising that cap or replacing OCR. The earlier broad claim that most losses occur in page assembly remains provisional: accepted facts, validator losses, placement and scoring/label disagreements must be measured separately.

## Reconstruction and replay limits

The original provider request chunks were not retained. The saved safe-text file preserves local text plus a flat remote OCR transcript. The private script identifies the remote layer and searches page offsets that reproduce **all accepted evidence quotes** using their page-local span ordinals. It proceeds only where each required page has one unique offset, and checks the referenced ordinals against available text and subsequent anchored-page bounds. This is bounded reconstruction, not a complete reproduction of OCR, crop boundaries or original provider requests. If alignment were ambiguous, the script would stop rather than guess.

The replay inventory is **68 accepted + 16 rejected = 84 saved candidates**, with no new cohort or generation. Each is submitted independently to the same per-candidate validator with either the historical canonical-quote function or the proposed one. The historical function is extracted from baseline ef390bde; it first must reproduce all 68 acceptances and all 16 saved rejection codes. Every previously accepted candidate's value and stored quote must then remain identical under the proposed matcher.

The private script also verifies unchanged extraction prompt body, unchanged original asset hashes, and unchanged hashes of all 11 tracked source/snapshot/audit inputs. It makes no provider calls and does not run a scorer or edit gold. Private artifact and code hashes identify this replay; later code changes require a new replay/version rather than reusing these fingerprints.

## Result and interpretation

The historical outcomes reproduce exactly. The new matcher retains all **68 existing accepted candidates unchanged** and makes **8** previously rejected candidates evidence-valid. The six historical/field conflicts and two noneligible quote mismatches remain rejected with their previous codes. No historical flag is changed. Stored quotes are exact substrings of the referenced reconstructed safe spans, including their original line breaks.

As a separate safety check, each recovered value is echoed into its mapped page module and run through the **unchanged** refinement validator. Six pass; one is rejected as EXAGGERATION and one as HEALTH_CLAIM. This is an echo safety probe, not a generated page, adoption recommendation for those six texts or evidence of improved model recall. Existing prices/health wording remain prohibited. No source facts are automatically restored into saved/confirmed or public content.

The implementation first tries the existing exact/whitespace-run match, then permits folding a single LF/CRLF only when both adjacent characters are Hangul syllables. This additional fallback requires cited spans to be consecutive in the supplied page's source order: skipped, reordered or repeated spans cannot earn new wrap recovery. It preserves original offsets and returns the original substring. Ordinary spaces, blank-line paragraph boundaries, digits, units, Latin characters, punctuation, quote spelling, negation and target/source/page/span guards remain protected. It does not fuzzy-match characters or infer meaning.

Extraction pipeline version source-v9-coverage-wrap1 invalidates stale extraction reuse without changing the prompt body or model. Existing worker mismatch handling and manual retry/cost checks remain. This branch owns only the extraction-version assertion in test_source_refine.py; DEV-445 changes a separate refinement-version assertion. The patches use distinct hunks and do not import each other's unfinished behavior.

## Tests and remaining work

New invented regressions reproduced **6 failed / 16 passed** on the old matcher. After the fix, including two extra downstream money/health guards, the targeted run passed **24 tests**. The initial six-file extraction/OCR/refinement/evaluation run had **691 passed / 1 failed**: an existing extraction-version assertion expected the previous version. Only that version expectation was updated; prompt-content/safety checks and old tests were retained. The first full backend run passed **2,171 tests with 1 skipped (262.09s)**.

AI review then identified the new fallback's span-continuity requirement. Three additional negative cases (skipped/reordered/repeated spans) reproduced three failures before that guard was added. The final bounded replay retained exactly the same 68/16/8/6 outcomes after the guard; earlier traces and the prior committed report remain preserved. The final full backend run passed **2,174 tests with 1 skipped (257.40s)**, including the 27 new cases. Ruff passed on all five changed Python files; document links, public/private boundaries, code fingerprints and unchanged replay inputs were checked. The [AI review](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/798#issuecomment-7109714849) records the resolved span-continuity finding. Human review remains pending.

The private replay script's first prompt-body comparison inspected only the initial assignment and missed a preexisting appended prompt block; it stopped before replay/output. The assertion was corrected to compare the complete assignment plus append, which confirms the prompt body is unchanged. No product code or expected safety result was changed to satisfy that check.

Release adoption remains deferred pending human code/evidence review, DEV-412 scope decision and the full DEV-446/447/448 contract/gold/scorer work. No repeated paid generation, cross-format quality comparison, producer acceptance, merge or deployment occurred. The $5 shared budget is unchanged. Schedule reconciliation remains a PM follow-up; dates, availability and estimates are not invented.


## Later controlled generation follow-up (2026-11-24)

A separate frozen comparison used the existing v11 writer and Gemini Flash model for two trials on two targeted development sources, with original versus repaired accepted candidates. Results: page-wide fact selectors **23/44 → 32/44** and critical selectors **6/16 → 11/16** in both trials; permitted placement **23/44 → 28/44**. All five additional critical selectors came from the affected PDF. The unchanged long-image control varied by one noncritical selector in the second trial, so this is a small descriptive result rather than a cross-format estimate. No new unsupported-sentence flags were detected; semantic accuracy/human adjudication remain unresolved.

The affected PDF is outside the separate eight-source pilot; that pilot gains zero extraction candidates from this repair and is never pooled into these numbers. Eight recovered candidates are evidence-valid; six pass literal safety echoes, while actual neutral v11 editing cites seven recovered candidate IDs in retained text in each trial. These are different checks. The health constraint remains enforced; no raw rejected text is restored. Existing historical-field rejections remain unchanged.

The paired experiment and a separate, unsuccessful passage-router comparison are recorded in draft PR797 (live code92c5c4f1). The router is unselected. All48calls across the broader experiment were retained, including six invalid responses; total phase ledger charge$0.266945. The original$5cap remains: settled$1.638684 +prior uncertain$0.828496, remaining$2.532820. No new uncertainty or rollout. This later follow-up commit changes documentation only. Earlier commits in this PR implement the quote matcher, span-continuity guard, pipeline version bump and tests. The earlier2174passed/1skipped backend result is not presented as newly rerun. Human code/source review and release decisions remain separate.
