"""DEV-58 / AC-SRC-4/5/9/10: preserve grounded candidates without relaxing validation."""

import pytest
from sqlalchemy import select

from app.ai.source_analysis import extract
from app.core.db import get_sessionmaker
from app.source_analysis import worker
from app.source_analysis.models import Candidate, Item
from app.source_analysis.preprocess import scrub
from tests.test_source_analysis import (
    PREFIX,
    create,
    drain,
    key,
    source_settings,
    start,
    upload,
)

__all__ = ["source_settings"]


@pytest.mark.parametrize(
    "text",
    [
        "나주의 대표 특산물 '배' 선물세트!",
        "제주의 대표 감귤",
        "대표 상품 안내",
        "선물용 5kg (5-6과)",
        "1000여개 농가와 계약",
        "가격 48,000원 → 42,000원",
    ],
)
def test_AC_SRC_4_preserve_sales_descriptions(text):
    assert scrub(text) == text


@pytest.mark.parametrize(
    "text",
    [
        "문의 02)123-4567",
        "02-1234-5678",
        "031 123 4567",
        "01012345678",
        "대표자: 홍길동",
        "대표: 홍길동",
        "담당자 홍길동",
        "이메일 test@example.com",
        "1588-1234",
        "070-1234-5678",
    ],
)
def test_AC_SRC_4_filter_document_contacts(text):
    assert "[가림]" in scrub(text)


def response_with_bad_quote(mode, model, chunk, targets, images):
    result = extract(mode, model, chunk, targets, images)
    bad = result.extraction.candidates[0].model_copy(deep=True)
    bad.evidence[0].quote = "private-rejected-quote"
    result.extraction.candidates.append(bad)
    return result


def run_response(client, login, monkeypatch, fn):
    h = login("u-kang")
    b = create(client, h)
    upload(client, h, b)
    monkeypatch.setattr(worker, "extract", fn)
    r = start(client, h, b["id"])
    drain()
    result = client.get(f"{PREFIX}/{b['id']}/runs/{r['id']}", headers=h)
    return h, b, result


@pytest.mark.parametrize("omit_confirmed", [False, True])
def test_AC_SRC_5_partial_retry_preserves_confirmed_edits_and_candidate_ids(
    client, login, monkeypatch, omit_confirmed
):
    h, b, result = run_response(client, login, monkeypatch, response_with_bad_quote)
    run = result.json()
    assert run["status"] == "PARTIAL"
    assert run["completed"] == run["total"]
    item = next(i for i in run["items"] if i["phase"] == "EXTRACT")
    assert (item["status"], item["acceptedCount"], item["rejectedCount"]) == ("PARTIAL", 3, 1)
    assert "diagnostics" not in result.text and "private-rejected-quote" not in result.text
    with get_sessionmaker()() as db:
        rejected = db.get(Item, item["id"]).diagnostics["rejected"][0]
        assert rejected["index"] == 3 and rejected["reason"] == "QUOTE_NOT_VERBATIM"
    review = client.get(f"{PREFIX}/{b['id']}/review", headers=h).json()
    name = next(c for c in review["candidates"] if c["fieldKey"] == "name")
    manual = "생산자가 직접 입력한 문의 02-123-4567"
    result = client.patch(
        f"{PREFIX}/{b['id']}/review",
        headers=h,
        json={
            "reviewVersion": review["reviewVersion"],
            "fields": [
                {
                    "targetId": name["targetId"],
                    "fieldKey": "name",
                    "value": name["value"],
                    "state": "CONFIRMED",
                    "provenance": "EXTRACTED",
                    "candidateIds": [name["id"]],
                },
                {
                    "targetId": name["targetId"],
                    "fieldKey": "storage",
                    "value": manual,
                    "state": "CONFIRMED",
                    "provenance": "PRODUCER",
                },
            ],
        },
    )
    assert result.status_code == 200, result.text

    def retry_result(*args):
        reply = extract(*args)
        reply.extraction.candidates = [
            c
            for c in reply.extraction.candidates
            if c.field_key != "summary" and not (omit_confirmed and c.field_key == "name")
        ]
        return reply

    monkeypatch.setattr(worker, "extract", retry_result)
    result = client.post(
        f"{PREFIX}/{b['id']}/runs/{run['id']}/retry", headers=key(h), json={"itemIds": [item["id"]]}
    )
    assert result.status_code == 202, result.text
    retry_id = result.json()["id"]
    drain()
    assert (
        client.get(f"{PREFIX}/{b['id']}/runs/{retry_id}", headers=h).json()["status"] == "SUCCEEDED"
    )
    review = client.get(f"{PREFIX}/{b['id']}/review", headers=h).json()
    active = [c for c in review["candidates"] if not c["outdated"]]
    assert len(active) == 2
    assert next(c for c in active if c["fieldKey"] == "name")["id"] == name["id"]
    assert next(f for f in review["fields"] if f["fieldKey"] == "storage")["value"] == manual
    with get_sessionmaker()() as db:
        assert len(list(db.scalars(select(Candidate).where(Candidate.batch_id == b["id"])))) == 3


def test_AC_SRC_5_all_rejected_is_failed_with_private_diagnostics(client, login, monkeypatch):
    def all_bad(*args):
        reply = response_with_bad_quote(*args)
        reply.extraction.candidates = reply.extraction.candidates[-1:]
        return reply

    h, b, result = run_response(client, login, monkeypatch, all_bad)
    assert result.json()["status"] == "FAILED"
    item = next(i for i in result.json()["items"] if i["phase"] == "EXTRACT")
    assert (item["acceptedCount"], item["rejectedCount"]) == (0, 1)
    assert "private-rejected-quote" not in result.text
    assert not client.get(f"{PREFIX}/{b['id']}/review", headers=h).json()["candidates"]


@pytest.mark.parametrize(
    "kind,code",
    [
        ("number", "UNSUPPORTED_NUMBER"),
        ("target", "INVALID_TARGET"),
        ("span", "INVALID_EVIDENCE"),
        ("phone", "UNSUPPORTED_PRIVATE_VALUE"),
        ("claim", "UNSUPPORTED_CLAIM"),
    ],
)
def test_AC_SRC_4_candidate_isolation_keeps_other_guards(kind, code):
    from app.ai.source_analysis import MOCK_SHA, MOCK_TEXT

    chunk = {
        "sourceId": "s",
        "sourceRevision": 1,
        "checksum": MOCK_SHA,
        "pages": [
            {
                "number": 1,
                "spans": [
                    {"id": str(i), "text": text} for i, text in enumerate(MOCK_TEXT.splitlines())
                ],
            }
        ],
    }
    reply = extract("mock", "mock", chunk, [{"id": "t"}], [])
    bad = reply.extraction.candidates[0]
    if kind == "number":
        bad.value = "감귤 999kg"
    elif kind == "target":
        bad.target_id = "other"
    elif kind == "span":
        bad.evidence[0].span_ids = ["unknown"]
    elif kind == "phone":
        bad.value = "문의 02)123-4567"
        bad.evidence[0].quote = bad.value
    else:
        bad.value = "유기농 감귤"
    accepted, diagnostics = worker.validate_candidates(reply.extraction, chunk, {"t"})
    assert len(accepted.candidates) == 2
    assert diagnostics["rejected"][0]["code"] == code
