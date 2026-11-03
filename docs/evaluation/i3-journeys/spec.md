# I3 journey evaluation matrix

This folder holds the versioned, prospective test oracle for DEV-152. Product behavior remains defined by `docs/spec/` (not by this matrix). Execution results and private evidence are stored separately. The matrix links each scenario to its requirement, evaluator, environment prerequisite, denominator, verdict rule, and evidence location.

| Decision | Reason |
| --- | --- |
| Freeze the matrix with a digest before test execution | Prevent post-failure changes to expected outcomes or denominators. |
| Use isolated synthetic accounts, farms, products, orders, and messages | Avoid real payments, personal data, and shared production mutations. |
| Keep case verdicts and readiness targets separate from measured results | A planned test is not evidence of a working product. |
| Inherit the DEV-154 AI corpus and three-run policy | Keep AI targets and trial denominators consistent across I3 work. |

The authoritative case list is `matrix.csv`; `protocol.md` defines fixture, evidence, status, and aggregation rules. `manifest.json` records the frozen revision. `validate.py` checks the file shape and digest.
