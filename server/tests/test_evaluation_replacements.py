"""AC-SRC-5/10: processing failures stay reliability evidence; content is not cherry-picked."""

import pytest

from app.source_analysis.evaluation_replacements import diagnostic, select


def job(status="FAILED", **extra):
    return {"id": "source", "trial": 1, "arm": "current", "status": status, **extra}


def attempt(n, status="EVALUATED", **extra):
    return {"attempt": n, "job": job(status, **extra), "shared": {"status": "EVALUATED"}}


def test_AC_SRC_5_first_success_selected_without_looking_at_quality():
    got = select(job(), {"status": "FAILED"}, [attempt(1, "EMPTY"), attempt(2)])
    assert got["selectedAttempt"] == 1 and got["contentMeasured"]


@pytest.mark.parametrize(
    "status,extra", [("EMPTY", {}), ("PARTIAL", {}), ("FAILED", {"reason": "CANDIDATES_REJECTED"})]
)
def test_AC_SRC_5_low_quality_completed_output_cannot_be_replaced(status, extra):
    with pytest.raises(ValueError, match="DIAGNOSTIC_ORIGINAL"):
        select(job(status, **extra), {"status": "EVALUATED"}, [attempt(1)])


def test_AC_SRC_5_runtime_read_failure_not_diagnostic_but_frozen_scope_limit_is_disclosed():
    assert not diagnostic(
        job("PARTIAL"), {"status": "PARTIAL", "diagnostics": {"pagesFailed": [{"number": 3}]}}
    )
    assert diagnostic(
        job("EVALUATED"), {"status": "EVALUATED", "parserMetadata": [{"pagesSkipped": 2}]}
    )


def test_AC_SRC_5_replacements_exhaust_to_not_measured_never_quality_zero():
    got = select(job(), {"status": "FAILED"}, [attempt(1, "FAILED"), attempt(2, "FAILED")])
    assert got["selectedAttempt"] is None and not got["contentMeasured"] and got["exhausted"]
    with pytest.raises(ValueError, match="LIMIT"):
        select(job(), {"status": "FAILED"}, [attempt(1), attempt(2), attempt(3)])


def test_AC_SRC_5_attempt_identity_and_order_are_bound():
    bad = attempt(2)
    with pytest.raises(ValueError, match="ORDER"):
        select(job(), {"status": "FAILED"}, [bad])
    bad = attempt(1)
    bad["job"]["id"] = "wrong"
    with pytest.raises(ValueError, match="IDENTITY"):
        select(job(), {"status": "FAILED"}, [bad])
