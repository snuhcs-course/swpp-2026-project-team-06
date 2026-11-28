"""Invented controls for AC-SRC-2/3/5/10; no real human judgments are supplied here."""

import copy
import importlib.util
import json
import stat
from pathlib import Path

import pytest

MODULE_PATH = Path(__file__).resolve().parents[2] / "docs/evaluation/i5-text-scoring/calibration.py"
spec = importlib.util.spec_from_file_location("text_calibration", MODULE_PATH)
calibration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(calibration)


def packet(count=1):
    pairs = []
    for i in range(count):
        pair = {
            "id": f"pair-{i}",
            "sourceId": "synthetic-source",
            "sourceText": "표본 평균 당도는 12브릭스입니다.",
            "output": {"id": "synthetic-source", "modules": []},
            "gold": {"id": "synthetic-source", "sentences": []},
            "humanReviewState": "PENDING",
        }
        pair.update(
            sourceSha256=calibration.digest(pair["sourceText"].encode()),
            outputSha256=calibration.digest(calibration.canonical_bytes(pair["output"])),
            goldSha256=calibration.digest(calibration.canonical_bytes(pair["gold"])),
        )
        pairs.append(pair)
    return {
        "schemaVersion": 1,
        "split": "development",
        "purpose": "SOURCE_BOUND_CALIBRATION",
        "humanReview": "PENDING",
        "pairs": pairs,
    }


def labels(preservation="PASS", correctness="PASS", placement="PRIMARY"):
    return {"preservation": preservation, "correctness": correctness, "placement": placement}


def bindings(pair):
    return {"pairId": pair["id"], **{key: pair[key] for key in calibration.DIGESTS}}


def review(pair, *, supplied=None, state="REVIEWED"):
    return {
        **bindings(pair),
        "reviewerId": "invented-test-reviewer" if state == "REVIEWED" else "",
        "reviewerKind": "HUMAN",
        "reviewState": state,
        "adjudicationState": "NOT_REQUIRED" if state == "REVIEWED" else "PENDING",
        "labels": supplied if supplied is not None else labels(),
    }


def prediction(pair, *, supplied=None, status="EVALUATED"):
    return {
        **bindings(pair),
        "predictorId": "invented-test-system",
        "status": status,
        "labels": supplied if supplied is not None else labels(),
    }


def dimensions(result):
    return result["predictors"]["invented-test-system"]["dimensions"]


def test_AC_SRC_10_no_human_or_predictions_never_reports_accuracy():
    result = calibration.report(packet(), [], [])
    assert result["humanReview"]["pendingPairs"] == 1
    assert result["predictors"] == {}
    assert result["semanticCalibrationEstablished"] is False
    assert "accuracy" not in json.dumps(result).lower().replace("semantic accuracy", "")


def test_AC_SRC_10_pending_review_is_not_reference_truth():
    data = packet()
    result = calibration.report(
        data,
        [
            review(
                data["pairs"][0], state="PENDING", supplied=labels("UNKNOWN", "UNKNOWN", "UNKNOWN")
            )
        ],
        [prediction(data["pairs"][0])],
    )
    for metric in dimensions(result).values():
        assert metric["pendingHuman"] == 1
        assert metric["evaluated"] == 0
        assert metric["exactAgreement"]["rate"] is None


def test_AC_SRC_2_3_5_dimensions_and_error_directions_are_separate():
    data = packet(2)
    human = [
        review(data["pairs"][0], supplied=labels("PASS", "FAIL", "PERMITTED")),
        review(data["pairs"][1], supplied=labels("FAIL", "PASS", "MISPLACED")),
    ]
    preds = [prediction(p) for p in data["pairs"]]
    result = dimensions(calibration.report(data, human, preds))
    assert result["preservation"]["falseAccepts"] == 1
    assert result["preservation"]["falseRejects"] == 0
    assert result["correctness"]["falseAccepts"] == 1
    assert result["placement"]["exactAgreement"]["hit"] == 0
    assert result["placement"]["decisionAgreement"]["hit"] == 1
    assert result["placement"]["falseAccepts"] == 1
    preds[0]["labels"]["preservation"] = "FAIL"
    result = dimensions(calibration.report(data, human, preds))
    assert result["preservation"]["falseRejects"] == 1


@pytest.mark.parametrize("part", ["sourceText", "output", "gold"])
def test_AC_SRC_10_packet_tampering_is_rejected(part):
    data = packet()
    if part == "sourceText":
        data["pairs"][0][part] += " 변경"
    else:
        data["pairs"][0][part]["changed"] = "private-synthetic-payload"
    with pytest.raises(ValueError, match="redacted") as error:
        calibration.report(data, [], [])
    assert "private-synthetic-payload" not in str(error.value)


@pytest.mark.parametrize("digest_key", sorted(calibration.DIGESTS))
@pytest.mark.parametrize("kind", ["review", "prediction"])
def test_AC_SRC_10_stale_same_pair_versions_never_transfer_labels(digest_key, kind):
    data = packet()
    row = review(data["pairs"][0]) if kind == "review" else prediction(data["pairs"][0])
    row[digest_key] = "0" * 64
    with pytest.raises(ValueError, match="redacted"):
        calibration.report(
            data, [row] if kind == "review" else [], [row] if kind == "prediction" else []
        )


@pytest.mark.parametrize("kind", ["pair", "review", "prediction"])
def test_AC_SRC_10_duplicates_are_not_silently_merged(kind):
    data = packet()
    human = [review(data["pairs"][0])]
    preds = [prediction(data["pairs"][0])]
    if kind == "pair":
        data["pairs"].append(copy.deepcopy(data["pairs"][0]))
    elif kind == "review":
        human.append(copy.deepcopy(human[0]))
    else:
        preds.append(copy.deepcopy(preds[0]))
    with pytest.raises(ValueError, match="redacted"):
        calibration.report(data, human, preds)


@pytest.mark.parametrize(
    "mutation", ["proposal", "pending-label", "missing-reviewer", "unknown-id"]
)
def test_AC_SRC_10_unreviewed_or_assistant_claims_are_not_human_truth(mutation):
    data = packet()
    row = review(data["pairs"][0])
    if mutation == "proposal":
        row["reviewerKind"] = "ASSISTANT"
    elif mutation == "pending-label":
        row["reviewState"] = "PENDING"
    elif mutation == "missing-reviewer":
        row["reviewerId"] = ""
    else:
        row["pairId"] = "not-in-packet"
    with pytest.raises(ValueError, match="redacted"):
        calibration.report(data, [row], [])


def test_AC_SRC_10_partial_review_counts_only_supplied_dimensions():
    data = packet()
    human = [review(data["pairs"][0], supplied={"correctness": "PASS"})]
    result = calibration.report(data, human, [prediction(data["pairs"][0])])
    assert result["humanReview"]["reviewedPairs"] == 0
    assert result["humanReview"]["partiallyReviewedPairs"] == 1
    assert result["humanReview"]["pendingPairs"] == 1
    assert result["status"] == "PENDING_HUMAN_REVIEW"
    assert dimensions(result)["correctness"]["evaluated"] == 1
    assert dimensions(result)["preservation"]["evaluated"] == 0
    assert dimensions(result)["placement"]["pendingHuman"] == 1


def test_AC_SRC_10_failures_abstentions_unknowns_and_missing_rows_retained():
    data = packet(5)
    human = [review(p) for p in data["pairs"]]
    human[3]["labels"]["correctness"] = "UNKNOWN"
    preds = [
        prediction(
            data["pairs"][0], status="FAILED", supplied=labels("UNKNOWN", "UNKNOWN", "UNKNOWN")
        ),
        prediction(
            data["pairs"][1], status="ABSTAINED", supplied=labels("UNKNOWN", "UNKNOWN", "UNKNOWN")
        ),
        prediction(
            data["pairs"][2], status="NOT_RUN", supplied=labels("UNKNOWN", "UNKNOWN", "UNKNOWN")
        ),
        prediction(data["pairs"][3]),
    ]
    metric = dimensions(calibration.report(data, human, preds))["correctness"]
    assert metric["humanUnknown"] == 1
    assert metric["predictionFailures"] == metric["predictionAbstentions"] == 1
    assert metric["notRunPredictions"] == metric["missingPredictions"] == 1
    assert metric["evaluated"] == 0
    assert metric["exactAgreement"]["rate"] is None


def test_AC_SRC_10_packet_pending_does_not_imply_adjudication():
    data = packet()
    row = review(data["pairs"][0])
    row["adjudicationState"] = "PENDING"
    result = calibration.report(data, [row], [])
    assert result["humanReview"]["adjudicatedPairs"] == 0
    assert result["humanReview"]["pendingAdjudicationPairs"] == 1
    assert result["semanticCalibrationEstablished"] is False


def test_AC_SRC_10_cli_private_exclusive_output(tmp_path, capsys):
    source = tmp_path / "packet.json"
    source.write_text(json.dumps(packet(), ensure_ascii=False), encoding="utf-8")
    source.chmod(0o600)
    target = tmp_path / "report.json"
    args = ["--packet", str(source), "--out", str(target)]
    assert calibration.main(args) == 0
    assert stat.S_IMODE(target.stat().st_mode) == 0o600
    original = target.read_bytes()
    assert calibration.main(args) == 2
    assert target.read_bytes() == original
    assert "표본" not in capsys.readouterr().out


def test_AC_SRC_10_cli_rejects_public_input_permissions_and_checkout_output(tmp_path):
    source = tmp_path / "packet.json"
    source.write_text(json.dumps(packet()), encoding="utf-8")
    source.chmod(0o644)
    assert calibration.main(["--packet", str(source), "--out", str(tmp_path / "out.json")]) == 2
    source.chmod(0o600)
    assert calibration.main(["--packet", str(source), "--out", str(MODULE_PATH)]) == 2


def test_AC_SRC_10_holdout_or_extra_packet_fields_are_rejected():
    data = packet()
    data["split"] = "holdout"
    with pytest.raises(ValueError, match="redacted"):
        calibration.report(data, [], [])
    data["split"] = "development"
    data["proposedLabels"] = labels()
    with pytest.raises(ValueError, match="redacted"):
        calibration.report(data, [], [])
