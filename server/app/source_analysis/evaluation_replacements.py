"""Predeclared processing-only replacement; never select outputs by their scores."""

MAX_REPLACEMENTS = 2
VERSION = "processing-replacements-v1"


def diagnostic(job, shared):
    """A valid low-coverage/empty result is diagnostic; unread input is not."""
    if shared.get("status") not in {"EVALUATED", "PARTIAL"}:
        return False
    diagnostics = [shared.get("diagnostics", {}), *job.get("extractionDiagnostics", [])]
    if any(d.get("pagesFailed") or d.get("chunksFailed") for d in diagnostics):
        return False
    if job["status"] in {"EVALUATED", "PARTIAL", "EMPTY"}:
        return True
    return job["status"] == "FAILED" and job.get("reason") == "CANDIDATES_REJECTED"


def select(original, original_shared, replacements):
    """Input is chronological attempt order; returns metadata, never accepts a score."""
    if len(replacements) > MAX_REPLACEMENTS:
        raise ValueError("REPLACEMENT_LIMIT_EXCEEDED")
    identity = (original["id"], original["trial"], original["arm"])
    for number, attempt in enumerate(replacements, 1):
        job = attempt["job"]
        if (job["id"], job["trial"], job["arm"]) != identity or attempt["attempt"] != number:
            raise ValueError("REPLACEMENT_IDENTITY_OR_ORDER_MISMATCH")
    if diagnostic(original, original_shared):
        if replacements:
            raise ValueError("DIAGNOSTIC_ORIGINAL_CANNOT_BE_REPLACED")
        return {"selectedAttempt": 0, "contentMeasured": True, "needsReplacement": False}
    selected = next((a["attempt"] for a in replacements if diagnostic(a["job"], a["shared"])), None)
    return {
        "selectedAttempt": selected,
        "contentMeasured": selected is not None,
        "needsReplacement": selected is None and len(replacements) < MAX_REPLACEMENTS,
        "exhausted": selected is None and len(replacements) == MAX_REPLACEMENTS,
    }
