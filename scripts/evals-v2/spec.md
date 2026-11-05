# Evaluation system v2 · DEV-241

A separate measurement layer owns immutable cohorts, environment/provider/fidelity gates, transcript/outcome grading, grader validation and comparable reports. Product tuning and fixture definitions remain outside this folder. `evalsys.grade_trial(case, trace, manifest=None)` is the sealed-runner interface; `gate_cohort` rejects incomplete fidelity/provider smoke evidence. No holdout text is printed or inspected by the evaluator author.

- Development/holdout are exposure splits; regression/capability are independent evaluation purposes. Both axes are frozen before calls.
- Three independent trials per case; report attempted/planned, dimension outcomes, path coverage and cases with all three successful screenings.
- API responses are checked against both persisted read views; a self-reported action or provider model name alone is insufficient.
- Code graders cover explicit typed facts and bounded semantic rubrics, not unrestricted natural-language truth. Unsupported rubrics and missing evidence remain UNREVIEWED. Human/LLM calibration remains unperformed.
- API authentication errors invalidate live-model observations even if the application safely falls back. Rule, model, fault and fallback are separate populations.
- Never overwrite existing runs; compare only matching corpus/rubric/scorer/config/fixture/model cohorts. Regrade saved outputs to a new directory when scoring changes.

Cohort runners must supply the manifest to every trial grader. Actual model/provider mismatch invalidates a trial. Comparable arms require identical runner hashes. Saved comparisons require passing preflight artifacts bound to each manifest. The 8000ms fault acceptance budget is distinct from the retained harness HTTP deadline (60s); neither is a claim about the product provider timeout.
