# Draft-first gold revision and symmetric replay (DEV-447/448)

## Policy and migration
User explicitly authorized relaxing over-strict/contradictory gold and keeping reviewable source information in private drafts. This is USER_AUTHORIZED_POLICY, not a full human factual audit. Original47sources/354facts/154critical flags remain unchanged; every old source/fact pair is mapped. Revised v2 adds1optional previously unscored source descriptor. Sidecar classes:142essential,186optional,27review (355total). Old critical flags remain intact inside the revised gold; requirement classification is separate.

The focused4-source gold now has31essential/55optional/9review facts (95total, including1new optional descriptor). Pilot8-source gold has50essential/73optional/8review (131total). Minor box tare is optional per focused reviewer; date/history/dispatch facts are separate review information. A positive/forbidden brand-origin contradiction is explicitly disposed source-equivalent. Source-specific ambiguous count interpretations follow focused feedback; no global upper-bound/approximation equivalence. Missing source descriptor is a source claim, never certification.

All transformations are recorded privately with old/new IDs, reason/provenance, original/revised/sidecar hashes. Historical inputs remain byte-identical. Private overrides carry source-specific wording and are never committed. Unknown IDs/enums and empty aliases reject. A wrong CLI envelope was rejected before output creation; corrected invocation supplied its gold member.

## Frozen four-source replay
Same94historical facts, unchanged original pagewide scorer; no gold-policy change contributes to this table:

| Saved arm | Pagewide selector hits | Critical hits |
| --- | ---: | ---: |
| Original v11 |73/94|27/38|
| Withheld private draft |61/94|22/38|
| Complete private draft, warnings retained |81/94|29/38|

Current extraction snapshot115candidates/116evidence passages, all116included privately;42review-pending passages remain included (not42lost facts). Source-copy engine runs without a paid writer. This is a local deterministic development replay, not a fresh extraction or unseen generalization. No owner-completed page has been fabricated.

## Same revised policy applied to both saved arms
Pagewide coverage diagnostic, independent of placement:

| Arm | Essential | Optional | Owner-review information present |
| --- | ---: | ---: | ---: |
| Original v11 |23/31|45/55|4/9|
| Withheld draft |19/31|41/55|1/9|
| Complete private draft |24/31|51/55|6/9|

These denominators/normalization differ from historical metrics: do not compare24/31 to27/38 as generator gain. Raw old results remain beside new ones. Pagewide terms do not prove correct option relations. Separate linked-clause diagnostic is22/31baseline vs18/31complete draft for essentials: source line/option fragments require relation review; source preservation alone has not solved assembly. Bounded full-reference matches are sparse and must not be reported as overall accuracy. The relaxed evaluator emits NOT_ASSESSED, no quality PASS.

More private text also exposes more old forbidden/unsupported/repetition flags. Historical scorer marks27forbidden matches and19repetition excesses on the complete private draft; these are private source-content/structural diagnostics, not permission to publish or proof every flagged claim is invented. Legacy health/policy checks and reviewable prices remain separately visible. No blanket unsupported/health exemption: only a source-linked non-curative marketing item is assigned review; other restrictions remain enforced.

## Validation
Scorer31pure controls and migration10invented controls passed independently (41total). Full related suite final result follows below. All comparisons are offline, development-only; no provider calls, holdout access, production writes, merge or deployment. Agent approximately0.5h continuation / Tokens / Human unconfirmed; prior parent5h not reassigned.

Final related command: `DATABASE_URL=<isolated farmclub_dev448> make test-text-scoring` →1094backend/evaluator tests passed(103.96s), followed by10migration tests passed(0.01s). The41pure review controls overlap this suite and are not additional independent cases. Ruff/diff and independent review passed; findings on critical-flag preservation, private reason redaction and unknown overrides were corrected without weakening numeric/negation controls.

Final format-binding controls: migration13passed + evaluator31passed =44pure checks(0.06s), overlap related suite except3new format controls. Explicit development manifest supplies all47format labels without mutating historical input. Final artifacts use r003 hashes; symmetric scores unchanged.

CI follow-up: server job stopped before tests on Ruff I001 (one missing import-group blank line in existing quality test). Fixed formatting only. Whole-server `.venv/bin/ruff check .` passed; isolated `pytest tests/test_source_copy_quality.py -q --tb=short`20passed(1.94s). CI rerun remains pending; prior failure retained.


## Formatting-only scorer v2 correction

See [corrected all47case comparison](./SCORER-CORRECTIONS-2026-11-25.md). Primary142essential coverage legacy122/125versus preservation/guardedAstra132; original354coverageunchanged. Spelling/phrase3facts separate diagnostics. Final1155related+13migrationpassed; independent154pureoverlap. No paidcalls/gold/generationchanges; initialtwofailedreplaysretained. Agentapprox0.5h / Tokens / Humanunconfirmed.
