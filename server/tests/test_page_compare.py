import pytest

from app.source_analysis.page_compare import (
    duplicate_texts,
    page_wide_recall,
    private_output,
    render_comparison,
    validate_limits,
)


def test_AC_SRC_3_comparison_escapes_generated_html():
    result = {
        "status": "EVALUATED",
        "modules": [{"module": "summary", "texts": ["<script>alert('bad')</script>"]}],
    }
    page = render_comparison(
        [{"id": "<source>", "trial": 1, "baseline": result, "candidate": result}]
    )
    assert "<script>" not in page
    assert "&lt;script&gt;" in page
    assert "&lt;source&gt;" in page


def test_AC_SRC_2_duplicate_diagnostic_does_not_claim_semantic_equality():
    modules = [
        {"module": "summary", "texts": ["제주 감귤", "제주감귤"]},
        {"module": "taste", "texts": ["예상 12Brix", "실측 12Brix"]},
    ]
    assert duplicate_texts(modules) == 1


@pytest.mark.parametrize("amount", [0, -1, 5.01, float("nan"), float("inf")])
def test_AC_SRC_10_compare_rejects_unbounded_or_invalid_budget(amount):
    with pytest.raises(ValueError):
        validate_limits(amount, 2, True)


def test_AC_SRC_10_compare_requires_explicit_consent():
    with pytest.raises(ValueError):
        validate_limits(5, 2, False)
    validate_limits(5, 2, True)


def test_AC_SRC_2_page_wide_diagnostic_keeps_failed_output_as_misses():
    source = {"sentences": [{"facts": [{"mustContain": ["12Brix"], "critical": True}]}]}
    record = {"status": "FAILED", "modules": [{"module": "taste", "texts": ["12Brix"]}]}
    assert page_wide_recall(source, record) == {
        "hit": 0,
        "total": 1,
        "criticalHit": 0,
        "criticalTotal": 1,
    }
    record["status"] = "EVALUATED"
    assert page_wide_recall(source, record)["hit"] == 1


def test_AC_SRC_6_private_comparison_rejects_other_checkout(tmp_path):
    (tmp_path / ".git").write_text("gitdir: elsewhere")
    with pytest.raises(ValueError):
        private_output(tmp_path / "private-output")


def test_AC_SRC_6_comparison_cli_redacts_source_exception(monkeypatch, capsys):
    from app.source_analysis import page_compare

    monkeypatch.setattr(
        "sys.argv",
        ["page_compare", "--snapshot", "s", "--gold", "g", "--baseline", "b", "--out", "o"],
    )

    def fail(args):
        raise ValueError("PRIVATE SOURCE AND KEY")

    monkeypatch.setattr(page_compare, "run", fail)
    assert page_compare.main() == 2
    output = capsys.readouterr().out
    assert "PRIVATE SOURCE" not in output
    assert "redacted" in output
