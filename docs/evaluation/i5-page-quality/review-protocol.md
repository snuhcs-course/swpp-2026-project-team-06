# DEV-446 Korean editorial review protocol — proposal v0.1

Status: **NOT FROZEN / NOT EXECUTED**. Zahra named Jinwoo as gold adjudicator, Korean editorial reviewer and producer-feedback coordinator. Availability and producer participation are unconfirmed. Zahra owns policy and gate approval. This protocol implements the proposed [content contract](../../spec/page-drafting-quality.md); it changes no runtime behavior or historical result.

## Rubric

Score each dimension separately from 1 to 5. Scores 2 and 4 have explicit anchors; reviewers must cite a module and observable defect, not an overall impression. All Korean examples below are invented illustrations, not producer data.

| Dimension | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| Organization | Cannot identify product/options or follow the page | Several facts in unrelated sections; substantial restructuring needed | Understandable, but one section substantially mixed or abrupt | Clear sections; only a minor misplaced detail/transition | Each section has a clear purpose; details follow naturally; no relocation needed |
| Repetition | Same paragraphs dominate several sections | Repeated detail requires several deletions | One redundant paragraph or several redundant sentences | One minor redundant phrase; identity echoes remain useful | No unnecessary repetition; introduction and detail serve distinct purposes |
| Korean fluency | Meaning difficult to understand | Frequent fragments or inconsistent subjects/terms | Understandable but several awkward sentences | Natural polite Korean; one minor wording fix | Consistent, concise Korean that needs no editorial rewrite |
| Buyer usefulness | Missing/misleading essential distinctions prevent understanding | Several important option/condition links require source lookup | Product is understandable but one important practical detail is hard to find | Main buying/storage questions answered; only minor scanning effort | Eligible information is easy to locate and compare, with explicit applicable conditions |

Anchor examples: organization 2 might mix '5kg 포장' and farm history in a storage paragraph; repetition 3 repeats '과즙이 풍부해요' as a full explanation in summary and taste; fluency 2 might read '감귤. 저희가. 포장으로 발송되어집니다'; usefulness 2 might show '약 30~40개' without its 5kg option. These examples illustrate defects only. Do not invent missing source facts to obtain a higher score.

Record factual/safety issues separately, even if they also hurt usefulness. An attractive page cannot compensate for unsupported claims.

## Major defects and factual review

A major editorial defect requires moving/reworking a paragraph, obscures which product/option a statement concerns, repeats a full substantive explanation across sections, or makes an important instruction hard to understand. A minor defect is a local phrase/punctuation/transition fix with no change in factual meaning. Missing/incorrect critical facts, lost negation/measurement conditions, other-product information, forbidden content and unsupported additions are factual/safety defects regardless of editorial scores. A dated historical fact presented as current is a factual defect. Distinguish source ambiguity from model error; uncertain judgments stay unresolved.

Judge page-wide claim preservation, correctness, placement and processing separately. Record the location of preserved-but-misplaced claims. Neither a citation nor matching keywords establishes semantic correctness. A source-supported claim may still be excluded by publication policy. Apply the current policy until an explicit versioned decision changes it.

## Proposed sample and comparison

1. Freeze this protocol, the content contract, approved claim mapping, source/gold digests, model/prompt/code identities and proposed gate **before reviewing new candidate outputs**. Jinwoo and Zahra sign the freeze record. Existing experiments already inspected remain exploratory; masking them now does not restore blindness or independent validation.
2. For the next approved development comparison, use all 24 existing public development sources across text/image/long-image/PDF, both arms on identical extraction inputs. Keep failed/partial/empty pages and every planned trial. Do not select a favorable subset. Audit the existing 23 synthetic cases separately as capability/control evidence; never pool them into a public-source percentage. Full gold review still covers all 47 development cases. No holdout access or new independent-generalization claim.
3. For a bounded human review, proposal is scheduled trial 1 for every source, including failed/partial outputs; never substitute a later successful trial. Every source remains a row even if an arm fails. Record counts by format, missing output and ties. Any extra trials are separately labeled robustness evidence. Freeze the selection rule before new generation. A generation failure cannot disappear because no page is available to rate.
4. A coordinator produces local private A/B renderings using the same renderer, enabled content, photo set and viewport, without arm labels or diagnostic overlays. Keep per-source randomized left/right order and mapping in a private manifest with seed/digest. Jinwoo first rates each page independently, then chooses A / B / tie / cannot judge with a reason. Include the same written evidence packet for both arms in a second factual pass; do not let a source lookup become an unrecorded rewrite.
5. Jinwoo performs one editorial pass. Record his involvement in generator/gold authorship, prior output exposure and gold-review overlap; role assignment alone does not establish independence. With one reviewer, report single-reviewer development evidence only. If a second reviewer is available, rate independently before discussion and retain both raw judgments. Do not label agent checks as a second human review.
6. Resolve factual/criticality disagreements against original image/PDF/text locations; unresolved items block audited-gold acceptance. For editorial disagreement, retain both scores and rationale; Jinwoo documents an adjudicated recommendation, and Zahra decides disputed policy/gate matters. A personal preference tie stays a tie. No silent averaging away of major defects.

Render the full page as consumers see it and separately note where layout causes a defect. Record viewport, module, screenshot reference, expected behavior and whether a wording relocation alone fixes it. An actual renderer/template change needs a dedicated issue and Figma v6 follow-up; this documentation does not authorize it. Structured origin/price/checkout data follow their existing contracts and cannot be deleted as duplicate prose.

## Proposed gate — requires approval

Historical factual targets remain ≥95% recall **per format**, zero unsupported critical/forbidden content and existing critical FAIL rules. Do not lower those targets based on these experiments. DEV-447/448 must publish all old-to-new label/denominator changes and rescore both arms symmetrically before claiming a corrected baseline.

Proposed editorial acceptance requires a median ≥4 **for every dimension**, no page below 3 in any dimension and zero remaining major defects on candidate pages. Unresolved severity judgments block acceptance. Report medians per dimension and format, the minimum and full rating counts. With small format samples, show counts and avoid population claims. The primary median is over candidate pages, not over a blended average of all dimensions. Failed outputs have no invented 1–5 rating: record N/A and fail processing acceptance separately. Excluded/empty contract cases require their own correct-empty verdict.

Proposed comparative claim requires more source-level candidate wins than baseline wins among judgeable pairs, with wins / losses / ties / cannot-judge / failed pairs all reported out of the full scheduled sample. A tie contributes no win; missing output is never a tie. If multiple human reviewers disagree on preference, count the pair as disputed until adjudicated and publish their raw votes. A numerical win does not override factual or absolute editorial failures. An equal result is inconclusive, not improvement. Do not claim significance from this descriptive comparison.

Producer acceptance remains DEV-452: Jinwoo coordinates consent and a real session; record participant count, assistance, build, edits needed, rejection reasons and limitations privately/aggregated as appropriate. Internal Korean review is not producer acceptance. DEV-412/413 decide release exposure/manual fallback and final evaluation independently.

## Execution gates and freeze record

Before new paid runs, confirm the shared $5 ledger (including unresolved reservations), allowed provider/model and private-data handling, reviewer availability, complete comparison trial count and **end-to-end latency/processing acceptance limits**. Current adapter timeout 90s / zero retries is an implementation setting, not an approved user-facing SLA. Record per-source timings and failures; publish p50/p95/max with sample counts. No automatic retry/fallback after uncertain transmission. This task incurs no paid calls.

| Freeze field | Status |
| --- | --- |
| Contract/protocol version and SHA-256; code/gold/source digests | Pending final approval; hash final files, not this mutable proposal |
| Gold adjudicator / Korean reviewer / producer coordinator | Jinwoo, named by Zahra; availability pending |
| Policy/gate approver | Zahra; decisions pending |
| Independent second editorial reviewer | Not assigned; single-reviewer limitation applies |
| Required/optional/excluded/critical labels, permitted sections | Per-claim adjudication pending DEV-447 |
| Editorial sample, rubric and proposed absolute/comparative gate | Pending Jinwoo/Zahra approval |
| Whole-job latency and processing failure tolerance | Pending PM decision; blocks next paid evaluation |
| Model/privacy/budget ledger and reviewer availability | Reconfirm before next run |
| Producer session / participant consent | Not scheduled or confirmed |

Use [review-form.md](review-form.md). Keep filled forms, source excerpts, mappings and page captures outside git. Publish only approved aggregates, versions/digests and limitations. Schedule-sheet reconciliation remains a PM follow-up; no dates or effort estimates are inferred here.
