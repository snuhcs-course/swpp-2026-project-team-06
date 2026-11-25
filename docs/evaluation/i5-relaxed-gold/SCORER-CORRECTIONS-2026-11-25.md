# Scorer formatting correction — 2026-11-25

DEV-448 · FEAT-03/04/07 · AC-SRC-2/3/5/10. This is a correction to evaluation of saved outputs, not a generation improvement. All47previously observed development sources and original354facts/154critical flags remain fixed. Revised355fact policy retains142essential/186optional/27review denominators. No sealed holdout, new model/OCR/extraction run or producer acceptance.

## Updated policy: formatting-only scorer v2

| Saved output | Original essential /142 | Corrected essential /142 | Original optional /186 | Corrected optional /186 | Original review /27 | Corrected review /27 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
|Last week's writer · trial 1|118/142 (83.1%)|122/142 (85.9%)|156/186 (83.9%)|156/186 (83.9%)|13/27 (48.1%)|17/27 (63.0%)|
|Last week's writer · trial 2|118/142 (83.1%)|125/142 (88.0%)|149/186 (80.1%)|149/186 (80.1%)|14/27 (51.9%)|19/27 (70.4%)|
|Source preservation · no model|130/142 (91.5%)|132/142 (93.0%)|174/186 (93.5%)|174/186 (93.5%)|22/27 (81.5%)|23/27 (85.2%)|
|Preservation + Astra · trial 1|130/142 (91.5%)|132/142 (93.0%)|173/186 (93.0%)|174/186 (93.5%)|22/27 (81.5%)|23/27 (85.2%)|
|Preservation + Astra · trial 2|130/142 (91.5%)|132/142 (93.0%)|173/186 (93.0%)|174/186 (93.5%)|22/27 (81.5%)|23/27 (85.2%)|

These use the same revised policy with unchanged essential/optional/review assignments. Spelling/phrase alternatives are excluded. The original354fact benchmark below has a different denominator and remains separate.

## Original answer key: formatting-only scorer v2

| Saved output | Original fact coverage | Corrected fact coverage | Original critical coverage | Corrected critical coverage |
| --- | ---: | ---: | ---: | ---: |
|Last week's writer · trial 1|294/354 (83.1%)|294/354 (83.1%)|130/154 (84.4%)|130/154 (84.4%)|
|Last week's writer · trial 2|292/354 (82.5%)|292/354 (82.5%)|135/154 (87.7%)|135/154 (87.7%)|
|Source preservation · no model|328/354 (92.7%)|328/354 (92.7%)|143/154 (92.9%)|143/154 (92.9%)|
|Preservation + Astra · trial 1|328/354 (92.7%)|328/354 (92.7%)|143/154 (92.9%)|143/154 (92.9%)|
|Preservation + Astra · trial 2|328/354 (92.7%)|328/354 (92.7%)|143/154 (92.9%)|143/154 (92.9%)|

Spacing/unit/Brix normalization is symmetric on source and output. Paragraph, independent-number, decimal, sign and typed range boundaries remain distinct. Original legacy scorers are unchanged; v2 numeric diagnostics are reported beside raw historical flags. Content presence is separate from correct placement, support, repetition and writing quality. Keyword matches do not prove semantic accuracy.

## Separate source-verified alternatives

| Saved output | Additional fact matches after formatting | Coverage including annotations |
| --- | ---: | ---: |
|Last week's writer · trial 1|+0|294/354 (83.1%)|
|Last week's writer · trial 2|+0|292/354 (82.5%)|
|Source preservation · no model|+3|331/354 (93.5%)|
|Preservation + Astra · trial 1|+3|331/354 (93.5%)|
|Preservation + Astra · trial 2|+3|331/354 (93.5%)|

Only three source/fact-bound alternatives are used: two source spellings and one equivalent consumption phrase. This is a separate assistant-audited diagnostic under user-authorized policy, not human factual approval or a general spelling dictionary. Metadata binds source/gold/safe-text hashes, reason and location; numeric/option/qualifier changes reject. Alternative selectors affect lexical diagnostics only, never semantic support. Primary results do not include these alternatives. General editor spellchecking is outside this change; generated wording remains unchanged.

## Numeric diagnostic

The original unsupported-number count stays at one for each guarded Astra trial; v2’s normalized count is zero in both. Source preservation and both legacy trials remain zero. This is the Brix-spacing false alarm, not proof that all claims are supported.

## Validation and evidence

The final related target passed 1155 tests in 89.61s, followed by 13 migration tests. Pure scorer review and whole-server Ruff passed. Test cohorts overlap. Two interrupted replays exposed month-range and inline sentence-period boundary regressions despite earlier passing controls; both were preserved, fixed and checked across all saved outputs before the final replay. Earlier fixture setup errors and intermediate tests remain in the task record.

All nine arms (saved historicalg1/g2, B, A×2, C raw×2/effective×2) use identical v2 rules. Original and corrected scores are retained with per-fact changes and code/input/policy hashes in private evidence. No raw source, gold content or business data is published here. No provider, database or production calls in replay; no merge/deployment. The same known development set remains a limitation.

Agent approximately0.5h continuation / Tokens / Human unconfirmed. Earlier confirmed parent human time is not reassigned.
