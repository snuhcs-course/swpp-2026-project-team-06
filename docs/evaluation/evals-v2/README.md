# Evaluation system v2 — DEV-241

This is a measurement layer, separate from product tuning. Exposure **split** (`development`, `holdout`) and evaluation **purpose** (`regression`, `capability`) are independent. A development improvement demonstrates recovery on known inputs; a comparable before/after sealed holdout measures generalization. A final-only holdout measures current ability, not improvement. Human review and LLM-judge calibration have **not** been performed.

## Reference and application

[Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/research/demystifying-evals-for-ai-agents) motivates separating tasks, repeated trials, grading and final environmental outcomes. We apply clean fixtures, transcript plus persisted API-read checks, reference/negative examples, separate capability/regression purposes, and all-three-trial stability. Code grading is bounded and can miss valid paraphrases or unsupported narrative claims; it does not establish complete semantic accuracy. Manual/LLM calibration remains UNREVIEWED. These are implementation choices for Farmclub, not assertions that Anthropic endorsed this harness.

## Measurement contracts

- Freeze corpus bytes, per-case rubric, grader digest, model/provider, environment configuration and fixture revision before calls. Record subject code/prompt versions separately: these are allowed to differ in before/after comparisons.
- Preflight refuses the full run unless all case fixtures reproduce their source evidence, the local API process belongs to the intended checkout with no source changes since process start, and a genuine product-path model smoke has HTTP 200, actual model, response ID, token usage, upstream request delta and persistence in both read views. A successful direct provider call alone is insufficient.
- Rule successes count as system successes and do not enter the model denominator. Model N=0 is N/A. A model attempt with 401/invalid provider metadata is INVALID; safe fallback is recorded separately, never model-quality PASS. Controlled faults and HUMAN-only state cases are separate populations.
- Each trial records original transcript and both persisted views. Action, bounded factual grounding, typed semantic correctness, state outcomes and privacy are separate dimensions. Missing/unsupported semantic rubric is UNREVIEWED, not PASS. Gold/fixture defects and environment/harness errors are separated from product failures.
- Three trials per case; all planned cases remain in the denominator, including invalid/blocked/unrun. Report all-three successful screenings, at-least-one success separately, path coverage, p50/p95 latency and known cost plus unknown cost counts. AUTO_PASS_PENDING_REVIEW is an automated screening result, not human validation or readiness.
- Never overwrite cohorts or old results. Rescoring writes a new directory. Comparisons reject corpus/gold-rubric/grader/model/provider/runtime-config mismatches; if the grader changes, rescore both stored output sets with the same new grader.
- The adapter permits only local APIs/databases. No product endpoints, keys or source files are changed. Cohort output contains synthetic development text and is private/ignored; only aggregates should be shared. A sealed holdout uses the same public grader through its independent owner wrapper; this author does not read source/gold or case-level holdout output.

## Bounded semantic rubric

Known legacy facts map to typed relations (shipping fee, surcharge/free shipping, delivery interval, measured versus expected Brix, cool storage, washing, one-box minimum, sequential shipment). These require the relevant relation/qualifier as well as its value; a number-only answer cannot pass. A public `rubric.facts` entry can alternatively use `kind: concept`, `all_of` groups of acceptable phrase variants and `none_of` contradictions. Missing concepts fail, an unknown fact kind is UNREVIEWED. This limited vocabulary is documented screening, not universal Korean natural-language understanding.

Source-analysis imports retain exact-substring gold coverage, unsupported-token and forbidden-content proxies, by-format failures, latency and cost. Detector counts can overlap across fields/sources and do not represent unique affected materials. These are **diagnostic code metrics**, not semantic recall/precision. Historical results without provider trace or scorer-code attestation remain ineligible for verified model-quality comparison even when their inputs and metric-version match; they are not erased.

## Commands

```sh
# Offline standard-library self-tests (no DB, provider, paid calls).
make test-evals-v2

# Read-only source diagnostic comparison; inputs are development artifacts only.
python3 scripts/evals-v2/run.py source-compare \
  --before ../dev238-source-before --after ../dev238-source-after \
  --out /tmp/source-evals-v2-comparison.json

# Full development/regression run through the owner's existing legacy runner.
# Each cohort must run in its own process with its own local API, proxy and database.
# The shared $10 budget is managed by the main/tuning owner. Do not run concurrently on one proxy.
export DATABASE_URL='postgresql+psycopg://farmclub:farmclub@127.0.0.1:5432/farmclub_dev238'
export FIXED_NOW='2026-10-07T10:00:00+09:00'
cd server
uv run python ../scripts/evals-v2/run.py run \
  --runner /absolute/subject-checkout/scripts/i3-ai-support/run.py \
  --cases ../docs/evaluation/i3-ai-support/questions.jsonl \
  --api http://localhost:8000 --proxy http://127.0.0.1:8787 \
  --out /tmp/new-unique-cohort --cohort after-v2 \
  --split development --purpose regression --smoke-case CS-031 \
  --expected-cases-sha c0bcef7f21f65484fe2d903cb26cb0e95041452ad70b19d5529563b788012ab8 \
  --actual-model anthropic/claude-haiku-4.5 --provider-route openrouter-compatible \
  --max-usd 2
# Add --preflight-only to stop after fixture checks and the model smoke.
# This is still one potentially paid model smoke; main/owner budget coordination is required.
```

The first `make setup` installs the repository's existing dependencies. The v2 library/self-tests use only Python's standard library; the live adapter imports the subject runner and its existing server environment. An intended API checkout/process mismatch or source edit after start requires restarting the correct local API, not overriding the gate.

`--trial-reserve-usd` (default 0.01) is a conservative per-trial allowance, not a provider-side billing cap. Before a trial the CLI checks remaining allocated budget; after unknown/excess cost or invalid provider provenance it stops further calls. The owner must provide a valid per-request bound and account for any unfinalized reservations and all other feature calls. Unknown cost is never silently zero.

```sh
python3 scripts/evals-v2/run.py rescore --input /tmp/old-cohort --out /tmp/new-rescore
python3 scripts/evals-v2/run.py compare --before /tmp/before-v2 --after /tmp/after-v2
```

Private holdout paths/gold are never passed to this author's development CLI. Its independent sealed wrapper imports `evalsys` and emits aggregates only. No paid holdout execution is implied by building this system.

The frozen manifest uses canonical parsed-JSON hashes for `cases_sha256`, `rubric_sha256` and `config_sha256`; `cases_file_sha256` separately identifies the original JSONL bytes. `runner_sha256` must match between arms. Product commit/source and prompt changes are permitted treatments, while evaluator, fixture, dataset, model and provider remain fixed. Each paid trace is checked against the manifest's actual model and provider. Sealed owners must call `grade_trial(case, trace, manifest)`.

`--timeout-ms` is the fault-response acceptance budget, fixed at 8000 for this grader version. It does not configure the product's provider deadline. The retained harness uses a 60-second HTTP client deadline, recorded separately in `config.runner_http_timeout_seconds`. Runtime settings outside this attestation are not independently certified. Nonfinite or nonpositive budget/reservation values fail before adapter setup or API calls.

Saved chat comparisons require a passing `gate.json` bound to the manifest digest. Offline rescore validates the original gate, rechecks the saved fidelity/smoke under the new scorer, and copies original transcripts into a new output directory. Legacy ungated results remain historical records and cannot become a verified chat comparison by adding a summary alone.

CI runs the offline contract suite in the existing changes job using Ubuntu’s built-in Python. It needs no database, model credentials or dependencies, and any failure blocks ci-ok. This step never invokes the live runner.


The retained [final-only source holdout aggregate](source-final-holdout-2026-11-05.json) is **INVALID_INCOMPLETE_COHORT**, not an improvement measurement or successful holdout acceptance. The original plan was 12 sources / 134 facts / 33 critical facts. Outputs were retained for 9/12 sources, whose gold denominator is 98 facts / 24 critical facts. Separate offline scoring of those retained outputs found 53/98 and 11/24 strict matches. The full-plan coverage lower bound is 53/134 and 11/33; the three unobserved PDF outputs must not be treated as demonstrated semantic wrong answers.

Runtime statuses were 7 evaluated, 2 empty and 3 failed. The guard preserved 59 successful HTTP/model/usage observations, then blocked further calls with REQUEST_UNCERTAIN. The original exception type/stack was not retained, so neither external dispatch nor a network cause is established. The run also failed before producing its normal score/report; the offline partial artifacts remain private and separate. No measurement retry, product tuning or grader change followed. Settled cost including the public synthetic smoke was $0.112476; unsettled reservations were $0.580738 (conservative budget consumption $0.693214). Semantic and human review remain UNREVIEWED. The public artifact contains aggregate measurements only; original inputs, gold and individual outcomes remain private.
