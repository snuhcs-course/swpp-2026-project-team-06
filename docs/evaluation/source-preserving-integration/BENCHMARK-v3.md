# Source-copy benchmark v3 (DEV-452)

Status: **draft, frozen when the PM approves it** (2026-11-28). Nothing below is run before that.
After approval, a change to any item needs a new version and a rerun of every compared arm
(`docs/evaluation/i4-ai/criteria.md` §5).

## Why a new version

Until v2 the score was "is each gold fact in the page text". The shipped pipeline now does more
than write a page:

1. **read**: text as is; images and PDFs through OCR (AI);
2. **extract**: stage-1 candidates with source quotes (AI, prompt `source-v9-coverage`);
3. **page rules**: deterministic `build_plan`. It copies source wording, removes what the owner's
   setup inputs replace (price, box weights, delivery timing), removes past-sale notices and exact
   repeats, strips headings, and asks the owner about dated or uncertain text;
4. (optional AI tidy-up: off by default, `source_presentation_enabled = False`, not measured);
5. **owner review**: questions in the check sheet; removed text stays available to put back.

A fact can now be correct but live in the sale settings, or be removed on purpose. v2 counts both
as losses and does not check that the page text is true to the material.

## Questions

| # | Question | Score |
| -- | -- | -- |
| 1 | Does the owner get every important fact? | completeness, two views |
| 2 | Is every page sentence true to the material? | traceability, unsupported numbers, other product |
| 3 | Is nothing unsafe published without a question? | forbidden items on the page |
| 4 | How much work is left to the owner? | questions per page, wrong and missed removals |
| 5 | Does it run? | processing success (failures counted, never dropped), time, cost |

## Data

- **Development 47** (24 public + 23 synthetic; 26 text, 9 image, 4 long image, 8 PDF), the same
  sources and denominators as v2. **2 trials** per arm (the AI is not deterministic).
- **Capability set**: tasks from real failures found in the 11/28 full-flow QA, with short gold.
  Private material stays outside git; only aggregate results are published.
- **Holdout v2**: run once on the frozen final version by the PM. Not opened by agents.

## Gold v3 = gold v2 + labels + setup inputs

Each of the 355 facts gets one label (proposed by rule, every non-`page` label reviewed by the PM):

| Label | Meaning | Rule proposal |
| -- | -- | -- |
| `page` | must be in the page text | default |
| `settings` | shown by the sale settings, not needed in the text | every required word is a weight, price or date token |
| `removed` | should not be on the page unasked | past-sale notice (same detector as the product); a past-price note (`historicalSales` naming a price, 판매 기록, 행사 or 할인) once the owner has set prices (PM 11/28) |

Each case gets the setup inputs an owner would enter: prices always set; sale options = the box
weights the material offers; delivery months = months the material names for delivery, otherwise
none (the delivery-timing rules are then inactive for that case and this is reported).

## Scores (code graders only)

Fact presence: every `mustContain` word appears in the text, ignoring whitespace (the v2 lexical
rule; it reproduces v2's 328/355 for the saved B arm).

- **Completeness**, per format and critical separately, on `page` + `settings` facts:
  - *on the page*: page text, plus the setup inputs for `settings` facts;
  - *available to the owner*: also text the owner sees off the page and can put back
    (rule-removed sentences, material lines shown next to the sale settings).
- **Traceability**: share of page sentences found word for word in the read source text
  (whitespace and removed headings ignored). Target 0 untraceable sentences.
- **Unsupported**: numbers and number-unit pairs on the page that are not in the source
  (`dev264-number-evidence-v2`).
- **Other product / forbidden**: gold `forbidden` items present on the page and **not** under an owner
  question. PM 11/28: ordinary advertising is allowed. `health` counts only for a treat/prevent
  claim, `unsupported`/`other` only when the product's excessive-promotion check matches
  ("세계 최고", "100% 보장"); already-masked text (`[… 가림]`) never counts; gold entries the PM
  marks `counted: false` (our own app's inquiry line) are skipped.
- **Workload**: check questions per page; **wrong removals** (`page` fact available but not on the
  page); **missed removals** (`removed` fact on the page without a question).
- **Per-step attribution**: reading (character errors on the 23 synthetic sources, whose text is
  known), extraction (fact in accepted candidates), page rules (fact in candidates but not
  available), so a loss is assigned to one step.

## Pass lines

Unchanged: fact recall ≥ 95% per format (available view); 0 unsupported critical; 0 forbidden on
the page unasked. Added: 0 untraceable sentences; 0 other-product facts on the page unasked.
Workload and removals: reported, no line until a baseline exists.

## Arms

- **before**: saved 11/18 stage-1 inventory + 11/25 page rules (`full47-comparison-r001` B arm);
- **rules now**: the same saved inventory through today's page rules with setup inputs ($0);
- **now**: a fresh end-to-end run of the current code, 2 trials (paid; run by the PM).

Improvement is claimed only on the same denominators, with paired fact changes shown.
