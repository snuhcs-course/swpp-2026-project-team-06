"""AC-SRC-5/10: denominators and operational/content separation."""

import pytest

from app.source_analysis.evaluation_outcomes import split_outcomes


def fact(sid, status):
    return {"id": sid + "/fact", "sourceId": sid, "status": status, "requirement": "essential"}


def test_AC_SRC_5_failure_and_empty_and_content_are_distinct():
    jobs = [
        {"id": "failed", "status": "FAILED"},
        {"id": "empty", "status": "EMPTY"},
        {"id": "ok", "status": "EVALUATED"},
    ]
    got = split_outcomes(
        jobs,
        [fact("failed", "NOT_PROCESSED"), fact("empty", "NOT_PROCESSED"), fact("ok", "PRESERVED")],
        [],
    )
    assert got["failedAttempts"] == 1
    assert got["bucketCounts"]["processingFailureAffectedFacts"] == 1
    assert got["bucketCounts"]["contentOrScoringMisses"] == 1
    assert got["deliveredEssentialFacts"]["total"] == 3
    assert got["nonfailedAttemptEssentialCoverage"]["total"] == 2


def test_AC_SRC_5_partial_reading_is_not_confidently_a_writer_omission():
    got = split_outcomes(
        [{"id": "p", "status": "PARTIAL"}],
        [fact("p", "MISSING")],
        [{"id": "p", "status": "PARTIAL"}],
    )
    assert got["bucketCounts"]["partialProcessingUnattributedMisses"] == 1
    assert got["bucketCounts"]["contentOrScoringMisses"] == 0


def test_AC_SRC_5_not_run_stays_in_full_denominator():
    got = split_outcomes([{"id": "n", "status": "NOT_RUN"}], [fact("n", "NOT_PROCESSED")], [])
    assert got["notRunAttempts"] == 1 and got["nonfailedAttemptEssentialCoverage"]["rate"] is None
    assert got["deliveredEssentialFacts"]["rate"] == 0


def test_AC_SRC_5_inconsistent_failed_match_rejected():
    with pytest.raises(ValueError):
        split_outcomes([{"id": "n", "status": "FAILED"}], [fact("n", "PRESERVED")], [])


def test_AC_SRC_5_content_diagnostic_cohort_excludes_runtime_failure_not_valid_empty():
    jobs = [
        {"id": "f", "status": "FAILED"},
        {"id": "empty", "status": "EMPTY"},
        {"id": "rejected", "status": "FAILED", "reason": "CANDIDATES_REJECTED"},
    ]
    shared = [
        {"id": "f", "status": "FAILED"},
        {"id": "empty", "status": "EVALUATED"},
        {"id": "rejected", "status": "EVALUATED"},
    ]
    got = split_outcomes(
        jobs, [fact(s, "NOT_PROCESSED") for s in ["f", "empty", "rejected"]], shared
    )
    assert got["diagnosticContentCoverage"]["total"] == 2
    assert got["diagnosticContentCoverage"]["hit"] == 0
    assert got["diagnosticContentCoverage"]["unmeasuredEssentialFacts"] == 1
    assert got["bucketCounts"]["processingFailureAffectedFacts"] == 1
    assert got["bucketCounts"]["contentOrScoringMisses"] == 2
