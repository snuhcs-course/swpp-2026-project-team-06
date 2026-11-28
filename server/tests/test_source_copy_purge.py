"""DEV-452 private owner choices follow the owning batch during existing cleanup."""

import pytest

from app.admin.purge_except import purge
from app.core.db import get_sessionmaker
from app.source_analysis.models import SourceCopyDecision
from tests.test_purge_except import GUARDS, KEEP, extras, rows  # noqa: F401


@pytest.fixture
def source_choices(request):
    request.getfixturevalue("extras")
    with get_sessionmaker()() as db, db.begin():
        for suffix, actor in (("kang", "u-kang"), ("other", "u-admin")):
            db.add(
                SourceCopyDecision(
                    id=f"choice-{suffix}",
                    batch_id=f"batch-{suffix}",
                    target_id=f"target-{suffix}",
                    binding_hash=("a" if suffix == "kang" else "b") * 64,
                    action="EDIT",
                    value=f"테스트 수정 문구 {suffix}",
                    note=f"테스트 확인 이유 {suffix}",
                    module="storage",
                    actor_id=actor,
                    source_binding={
                        "version": "source-preserving-v1",
                        "evidence": [
                            {
                                "sourceId": f"source-{suffix}",
                                "sourceRevision": 2,
                                "page": 1,
                                "spanIds": ["span-1"],
                                "quote": f"테스트 원문 {suffix}",
                            }
                        ],
                        "sources": {f"source-{suffix}": {"revision": 2, "sanitizationVersion": 1}},
                    },
                )
            )
    return rows("source_copy_decisions")


def test_AC_SRC_6_11_source_choice_cleanup_preview_preserves_private_records(source_choices):
    report = purge(KEEP)
    assert not report.committed
    assert report.tables["source_copy_decisions"] == (1, 1)
    assert rows("source_copy_decisions") == source_choices


def test_AC_SRC_6_11_source_choice_cleanup_follows_batch_not_retained_actor(source_choices):
    report = purge(KEEP, commit=True, **GUARDS)
    assert report.committed
    # Preserve the kept farm's full private owner text, evidence, versions and actor.
    assert rows("source_copy_decisions") == [
        row for row in source_choices if row["batch_id"] == "batch-kang"
    ]
    assert {row["id"] for row in rows("source_batches")} == {"batch-kang"}
    assert any(row["id"] == "u-admin" for row in rows("users"))
    # A retained administrator actor does not retain another farm's private source copy.
    assert all(row["id"] != "choice-other" for row in rows("source_copy_decisions"))
