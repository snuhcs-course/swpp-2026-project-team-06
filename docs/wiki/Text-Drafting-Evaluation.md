# Text-focused drafting evaluation

DEV-448 adds an explicit development-only evaluation path alongside the unchanged historical scorer and gold. It separates page-wide preservation, correctness/support, placement, repetition and processing. Deterministic capability is bounded; unknown semantic cases remain visible and no human-approved benchmark or calibrated accuracy is inferred. The complete per-format95% target is distinct from the historical critical gate.

Saved baseline/candidate outputs use identical evidence in the offline comparison. Both legacy and updated reports remain available; metric corrections and generator gains are separate. Explicit correct-empty cases are distinct from failures. No provider calls, production integration, photo/crop/visual benchmark, or source-policy changes are introduced by this evaluation path. Human source adjudication and release acceptance remain separate.


DEV-450 adds a separate explicit inventory writer adapter. The default v11 worker, queue, cache and owner draft flow remain unchanged. Requests bind inventory, target, source revisions, writer version and safety rules. KEEP text must preserve ordered unit values literally, allowing only NFC and whitespace-run normalization. Added prose, unit conversions and qualifier omissions are rejected. Every unit receives a disposition; exclusions and review decisions require review, while final safety rejection produces INCOMPLETE without raw-source rescue. Oversized requests fail rather than truncating units. Non-mock requests reject unmasked private strings before transmission.

The offline literal control uses the same accepted candidate snapshots as saved outputs and retains failed/partial sources. It is not model-improvement evidence, extraction recall, semantic calibration or producer acceptance. Full editorial rewriting, semantic deduplication, default adoption and owner workflow acceptance remain open.

Every writer result explicitly requires content review and labels its status as assembly accounting only. COMPLETE/EMPTY never mean approved content. Existing safety heuristics do not prove product/service relevance; this adapter does not claim to resolve that limitation. Saved baseline provenance is a declared snapshot, not an independently verified historical provider request.
