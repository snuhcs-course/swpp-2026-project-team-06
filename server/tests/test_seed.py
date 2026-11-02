"""DEV-171: seed truth must survive failed T12 tests and worker restarts."""

import os
import re
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.catalog.models import Product
from app.core.db import Base, get_sessionmaker
from app.core.seed import seed_product
from app.source_analysis.models import (
    Asset,
    Batch,
    Candidate,
    Draft,
    Item,
    Page,
    ProductWorkspace,
    PublicPhoto,
    RequestRecord,
    ReviewedField,
    Run,
    Spend,
)

ROOT = Path(__file__).resolve().parents[2]


def database_state():
    with get_sessionmaker()() as db:
        return {
            table.name: list(db.execute(select(table).order_by(*table.primary_key)).mappings())
            for table in Base.metadata.sorted_tables
        }


def pollute_product(db):
    product = db.get(Product, "p-house")
    product.name = "테스트 감귤"
    product.description = "T12 소개"
    product.photos = ["/api/source-media/t12"]
    product.info = {"origin": "T12"}
    product.detail_content = {"blocks": [{"type": "text", "text": "T12"}]}
    product.module_detail = {"schemaVersion": 1, "modules": [{"id": "hero", "texts": []}]}
    product.version += 10
    product.sales_paused = True
    product.reject_reason = "T12"
    product.shipping_fee = 1234
    product.measured_brix = None


def test_AC_SRC_9_seed_product_restores_all_columns_and_preserves_related_seed_rows():
    expected = database_state()
    with get_sessionmaker()() as db, db.begin():
        pollute_product(db)
        db.flush()
        restored = seed_product(db, "p-house")
        assert restored.module_detail is None
        assert restored.detail_content is None
        assert restored.version == 1
    assert database_state() == expected


def source_graph(db, tmp_path, product_id, *, workspace=False, targeted=True, deleted=False):
    def file_key():
        key = uuid4().hex + "/" + uuid4().hex
        path = tmp_path / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"T12 fixture")
        return key

    batch = Batch(
        farm_id="f-kang",
        targets=[{"id": "target", "productId": product_id}] if targeted else [],
        deleted=deleted,
    )
    db.add(batch)
    db.flush()
    asset = Asset(
        batch_id=batch.id,
        checksum="a" * 64,
        storage_key=file_key(),
        filename="fixture.txt",
        mime="text/plain",
        size=11,
        target_ids=["target"],
        deleted=deleted,
    )
    run = Run(batch_id=batch.id, mode="mock", model="mock", targets=batch.targets)
    db.add_all([asset, run])
    db.flush()
    # Both phases are attached to the same run; refinements must not survive cleanup.
    for phase in ("EXTRACT", "REFINE"):
        item = Item(
            run_id=run.id,
            asset_id=asset.id,
            revision=1,
            target_ids=["target"],
            phase=phase,
            refinement={"instruction": "T12"} if phase == "REFINE" else {},
        )
        db.add(item)
        db.flush()
        db.add(
            Candidate(
                batch_id=batch.id,
                item_id=item.id,
                target_id="target",
                field_key="summary",
                value="T12",
                evidence=[],
            )
        )
    db.add_all(
        [
            Page(
                asset_id=asset.id,
                revision=1,
                number=1,
                spans=[],
                redacted_spans=[],
                image_key=file_key(),
                sanitized_key=file_key(),
            ),
            ReviewedField(
                batch_id=batch.id,
                target_id="target",
                field_key="summary",
                value="T12",
                state="CONFIRMED",
                provenance="MANUAL",
                candidate_ids=[],
            ),
            Draft(batch_id=batch.id, target_id="target", snapshot={"T12": True}),
            PublicPhoto(product_id=product_id, storage_key=file_key()),
        ]
    )
    if workspace:
        db.add(
            ProductWorkspace(
                product_id=product_id,
                batch_id=batch.id,
                target_id="target",
                snapshot={"T12": True},
                published_snapshot={},
                base_product_version=1,
            )
        )
    requests = [
        ("create", {"id": batch.id}),
        (f"{batch.id}/drafts", {}),
        ("product-workspace", {"productId": product_id}),
        ("page-save:" + product_id, {}),
        ("page-apply:" + product_id, {}),
    ]
    for scope, response in requests:
        db.add(
            RequestRecord(
                farm_id="f-kang",
                scope=scope,
                key=uuid4().hex,
                digest="a" * 64,
                response=response,
            )
        )
    db.flush()


@pytest.mark.parametrize("workspace", [False, True])
def test_AC_SRC_9_T12_restore_uses_seed_truth_across_worker_restarts(tmp_path, workspace):
    # Run the exact cleanup embedded in the Playwright hooks, in fresh Python
    # processes just as each Playwright worker does. No snapshot is carried over.
    source = (ROOT / "scripts/e2e/producer-format-flow.spec.ts").read_text()
    cleanup = re.search(r"const restoreSeed = `\n(.*?)\n`;", source, re.S).group(1)
    env = {
        **os.environ,
        "APP_ENV": "local",
        "SOURCE_ANALYSIS_PROVIDER": "mock",
        "SOURCE_STORAGE": "local",
        "SOURCE_STORAGE_DIR": str(tmp_path),
        "OPENAI_API_KEY": "",
        "OPENROUTER_API_KEY": "",
        "ANTHROPIC_API_KEY": "",
    }

    def restore():
        subprocess.run([sys.executable, "-c", cleanup], cwd=ROOT / "server", env=env, check=True)

    with get_sessionmaker()() as db, db.begin():
        source_graph(db, tmp_path, "p-redhyang", workspace=True)
        db.add(Spend(id="keep-ledger", reserved_micros=0))
    expected = database_state()
    expected_files = {path.relative_to(tmp_path) for path in tmp_path.glob("*/*")}

    # Begin already polluted, then repeat in a new process after another failed
    # worker: the old beforeAll snapshot could have adopted either polluted state.
    for _ in range(2):
        with get_sessionmaker()() as db, db.begin():
            pollute_product(db)
            source_graph(db, tmp_path, "p-house", deleted=True)
            if workspace:
                # Workspace linkage alone must work even without a product target.
                source_graph(db, tmp_path, "p-house", workspace=True, targeted=False)
        restore()
        assert database_state() == expected
        assert {path.relative_to(tmp_path) for path in tmp_path.glob("*/*")} == expected_files
        # Normal afterAll + next beforeAll can reset an already clean product.
        restore()
        assert database_state() == expected
        assert {path.relative_to(tmp_path) for path in tmp_path.glob("*/*")} == expected_files
