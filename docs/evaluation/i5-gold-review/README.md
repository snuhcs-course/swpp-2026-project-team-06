# DEV-447 development gold review packet preparation

**Prepared, not adjudicated.** The private packet covers all 47 existing development sources and all 354 historical facts (154 critical). Every human decision is PENDING. No gold label, historical score, generator, product policy or release decision changed. No provider/model calls were made. No sealed holdout file was opened.

Zahra authorized preparation while Jinwoo reviews the proposed content contract in [PR #795](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/795). Jinwoo is the assigned gold adjudicator, Korean editorial reviewer and producer-feedback coordinator; role assignment does not establish completed review, availability or producer participation. This work does not mark DEV-446/447 Done.

## What is ready

The packet is stored outside git. Its entry page links to 47 source-specific Markdown worksheets and a priority queue for the 51 critical misses previously investigated across 17 sources. It also contains an editable JSON worksheet, a preserved original-gold snapshot, the prior audit, preparation summary and verification record. One-off build/verification scripts are retained privately; their hashes appear in [preparation-results.json](preparation-results.json). Filled worksheets, local paths, raw sources and scripts containing those paths must not be uploaded to this public repository, PR or Linear.

Each claim retains the original source/fact ID, product, statement, reference sentence, selectors, critical flag and section/module. Source rows link to the corresponding original public-development asset or synthetic fixture definition. Public source files were byte-hash checked against the saved input snapshot. The 23 synthetic sources are linked to their existing fixture definitions; this task did not render or visually inspect new image/PDF assets. Synthetic-definition linkage is not original-image verification.

The 51 prior audit entries are preserved exactly as agent findings, with source-location notes and concrete Korean review questions. The remaining 303 facts are queued for original-source review; exact claim-level page/region verification is incomplete and must be supplied by the reviewer. Existing candidate quotes/spans and selector matches are only navigation leads, not proof of extraction success or semantic support. No new full-corpus visual audit is claimed.

Proposed claim fields cover relation, value/unit, negation, approximation, expected/measured status, sample/time context, source-claim versus independent verification, inclusion class, criticality, primary/permitted modules, equivalent forms and a misleading near-miss control. Unknown fields remain empty/UNRESOLVED. There is a separate human adjudication record: actual reviewer, original-source confirmation, retain/merge/correct/exclude/unresolved, canonical ID, rationale, policy approval and review time. The assigned reviewer field does not fill in the actual reviewer or confirmation.

## Inventory and limits

| Format | Sources | Facts | Critical facts |
| --- | ---: | ---: | ---: |
| Text | 26 | 103 | 46 |
| Image | 9 | 52 | 35 |
| Long image | 4 | 92 | 25 |
| PDF | 8 | 107 | 48 |
| Total | 47 | 354 | 154 |

These are inventory counts pooled across **24 public-development and 23 synthetic cases**, not pooled quality metrics. Any later performance reporting must separate cohorts. Four empty-gold source rows remain, with explicit correct-empty versus processing-failure review prompts. Four duplicate-selector pairs and six reference sentences flagged by existing product checks remain review leads; none was automatically merged, excluded or approved.

The priority queue starts with the 51 prior audited critical misses and retains the other 303 facts. Its questions cover source spelling/unit/range equivalence, policy conflicts, temporal/product applicability, criticality, useful alternative placement, historical labeling and rejected evidence. Prior agent verification remains distinct from Jinwoo's human verification. Unresolved cases cannot be silently removed from the denominator.

## Current request: a focused first review

The immediate request is now **three saved generated-page previews**, with one long-image example optional, and **six focused fact questions**. Jinwoo reported seeing only the criteria and could not find actual generated pages. The original 47-source packet was preparation inventory, not an appropriate immediate review assignment. This focused packet supersedes the earlier request to inspect all 51 priority claims followed by the remaining facts.

1. Open the private focused entry HTML: each required image/PDF/text example shows the actual saved baseline v11 trial-1 output alongside its source. Long-image content is optional. No regeneration, account or API key is required.
2. Comment on wording, organization and repetition; answer only the two fact/policy questions per required source, or state uncertainty. A short plain-text reply template is included. Code fixes are reviewed separately through PRs.
3. The text case optionally shows the existing saved-output validation replay after the narrow default fix. It is clearly separated from the saved baseline and is not a new model generation. The previews reproduce generated text and module order in review HTML, not production UI screenshots or product-photo placement.

Selection is purposive across formats and known failure types, with the baseline arm and trial fixed rather than choosing a winning experimental writer/trial. It is useful for initial human feedback, **not** statistical representativeness, a full gold audit/freeze, a validated LLM judge, producer acceptance or release approval. All human decisions remain PENDING. No judgment is inferred from the informal acknowledgment of the criteria.

The separate full-dataset audit remains deferred work: an audited-gold claim still needs source verification, original-to-new ID dispositions, resolved policy/criticality/module decisions and a new version/digest. Unreviewed facts cannot be silently excluded or treated as approved. DEV-448 re-scoring and DEV-412/413 release decisions remain separate. Full private inventory and previous review artifacts are preserved unchanged; they are not required reading for this first pass.

See [focused-results.json](focused-results.json) for private artifact verification and fingerprints. The portable ZIP includes the four selected original sources, six HTML pages (entry/four cases/one optional replay), saved-output provenance, source excerpts and a reply template. Delivery is a private handoff for Zahra to arrange; nothing was sent to Jinwoo.

## Executed verification

A later independent preparation step adds a **private portable bundle**; [portable-results.json](portable-results.json) records its verification and fingerprints. It includes byte-identical copies of all 24 frozen public-development assets, the 23 synthetic definitions, all 354 unchanged claim records, 47 source HTML worksheets, the priority queue, proposed standards/protocol and 38 invented scorer controls. All 247 relative HTML links resolve; all 105 files pass archive integrity checks. HTML/JSON contain no machine-specific absolute paths. The original packet and all human PENDING states remain unchanged. This resolves the earlier local-link portability limitation; **delivery/sharing and human review have not occurred**.

The portable packaging check initially caught a generic temporary output path in a copied scorer-command example. Only that display example was made relative; no source, gold label or proposed semantic judgment changed. The prior packaging attempt is retained privately. ZIP/file manifests and source-asset hashes were checked; no model, production or holdout access was used.

Two private scripts ran offline: packet construction and independent completion/verification. The latter passed **17 checks, 0 failed**:

- All 354 unique old claim records round-trip exactly; all 154 critical flags and all 47 source rows survive.
- The 51 original audit records are unchanged and occupy the first 51 queue positions; no human review is preapproved and no proposed label is silently adopted.
- All four empty-gold sources, four duplicate-selector pairs and six flagged-reference leads remain.
- All 24 public source assets match the saved input byte hashes; 23 synthetic fixture definitions are linked without claiming rendered-image verification.
- All 54 tracked inputs (gold/manifest/audit/fixtures/input index, original assets and stored extraction files) have unchanged before/after hashes.
- All 123 private Markdown links resolve, all 47 source worksheets exist, private files have mode 0600 and directories mode 0700; format counts reconcile.

The verification record and artifact hashes describe this **initial prepared packet**, not later human edits. Revised worksheets require new hashes/version metadata. Input immutability/link checks do not establish semantic correctness, label quality or model improvement. No runtime code changed; pytest/npm were not run under the documentation-only exception. Public Markdown links, diff scope and PR table are checked separately before finalizing the draft PR.

Provenance: repository baseline ef390bde; reused offline diagnostics from the DEV-445 worktree at 1e2b114c. Private scripts pin known development inputs explicitly rather than discovering/reading sealed files. Existing $5 shared model budget is unchanged: $1.322573 settled plus $0.061929 uncertain reservation previously accounted for. Schedule was subsequently reconciled in DEV-452; actual human review and policy/gate approval remain open. No merge or deployment.
