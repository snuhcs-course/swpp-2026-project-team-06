# DEV-445 critical-miss source audit — 2026-11-24

The earlier diagnosis that page assembly dominates is provisional. Source inspection shows extraction/validation losses, placement-dependent scoring and gold-policy conflicts alongside actual writer omissions. Adding retrieval does not repair rejected evidence or an inconsistent evaluation target.

## Scope and evidence

At Zahra's direction, the agent inspected the original source regions for all 51 distinct critical facts missed at least once in the four experiment-3 arms/trials, spanning 17 existing development sources: image 14, PDF 23, long image 7 and text 7 facts. This is a targeted failure audit, not adjudication of the full 354-fact development gold. No holdout was used. Original PDF pages were rendered and inspected with PDFium; image regions and text originals were also checked. The per-fact worksheet retains file/page/region method, flags, stage-1 rejection matches and PENDING human adjudication privately. No gold labels were changed.

A lexical diagnostic finds all selector tokens in one accepted candidate for 27 of the 51 facts and not for 24. These are not valid counts of writer versus extraction failures: range spelling, broken units, aliases and facts split across candidates defeat that test. Categories below overlap and should not be summed.

## Findings and next actions

| Finding | Evidence and implication | Action |
| --- | --- | --- |
| Valid numeric statement rejected | All four outputs cleaned whitespace inside the Korean Brix unit; numeric validation treated the original as a unitless number. | Narrow whitespace-unit fix with positive and negative regression tests; no changed value, unit invention or range conversion. |
| Stage-1 rejected facts | Fifteen critical selectors match rejected candidates: six historical-field mismatches, eight invalid-evidence cases, one private-value rejection. These matches identify investigations, not automatic permission to publish. | DEV-453: verify historical labeling and quote/page/span association; isolate safe clauses before extraction validation. Keep evidence/privacy checks. |
| PDF page cap does not explain the inspected misses | The relevant PDF facts are within the first 20 pages, including a package table, farm-history pages and a two-page document. | Investigate rejected extraction rather than expanding context or page limits for these cases. |
| Gold formatting mismatch | An original month range uses a hyphen while the required selector uses a tilde. Exact-copy instructions can therefore lose points. | DEV-447/448: version and review allowed equivalent forms; preserve original scores. |
| Gold conflicts with publication policy | A required shipping-time promise is source-supported but excluded by the current product contract. | DEV-446/447: decide required, optional and forbidden content before relabeling. |
| Fixed placement versus omission | Several product names, size grades, package sizes, origins and farm-history facts appear elsewhere on the page. | Measure page-wide preservation separately from preferred-section placement and human organization quality. |
| Mixed safe and health wording | Neutral cultivation/certification facts share candidates with health wording, causing whole-candidate rejection; one source term also has an orthographic variant. | Split neutral evidence into independently supported candidates upstream; retain health protections. |
| Questionable critical/current labels | Aroma wording, cultivar genealogy dates, relative-year history and a reference-only size illustration are treated as critical product facts. A dated historical batch also needs temporal qualification. | Human adjudication of criticality, applicability and time context; source-supported does not mean mandatory or current. |
| Weak selectors can hide errors | Tokens may match while dropping approximation, negation or source scope. | Review positive and negative examples, conditions and qualifiers; do not optimize only for token recall. |

## Implemented and replayed

The production generation prompt stays v11-routing. Cache version source-refine-v11-source-audit covers two narrow changes: recognition of whitespace inside the Korean Brix unit, and conservative contained-title cleanup. Title cleanup keeps the longer whole title and all citations, requires a whole suffix phrase, guards numeric/negative/measurement qualifications and does not compress body sections. It does not solve semantic repetition throughout a page.

The offline replay reconstructed citations from private coverage ledgers and restored only model-generated rejected texts for revalidation. It first reproduced the pre-fix modules for all 95 successful records exactly; the one failed record remains failed. After both fixes, four valid statements survive and one repeated hero title is removed. Neither extraction candidates nor historical gold/scorer were altered. The frozen scorer still produces one unsupported-number flag per restored record because its Brix normalization differs between spaced source and contiguous output. See [results.md](results.md) for all unchanged and replayed counts.

## Recommended sequence

1. DEV-446/447: adjudicate publication policy, criticality, equivalent forms, temporal applicability and permitted sections. Keep original and revised gold separately with human reasons and a frozen development manifest.
2. DEV-448: test the scorer against those reviewed cases; report factual support, eligible-fact recall and placement separately. Establish a corrected baseline without rewriting historical results.
3. DEV-453: repair confirmed historical/quote-association extraction losses with evidence-preserving regression cases. Do not recover failed clauses by bypassing checks.
4. DEV-449/450/451: retain the three writers as experiments until the corrected baseline and blinded Korean editorial review establish improvement. Test repetition, flow, hierarchy, qualifiers and unsupported additions alongside recall.
5. DEV-452/412/413: verify editor/save/apply integration and producer acceptance, then make the explicit exposure/manual-fallback release decision. This audit and a local demo do not satisfy those gates.

Full gold adjudication, human editorial acceptance, Schedule-sheet reconciliation, production deployment and release approval remain open.

## Private evidence fingerprints

Hashes identify the retained local artifacts without publishing source text or filesystem locations.

| Artifact | SHA-256 |
| --- | --- |
| auditWorksheet | cfede44259954262b0f8b00df28ad181686e5937465834e93d812381e6244d8e |
| replayScript | 730bb96f003bd25a0f1b5f0658b38135ceb5db1076f652f7d60a13ac81c65a5f |
| replayVerification | 63166c2cbab81147c5272c4cb74bea299db537c5ef63a6cb640b33ad31d41fd1 |
| replayScores | a112ba49f631e9c42a88bac0984d31d43640a806210018760d7471aacfd707fc |
