"""DEV-346: every product page opens in the composer (FEAT-04, AC-SRC-9/11).

A product page made outside the composer is turned into one composer draft on first open.
Photos are referenced as they are, so applying the untouched draft keeps the public page.
"""

from copy import deepcopy
from uuid import uuid4

from sqlalchemy import func, select

from app.catalog.models import Product
from app.core.db import get_sessionmaker
from app.source_analysis.models import Asset, Draft, ProductWorkspace, PublicPhoto, ReviewedField
from app.source_analysis.storage import Storage
from tests.test_source_analysis import source_settings  # noqa: F401

BASE = "/api/source-analysis/product-workspaces"
SOURCE = "/api/source-analysis/batches"


def headers(login):
    return {**login("u-kang"), "Idempotency-Key": str(uuid4())}


def open_composer(client, login, pid="p-house", composer=True):
    response = client.post(
        BASE, headers=headers(login), json={"productId": pid, "composer": composer}
    )
    assert response.status_code == 200, response.text
    return response.json()


def drafts(client, login, bid):
    return client.get(f"{SOURCE}/{bid}/drafts", headers=login("u-kang")).json()["items"]


def apply_latest(client, login, row, pid="p-house"):
    draft = drafts(client, login, row["batchId"])[0]
    with get_sessionmaker()() as db:
        version = db.get(Product, pid).version
    return client.post(
        f"{SOURCE}/{row['batchId']}/drafts/{draft['id']}/apply",
        headers=headers(login),
        json={"productId": pid, "productVersion": version, "draftVersion": draft["version"]},
    )


def by_id(modules):
    return {m["id"]: {k: m[k] for k in ("texts", "photos", "illustrationId")} for m in modules}


MODULES = [
    {
        "id": "hero",
        "texts": [{"fieldKey": "name", "value": "하우스 감귤"}],
        "photos": [],
        "illustrationId": None,
    },
    {
        "id": "taste",
        "texts": [{"fieldKey": "taste", "value": "새콤달콤해요"}],
        "photos": [{"uri": "/photos/tangerine-box.jpg", "alt": "상자"}],
        "illustrationId": None,
    },
    {
        "id": "sizePhoto",
        "texts": [],
        "photos": [{"uri": "https://cdn.example.com/size.jpg", "alt": "크기"}],
        "illustrationId": "hand-citrus-medium",
    },
]


def set_modules(modules=MODULES, pid="p-house"):
    with get_sessionmaker()() as db:
        product = db.get(Product, pid)
        product.module_detail = {"schemaVersion": 1, "modules": deepcopy(modules)}
        db.commit()


def test_AC_SRC_9_FEAT_04_module_page_becomes_one_composer_draft(client, login):
    set_modules()
    row = open_composer(client, login)
    assert row["composer"] is True
    [draft] = drafts(client, login, row["batchId"])
    snap = draft["snapshot"]
    batch = client.get(f"{SOURCE}/{row['batchId']}", headers=login("u-kang")).json()
    uri = {s["id"]: s["productPhoto"]["uri"] for s in batch["sources"]}
    # Same text, same photos (referenced by URI, not copied), same illustration.
    preview = {
        m["id"]: (
            m["texts"],
            [uri[i] for i in m["photoAssetIds"]],
            m["illustrationId"],
        )
        for m in snap["previewModules"]
    }
    assert preview == {
        m["id"]: (m["texts"], [p["uri"] for p in m["photos"]], m["illustrationId"]) for m in MODULES
    }
    # The representative is the product's current first photo.
    assert uri[snap["representativeAssetId"]] == "/photos/basket.jpg"
    assert all(s["originalPhoto"] and s["status"] == "PREPARED" for s in batch["sources"])
    with get_sessionmaker()() as db:
        assert db.get(Product, "p-house").module_detail["modules"] == MODULES  # nothing applied
        fields = db.scalars(select(ReviewedField).where(ReviewedField.batch_id == row["batchId"]))
        assert {(f.state, f.provenance) for f in fields} == {("CONFIRMED", "PRODUCER")}


def test_AC_SRC_9_untouched_migrated_draft_applies_to_the_same_page(client, login):
    set_modules()
    with get_sessionmaker()() as db:
        product = db.get(Product, "p-house")
        before_photos, before = list(product.photos), deepcopy(product.module_detail)
        public_photos = db.scalar(select(func.count()).select_from(PublicPhoto))
    row = open_composer(client, login)
    applied = apply_latest(client, login, row)
    assert applied.status_code == 200, applied.text
    with get_sessionmaker()() as db:
        product = db.get(Product, "p-house")
        assert product.photos == before_photos
        assert by_id(product.module_detail["modules"]) == by_id(before["modules"])
        # No bytes were copied for referenced photos.
        assert db.scalar(select(func.count()).select_from(PublicPhoto)) == public_photos
    page = client.get("/api/products/p-house").json()
    assert by_id(page["moduleDetail"]["modules"]) == by_id(before["modules"])
    assert page["photo"] == before_photos[0]


def test_AC_SRC_9_blocks_page_converts_to_summary_and_keeps_content(client, login):
    blocks = [
        {"id": "a", "type": "text", "title": "물을 아껴 키웠어요", "body": "효돈 하우스"},
        {"id": "b", "type": "image", "uri": "/photos/greenhouse.jpg", "alt": "하우스"},
        {"id": "c", "type": "text", "title": "", "body": "수확 당일 보내요"},
    ]
    with get_sessionmaker()() as db:
        product = db.get(Product, "p-house")
        product.module_detail = None
        product.detail_content = {"blocks": blocks}
        db.commit()
    row = open_composer(client, login)
    assert row["composer"] is True
    [draft] = drafts(client, login, row["batchId"])
    [summary] = draft["snapshot"]["previewModules"]
    assert summary["id"] == "summary"
    assert summary["texts"] == [
        {"fieldKey": "summary", "value": "물을 아껴 키웠어요\n효돈 하우스\n\n수확 당일 보내요"}
    ]
    assert apply_latest(client, login, row).status_code == 200
    with get_sessionmaker()() as db:
        [module] = db.get(Product, "p-house").module_detail["modules"]
    assert module["photos"] == [{"uri": "/photos/greenhouse.jpg", "alt": "하우스"}]
    assert module["texts"][0]["value"].endswith("수확 당일 보내요")


def test_AC_SRC_9_description_fallback_page_converts_to_summary(client, login):
    # Seeded p-house has no detail: buyers see its description as the story.
    with get_sessionmaker()() as db:
        description = db.get(Product, "p-house").description
    row = open_composer(client, login)
    [draft] = drafts(client, login, row["batchId"])
    assert draft["snapshot"]["previewModules"][0]["texts"] == [
        {"fieldKey": "summary", "value": description}
    ]


def test_AC_SRC_9_migration_is_idempotent_and_only_on_composer_open(client, login):
    set_modules()
    legacy = open_composer(client, login, composer=False)
    assert "composer" not in legacy
    with get_sessionmaker()() as db:
        assert db.scalar(select(func.count()).select_from(Draft)) == 0
    first = open_composer(client, login)
    second = open_composer(client, login)
    assert first["batchId"] == second["batchId"] == legacy["batchId"]
    with get_sessionmaker()() as db:
        assert db.scalar(select(func.count()).select_from(Draft)) == 1
        assert (
            db.scalar(
                select(func.count()).select_from(Asset).where(Asset.batch_id == first["batchId"])
            )
            == 3  # basket.jpg (representative), tangerine-box.jpg, size.jpg
        )


def test_AC_SRC_9_unapplied_legacy_revision_moves_into_the_draft(client, login):
    set_modules()
    row = open_composer(client, login, composer=False)
    snap = deepcopy(row["snapshot"])
    snap["modules"][1]["texts"][0]["value"] = "아직 반영 안 한 수정"
    saved = client.put(
        BASE + "/p-house",
        headers=headers(login),
        json={"version": row["version"], "snapshot": snap},
    )
    assert saved.json()["hasUnpublishedChanges"]
    migrated = open_composer(client, login)
    assert migrated["composer"] is True
    # The guard that blocked composer apply (PAGE_DRAFT_EXISTS) no longer applies.
    assert migrated["hasUnpublishedChanges"] is False
    [draft] = drafts(client, login, row["batchId"])
    taste = next(m for m in draft["snapshot"]["previewModules"] if m["id"] == "taste")
    assert taste["texts"][0]["value"] == "아직 반영 안 한 수정"
    with get_sessionmaker()() as db:  # still private
        modules = db.get(Product, "p-house").module_detail["modules"]
        assert modules[1]["texts"][0]["value"] == "새콤달콤해요"
    assert apply_latest(client, login, migrated).status_code == 200
    with get_sessionmaker()() as db:
        modules = by_id(db.get(Product, "p-house").module_detail["modules"])
        assert modules["taste"]["texts"][0]["value"] == "아직 반영 안 한 수정"


def test_AC_SRC_9_existing_wording_is_migrated_not_rejected(client, login):
    # Text rules (no prices) apply when the producer edits, never by dropping published text.
    modules = [{**MODULES[1], "texts": [{"fieldKey": "taste", "value": "5kg 32,000원"}]}]
    set_modules(modules)
    row = open_composer(client, login)
    assert row["composer"] is True
    assert apply_latest(client, login, row).status_code == 200
    with get_sessionmaker()() as db:
        texts = db.get(Product, "p-house").module_detail["modules"][0]["texts"]
    assert texts == modules[0]["texts"]


def test_AC_SRC_9_page_that_does_not_fit_stays_in_the_legacy_editor(client, login):
    long = [{"id": f"b{i}", "type": "text", "title": "", "body": "가" * 2000} for i in range(2)]
    with get_sessionmaker()() as db:
        product = db.get(Product, "p-house")
        product.module_detail = None
        product.detail_content = {"blocks": long}
        db.commit()
    row = open_composer(client, login)
    assert row["composer"] is False
    with get_sessionmaker()() as db:
        assert db.scalar(select(func.count()).select_from(Draft)) == 0


def test_AC_SRC_1_empty_new_product_opens_without_migration(client, login):
    created = client.post(BASE, headers=headers(login), json={}).json()
    row = open_composer(client, login, created["productId"])
    assert row["composer"] is True
    with get_sessionmaker()() as db:
        assert db.scalar(select(func.count()).select_from(Draft)) == 0


def test_AC_SRC_11_referenced_photos_are_not_analysed_and_cannot_be_reassigned(client, login):
    set_modules()
    row = open_composer(client, login)
    batch = client.get(f"{SOURCE}/{row['batchId']}", headers=login("u-kang")).json()
    started = client.post(
        f"{SOURCE}/{row['batchId']}/runs",
        headers=headers(login),
        json={"batchVersion": batch["version"]},
    )
    assert started.status_code == 400  # only referenced photos: nothing to analyse
    photo = batch["sources"][0]
    patched = client.patch(
        f"{SOURCE}/{row['batchId']}/sources/{photo['id']}",
        headers=headers(login),
        json={"sourceVersion": photo["revision"], "targetIds": [], "common": True},
    )
    assert patched.status_code == 400


def test_AC_SRC_5_referenced_public_photo_must_belong_to_the_product(client, login):
    with get_sessionmaker()() as db:
        other = PublicPhoto(product_id="p-redhyang", storage_key=Storage().put(b"x"))
        db.add(other)
        db.flush()
        set_uri = f"/api/source-media/{other.id}"
        db.get(Product, "p-house").photos = [set_uri]
        db.get(Product, "p-house").status = "DRAFT"  # the composer cover is applied before sale
        db.commit()
    row = open_composer(client, login)
    response = apply_latest(client, login, row)
    assert response.status_code == 409
    with get_sessionmaker()() as db:
        assert db.get(ProductWorkspace, "p-house").batch_id == row["batchId"]


def legacy_editor_save(client, login, text, pid="p-house"):
    """Edit the taste text in the legacy editor (ProductPageEditor) and return the saved row."""
    row = open_composer(client, login, pid, composer=False)
    snap = deepcopy(row["snapshot"])
    taste = next(m for m in snap["modules"] if m["id"] == "taste")
    taste["texts"][0]["value"] = text
    saved = client.put(
        f"{BASE}/{pid}", headers=headers(login), json={"version": row["version"], "snapshot": snap}
    )
    assert saved.status_code == 200, saved.text
    return saved.json()


def taste_text(pid="p-house"):
    with get_sessionmaker()() as db:
        return by_id(db.get(Product, pid).module_detail["modules"])["taste"]["texts"][0]["value"]


def test_AC_SRC_9_page_applied_in_the_legacy_editor_replaces_the_stale_composer_draft(
    client, login
):
    set_modules()
    row = open_composer(client, login)
    assert apply_latest(client, login, row).status_code == 200  # composer apply records the page
    saved = legacy_editor_save(client, login, "기존 편집기로 반영한 맛")
    applied = client.post(
        f"{BASE}/p-house/apply", headers=headers(login), json={"version": saved["version"]}
    )
    assert applied.status_code == 200, applied.text
    reopened = open_composer(client, login)
    assert reopened["composer"] is True
    latest = drafts(client, login, row["batchId"])[0]
    taste = next(m for m in latest["snapshot"]["previewModules"] if m["id"] == "taste")
    assert taste["texts"][0]["value"] == "기존 편집기로 반영한 맛"
    assert apply_latest(client, login, reopened).status_code == 200  # untouched apply keeps it
    assert taste_text() == "기존 편집기로 반영한 맛"


def test_AC_SRC_9_pre_dev346_draft_follows_the_buyer_visible_page(client, login):
    # A composer draft saved before the page was recorded (page_source is empty).
    set_modules()
    row = open_composer(client, login)
    assert apply_latest(client, login, row).status_code == 200
    saved = legacy_editor_save(client, login, "판매 중에 고친 맛")
    client.post(f"{BASE}/p-house/apply", headers=headers(login), json={"version": saved["version"]})
    with get_sessionmaker()() as db:
        db.get(ProductWorkspace, "p-house").page_source = None
        db.commit()
    open_composer(client, login)  # p-house is PUBLISHED: the buyer-visible page wins
    latest = drafts(client, login, row["batchId"])[0]
    taste = next(m for m in latest["snapshot"]["previewModules"] if m["id"] == "taste")
    assert taste["texts"][0]["value"] == "판매 중에 고친 맛"
    with get_sessionmaker()() as db:  # the same story is recorded once it matches
        assert db.get(ProductWorkspace, "p-house").page_source is not None


def unpublished_pre_dev346(client, login, module_page):
    set_modules()
    row = open_composer(client, login)
    with get_sessionmaker()() as db:
        db.get(ProductWorkspace, "p-house").page_source = None
        product = db.get(Product, "p-house")
        product.status = "DRAFT"
        if module_page:  # a different module page, e.g. applied with the legacy editor
            modules = deepcopy(product.module_detail["modules"])
            modules[1]["texts"][0]["value"] = "기존 편집기로 반영한 다른 페이지"
            product.module_detail = {"schemaVersion": 1, "modules": modules}
        else:  # only the description changed (kept by a composer apply)
            product.module_detail = None
            product.description = "상품 편집에서 쓴 설명"
        product.version += 1  # as an apply/PATCH does, so the workspace page is rebuilt
        db.commit()
    return row


def test_AC_SRC_9_pre_dev346_draft_of_an_unpublished_description_page_is_kept(client, login):
    row = unpublished_pre_dev346(client, login, module_page=False)
    assert open_composer(client, login)["composer"] is True
    assert len(drafts(client, login, row["batchId"])) == 1  # buyers see nothing: draft kept


def test_AC_SRC_9_unpublished_module_page_from_the_legacy_editor_is_not_lost(client, login):
    # A composer apply replaces module_detail, so a module page no draft matches moves in.
    row = unpublished_pre_dev346(client, login, module_page=True)
    assert open_composer(client, login)["composer"] is True
    latest = drafts(client, login, row["batchId"])[0]
    taste = next(m for m in latest["snapshot"]["previewModules"] if m["id"] == "taste")
    assert taste["texts"][0]["value"] == "기존 편집기로 반영한 다른 페이지"


def test_AC_SRC_9_unapplied_legacy_revision_after_a_composer_draft_is_never_stranded(client, login):
    set_modules()
    row = open_composer(client, login)
    assert apply_latest(client, login, row).status_code == 200
    legacy_editor_save(client, login, "반영 안 한 기존 편집기 수정")
    reopened = open_composer(client, login)
    assert reopened["composer"] is True and reopened["hasUnpublishedChanges"] is False
    assert taste_text() == "새콤달콤해요"  # still private
    assert apply_latest(client, login, reopened).status_code == 200  # no PAGE_DRAFT_EXISTS
    assert taste_text() == "반영 안 한 기존 편집기 수정"


def test_FEAT_04_basic_info_follows_the_product_on_every_composer_open(client, login):
    row = open_composer(client, login)
    with get_sessionmaker()() as db:
        product = db.get(Product, "p-house")
        product.variety, product.expected_brix = "상품 편집에서 고친 품종", 13.5
        db.commit()
    open_composer(client, login)
    batch = client.get(f"{SOURCE}/{row['batchId']}", headers=login("u-kang")).json()
    info = batch["targets"][0]["basicInfo"]
    assert (info["variety"], info["expectedBrix"]) == ("상품 편집에서 고친 품종", 13.5)


def test_AC_SRC_9_deleted_workspace_batch_is_replaced(client, login):
    set_modules()
    row = open_composer(client, login)
    version = client.get(f"{SOURCE}/{row['batchId']}", headers=login("u-kang")).json()["version"]
    deleted = client.request(
        "DELETE", f"{SOURCE}/{row['batchId']}", headers=login("u-kang"), json={"version": version}
    )
    assert deleted.status_code == 202, deleted.text
    reopened = open_composer(client, login)
    assert reopened["composer"] is True and reopened["batchId"] != row["batchId"]
    assert len(drafts(client, login, reopened["batchId"])) == 1


def test_AC_SRC_9_page_with_more_photos_than_a_batch_holds_stays_in_the_legacy_editor(
    client, login
):
    photos = [{"uri": f"/photos/p{i}.jpg", "alt": ""} for i in range(31)]
    modules = [
        {"id": "taste", "texts": [], "photos": photos[:20], "illustrationId": None},
        {"id": "farmPhotos", "texts": [], "photos": photos[20:], "illustrationId": None},
    ]
    set_modules(modules)
    assert open_composer(client, login)["composer"] is False


def test_AC_SRC_9_photo_only_page_gets_an_applicable_title_module(client, login):
    # Seeded p-cheonhye (rejected) has one photo and no story.
    row = open_composer(client, login, "p-cheonhye")
    [draft] = drafts(client, login, row["batchId"])
    assert [m["id"] for m in draft["snapshot"]["previewModules"]] == ["hero"]
    assert apply_latest(client, login, row, "p-cheonhye").status_code == 200


def test_AC_SRC_5_absolute_public_photo_url_is_checked_too(client, login):
    with get_sessionmaker()() as db:
        other = PublicPhoto(product_id="p-redhyang", storage_key=Storage().put(b"x"))
        db.add(other)
        db.flush()
        db.get(Product, "p-house").photos = [f"https://api.example.com/api/source-media/{other.id}"]
        db.get(Product, "p-house").status = "DRAFT"  # the composer cover is applied before sale
        db.commit()
    row = open_composer(client, login)
    assert apply_latest(client, login, row).status_code == 409


def basic_info(client, login, bid):
    batch = client.get(f"{SOURCE}/{bid}", headers=login("u-kang")).json()
    return batch, batch["targets"][0]["basicInfo"]


def save_basic_info(client, login, bid, **values):
    batch, info = basic_info(client, login, bid)
    saved = client.put(
        f"{SOURCE}/{bid}/basic-info",
        headers=login("u-kang"),
        json={
            "version": batch["version"],
            "targets": [{"targetId": batch["targets"][0]["id"], "basicInfo": {**info, **values}}],
        },
    )
    assert saved.status_code == 200, saved.text


def test_FEAT_04_unsold_product_keeps_composer_basic_info_across_reopen(client, login):
    # Before sale the batch is the source of truth (blur saves it; the product only on save).
    created = client.post(BASE, headers=headers(login), json={}).json()
    pid, bid = created["productId"], created["batchId"]
    save_basic_info(client, login, bid, variety="온주밀감", size="중과, 지름 6~7cm")
    open_composer(client, login, pid)
    _, info = basic_info(client, login, bid)
    assert (info["variety"], info["size"]) == ("온주밀감", "중과, 지름 6~7cm")


def test_FEAT_04_selling_product_picks_up_scr25_brix_without_losing_composer_size(client, login):
    row = open_composer(client, login)  # records what the product said
    save_basic_info(client, login, row["batchId"], size="composer에서 적은 크기")
    with get_sessionmaker()() as db:
        product = db.get(Product, "p-house")
        product.expected_brix = 14.0
        product.info = {**product.info, "size": ""}  # no SCR-25 input for size
        db.commit()
    open_composer(client, login)
    _, info = basic_info(client, login, row["batchId"])
    assert (info["expectedBrix"], info["size"]) == (14.0, "composer에서 적은 크기")


def test_AC_SRC_9_description_edit_after_composer_work_keeps_the_draft(client, login):
    row = open_composer(client, login)  # description-only page migrated
    from app.source_analysis import service
    from app.source_analysis.models import Batch
    from app.source_analysis.schemas import DraftSave, DraftTarget

    with get_sessionmaker()() as db:  # composer saves its work (a newer draft, new content)
        summary = db.scalar(
            select(ReviewedField).where(
                ReviewedField.batch_id == row["batchId"], ReviewedField.field_key == "summary"
            )
        )
        summary.value = "composer에서 고친 소개"
        batch = db.get(Batch, row["batchId"])
        batch.review_version += 1
        db.flush()
        service.save_drafts(
            db,
            batch,
            DraftSave(
                review_version=batch.review_version,
                targets=[DraftTarget(target_id=row["targetId"], enabled_module_ids=["summary"])],
            ),
            editor=True,
        )
        db.get(Product, "p-house").description = "상품 편집에서 고친 설명"
        db.commit()
    before = len(drafts(client, login, row["batchId"]))
    assert open_composer(client, login)["composer"] is True
    assert len(drafts(client, login, row["batchId"])) == before  # not re-migrated


def test_AC_SRC_9_description_edit_without_composer_work_is_migrated(client, login):
    row = open_composer(client, login)
    with get_sessionmaker()() as db:
        db.get(Product, "p-house").description = "상품 편집에서 고친 설명"
        db.commit()
    open_composer(client, login)
    latest = drafts(client, login, row["batchId"])[0]
    assert latest["snapshot"]["previewModules"][0]["texts"][0]["value"] == "상품 편집에서 고친 설명"


def test_AC_SRC_9_cover_that_is_also_a_story_photo_keeps_the_page_alt(client, login):
    modules = [{**MODULES[1], "photos": [{"uri": "/photos/basket.jpg", "alt": "바구니 감귤"}]}]
    set_modules(modules)
    row = open_composer(client, login)
    batch = client.get(f"{SOURCE}/{row['batchId']}", headers=login("u-kang")).json()
    [photo] = [s for s in batch["sources"] if s["productPhoto"]["uri"] == "/photos/basket.jpg"]
    assert photo["productPhoto"]["alt"] == "바구니 감귤"


def live_reference_uris(bid):
    with get_sessionmaker()() as db:
        return sorted(
            a.product_photo["uri"]
            for a in db.scalars(select(Asset).where(Asset.batch_id == bid))
            if a.product_photo and not a.deleted
        )


def test_AC_SRC_9_references_the_page_no_longer_uses_are_retired(client, login):
    set_modules()
    row = open_composer(client, login)
    assert apply_latest(client, login, row).status_code == 200
    # The legacy editor swaps the taste photo for another product photo and applies.
    legacy = open_composer(client, login, composer=False)
    snap = deepcopy(legacy["snapshot"])
    next(m for m in snap["modules"] if m["id"] == "taste")["photos"] = [
        {"uri": "/photos/greenhouse.jpg", "alt": "하우스"}
    ]
    saved = client.put(
        f"{BASE}/p-house",
        headers=headers(login),
        json={"version": legacy["version"], "snapshot": snap},
    )
    assert saved.status_code == 200, saved.text
    applied = client.post(
        f"{BASE}/p-house/apply", headers=headers(login), json={"version": saved.json()["version"]}
    )
    assert applied.status_code == 200, applied.text
    open_composer(client, login)
    assert "/photos/tangerine-box.jpg" not in live_reference_uris(row["batchId"])


def test_FEAT_04_brix_cleared_in_scr25_follows_into_the_composer(client, login):
    row = open_composer(client, login)  # p-house expected Brix 12, recorded
    with get_sessionmaker()() as db:
        db.get(Product, "p-house").expected_brix = None
        db.commit()
    open_composer(client, login)
    _, info = basic_info(client, login, row["batchId"])
    assert info["expectedBrix"] is None  # a buyer-visible product's Brix mirrors the product


def test_AC_SRC_9_pre_dev346_later_composer_work_after_a_composer_apply_is_kept(client, login):
    # apply draft A → save draft B (private) → page still shows A; no fingerprint (pre-DEV-346)
    set_modules()
    row = open_composer(client, login)
    assert apply_latest(client, login, row).status_code == 200
    applied = drafts(client, login, row["batchId"])[0]
    from app.source_analysis import service
    from app.source_analysis.models import Batch
    from app.source_analysis.schemas import DraftSave, DraftTarget

    with get_sessionmaker()() as db:
        db.get(ProductWorkspace, "p-house").page_source = None
        taste = db.scalar(
            select(ReviewedField).where(
                ReviewedField.batch_id == row["batchId"], ReviewedField.field_key == "taste"
            )
        )
        taste.value = "composer에 저장만 한 맛"
        batch = db.get(Batch, row["batchId"])
        batch.review_version += 1
        db.flush()
        service.save_drafts(
            db,
            batch,
            DraftSave(
                review_version=batch.review_version,
                targets=[
                    DraftTarget(
                        target_id=row["targetId"],
                        enabled_module_ids=["hero", "taste", "sizePhoto"],
                    )
                ],
            ),
            editor=True,
        )
        db.commit()
    later = drafts(client, login, row["batchId"])[0]
    assert open_composer(client, login)["composer"] is True
    assert drafts(client, login, row["batchId"])[0]["id"] == later["id"]  # draft B kept
    with get_sessionmaker()() as db:
        workspace = db.get(ProductWorkspace, "p-house")
        assert workspace.page_draft_id == applied["id"] and workspace.page_source


NEW_ORDER = ("/photos/greenhouse.jpg", "/photos/basket.jpg")


def stale_revision(client, login, cover=None, photos=NEW_ORDER):
    set_modules()
    row = open_composer(client, login, composer=False)
    snap = deepcopy(row["snapshot"])
    next(m for m in snap["modules"] if m["id"] == "taste")["texts"][0]["value"] = "오래된 수정본"
    if cover:
        snap["representativeUri"] = cover
    saved = client.put(
        f"{BASE}/p-house",
        headers=headers(login),
        json={"version": row["version"], "snapshot": snap},
    )
    assert saved.status_code == 200, saved.text
    with get_sessionmaker()() as db:  # the product moved on (SCR-25 photo order)
        product = db.get(Product, "p-house")
        product.photos = list(photos)
        product.version += 1
        db.commit()
    return row


def test_AC_SRC_9_stale_legacy_revision_moves_in_with_the_current_cover(client, login):
    row = stale_revision(client, login)
    opened = open_composer(client, login)
    assert opened["composer"] is True
    batch = client.get(f"{SOURCE}/{row['batchId']}", headers=login("u-kang")).json()
    cover = batch["targets"][0]["representativeAssetId"]
    assert next(s for s in batch["sources"] if s["id"] == cover)["productPhoto"]["uri"] == (
        "/photos/greenhouse.jpg"
    )


def test_AC_SRC_9_stale_legacy_revision_that_changed_the_cover_stays_in_the_legacy_editor(
    client, login
):
    stale_revision(client, login, cover="/photos/greenhouse.jpg")
    assert open_composer(client, login)["composer"] is False


def test_AC_SRC_9_unsold_half_used_batch_opens_the_composer(client, login):
    row = open_composer(client, login, "p-cheonhye", composer=False)  # REJECTED, photo page
    with get_sessionmaker()() as db:
        db.add(
            ReviewedField(
                batch_id=row["batchId"],
                target_id=row["targetId"],
                field_key="summary",
                value="composer에서 쓰던 소개",
                state="UNREVIEWED",
                provenance="PRODUCER",
                candidate_ids=[],
                photo_asset_ids=[],
            )
        )
        db.commit()
    assert open_composer(client, login, "p-cheonhye")["composer"] is True
    assert drafts(client, login, row["batchId"]) == []  # composer work left as it is


def test_AC_SRC_9_unsold_half_used_batch_with_a_module_page_stays_in_the_legacy_editor(
    client, login
):
    set_modules()
    row = open_composer(client, login, composer=False)
    with get_sessionmaker()() as db:
        db.get(Product, "p-house").status = "DRAFT"
        db.add(
            ReviewedField(
                batch_id=row["batchId"],
                target_id=row["targetId"],
                field_key="summary",
                value="composer에서 쓰던 소개",
                state="UNREVIEWED",
                provenance="PRODUCER",
                candidate_ids=[],
                photo_asset_ids=[],
            )
        )
        db.commit()
    assert open_composer(client, login)["composer"] is False


def test_AC_SRC_5_referenced_photo_bytes_are_an_explicit_404(client, login):
    row = open_composer(client, login)
    batch = client.get(f"{SOURCE}/{row['batchId']}", headers=login("u-kang")).json()
    sid = batch["sources"][0]["id"]
    base = f"{SOURCE}/{row['batchId']}/sources/{sid}"
    for path in ("/content", "/pages/1", "/pages/1/image"):
        assert client.get(base + path, headers=login("u-kang")).status_code == 404


def test_AC_SRC_9_page_bookkeeping_is_not_api_output(client, login):
    row = open_composer(client, login)
    assert "pageSource" not in row and "pageDraftId" not in row


def test_AC_SRC_9_stale_legacy_revision_of_a_product_without_photos_has_no_cover(client, login):
    row = stale_revision(client, login, photos=())
    assert open_composer(client, login)["composer"] is True
    batch = client.get(f"{SOURCE}/{row['batchId']}", headers=login("u-kang")).json()
    assert batch["targets"][0]["representativeAssetId"] is None  # not the revision's old cover


def test_AC_SRC_9_finished_run_without_a_draft_does_not_pin_the_legacy_editor(client, login):
    set_modules()
    row = open_composer(client, login, composer=False)
    from app.source_analysis.models import Run

    with get_sessionmaker()() as db:
        db.add(Run(batch_id=row["batchId"], mode="mock", model="m", targets=[], status="CANCELLED"))
        db.commit()
    assert open_composer(client, login)["composer"] is True


def test_AC_SRC_9_workspace_whose_target_is_missing_keeps_the_legacy_editor(client, login):
    row = open_composer(client, login, composer=False)
    with get_sessionmaker()() as db:
        db.get(ProductWorkspace, "p-house").target_id = "src_missing"
        db.commit()
    assert open_composer(client, login)["composer"] is False  # no 500 on odd old data
    assert row["batchId"]


def reviewed_count(bid):
    with get_sessionmaker()() as db:
        return db.scalar(
            select(func.count()).select_from(ReviewedField).where(ReviewedField.batch_id == bid)
        )


def test_AC_SRC_9_legacy_revision_never_wipes_half_written_composer_work(client, login):
    # Path 1: an unsold module page with composer values but no draft opens the legacy editor;
    # a revision saved there must not replace those values on the next composer open.
    set_modules()
    row = open_composer(client, login, composer=False)
    with get_sessionmaker()() as db:
        db.get(Product, "p-house").status = "DRAFT"
        db.add(
            ReviewedField(
                batch_id=row["batchId"],
                target_id=row["targetId"],
                field_key="summary",
                value="composer에서 쓰던 소개",
                state="UNREVIEWED",
                provenance="PRODUCER",
                candidate_ids=[],
                photo_asset_ids=[],
            )
        )
        db.commit()
    assert open_composer(client, login)["composer"] is False
    legacy_editor_save(client, login, "기존 편집기 수정본")
    assert open_composer(client, login)["composer"] is False
    with get_sessionmaker()() as db:
        [field] = db.scalars(select(ReviewedField).where(ReviewedField.batch_id == row["batchId"]))
        assert field.value == "composer에서 쓰던 소개"


def test_AC_SRC_9_legacy_revision_never_hides_a_newer_composer_draft(client, login):
    # Path 2: composer draft D2 saved after the page matched; the legacy editor (after a server
    # error) saves a revision; the next open keeps D2 and sends the producer to the legacy editor.
    set_modules()
    row = open_composer(client, login)
    from app.source_analysis import service
    from app.source_analysis.models import Batch
    from app.source_analysis.schemas import DraftSave, DraftTarget

    with get_sessionmaker()() as db:
        batch = db.get(Batch, row["batchId"])
        service.save_drafts(
            db,
            batch,
            DraftSave(
                review_version=batch.review_version,
                targets=[DraftTarget(target_id=row["targetId"], enabled_module_ids=["taste"])],
            ),
            editor=True,
        )
        db.commit()
    d2 = drafts(client, login, row["batchId"])[0]["id"]
    before = reviewed_count(row["batchId"])
    legacy_editor_save(client, login, "기존 편집기 수정본")
    assert open_composer(client, login)["composer"] is False
    assert drafts(client, login, row["batchId"])[0]["id"] == d2
    assert reviewed_count(row["batchId"]) == before


def test_AC_SRC_9_stale_revision_with_a_photo_the_product_no_longer_has_stays_legacy(client, login):
    set_modules()
    row = open_composer(client, login, composer=False)
    snap = deepcopy(row["snapshot"])
    next(m for m in snap["modules"] if m["id"] == "taste")["texts"][0]["value"] = "오래된 수정본"
    saved = client.put(
        f"{BASE}/p-house",
        headers=headers(login),
        json={"version": row["version"], "snapshot": snap},
    )
    assert saved.status_code == 200, saved.text
    with get_sessionmaker()() as db:  # the taste photo left the product page since
        product = db.get(Product, "p-house")
        product.module_detail = {"schemaVersion": 1, "modules": [MODULES[0]]}
        product.version += 1
        db.commit()
    assert open_composer(client, login)["composer"] is False


def cover_uri(client, login, bid):
    batch = client.get(f"{SOURCE}/{bid}", headers=login("u-kang")).json()
    cover = batch["targets"][0]["representativeAssetId"]
    return next((s["productPhoto"]["uri"] for s in batch["sources"] if s["id"] == cover), None)


def test_AC_SRC_9_legacy_revision_blocked_by_composer_work_says_why(client, login):
    set_modules()
    row = open_composer(client, login)
    from app.source_analysis import service
    from app.source_analysis.models import Batch
    from app.source_analysis.schemas import DraftSave, DraftTarget

    with get_sessionmaker()() as db:
        batch = db.get(Batch, row["batchId"])
        service.save_drafts(
            db,
            batch,
            DraftSave(
                review_version=batch.review_version,
                targets=[DraftTarget(target_id=row["targetId"], enabled_module_ids=["taste"])],
            ),
            editor=True,
        )
        db.commit()
    legacy_editor_save(client, login, "기존 편집기 수정본")
    opened = open_composer(client, login)
    assert (opened["composer"], opened["composerBlocked"]) == (False, "LEGACY_REVISION")
    assert "composerBlocked" not in open_composer(client, login, composer=False)


def test_AC_SRC_9_selling_product_apply_keeps_the_product_cover(client, login):
    # 11/17 PM: a buyer-visible product's cover is edited only in SCR-25; apply changes the page.
    set_modules()
    row = open_composer(client, login)
    batch = client.get(f"{SOURCE}/{row['batchId']}", headers=login("u-kang")).json()
    story = next(
        s for s in batch["sources"] if s["productPhoto"]["uri"] == "/photos/tangerine-box.jpg"
    )
    picked = client.put(
        f"{SOURCE}/{row['batchId']}/representative",
        headers=login("u-kang"),
        json={
            "version": batch["version"],
            "targetIds": [batch["targets"][0]["id"]],
            "assetId": story["id"],
        },
    )
    assert picked.status_code == 200, picked.text
    # re-save the draft against the new batch version, as the composer does
    from app.source_analysis import service
    from app.source_analysis.models import Batch
    from app.source_analysis.schemas import DraftSave, DraftTarget

    with get_sessionmaker()() as db:
        b = db.get(Batch, row["batchId"])
        service.save_drafts(
            db,
            b,
            DraftSave(
                review_version=b.review_version,
                targets=[
                    DraftTarget(
                        target_id=row["targetId"], enabled_module_ids=["hero", "taste", "sizePhoto"]
                    )
                ],
            ),
            editor=True,
        )
        db.commit()
        before = list(db.get(Product, "p-house").photos)
    assert apply_latest(client, login, row).status_code == 200
    with get_sessionmaker()() as db:
        assert db.get(Product, "p-house").photos == before


def save_newer_draft(row):
    from app.source_analysis import service
    from app.source_analysis.models import Batch
    from app.source_analysis.schemas import DraftSave, DraftTarget

    with get_sessionmaker()() as db:
        batch = db.get(Batch, row["batchId"])
        service.save_drafts(
            db,
            batch,
            DraftSave(
                review_version=batch.review_version,
                targets=[DraftTarget(target_id=row["targetId"], enabled_module_ids=["taste"])],
            ),
            editor=True,
        )
        db.commit()


def legacy_apply(client, login, text):
    saved = legacy_editor_save(client, login, text)
    applied = client.post(
        f"{BASE}/p-house/apply", headers=headers(login), json={"version": saved["version"]}
    )
    assert applied.status_code == 200, applied.text


def test_AC_SRC_9_old_composer_draft_cannot_overwrite_a_page_applied_elsewhere(client, login):
    set_modules()
    row = open_composer(client, login)  # composer screen stays open with this draft
    legacy_apply(client, login, "다른 화면에서 반영한 맛")
    response = apply_latest(client, login, row)
    assert response.status_code == 409, response.text
    assert response.json()["details"]["reason"] == "PAGE_CHANGED"
    assert taste_text() == "다른 화면에서 반영한 맛"


def test_AC_SRC_9_page_replacing_saved_composer_work_says_so(client, login):
    set_modules()
    row = open_composer(client, login)
    save_newer_draft(row)  # composer work saved, not applied
    legacy_apply(client, login, "다른 화면에서 반영한 맛")
    reopened = open_composer(client, login)
    assert reopened["composer"] is True and reopened["composerNotice"] == "PAGE_REPLACED"
    latest = drafts(client, login, row["batchId"])[0]
    taste = next(m for m in latest["snapshot"]["previewModules"] if m["id"] == "taste")
    assert taste["texts"][0]["value"] == "다른 화면에서 반영한 맛"


def test_AC_SRC_9_page_replacing_no_composer_work_has_no_notice(client, login):
    set_modules()
    open_composer(client, login)
    legacy_apply(client, login, "다른 화면에서 반영한 맛")
    assert "composerNotice" not in open_composer(client, login)


def test_AC_SRC_9_pre_dev346_applied_draft_does_not_block_a_legacy_revision(client, login):
    # Inverse of legacy_revision_never_hides_a_newer_composer_draft: the only draft is the one
    # the page shows (no fingerprint record), so the legacy revision moves in.
    set_modules()
    row = open_composer(client, login)
    assert apply_latest(client, login, row).status_code == 200
    with get_sessionmaker()() as db:
        workspace = db.get(ProductWorkspace, "p-house")
        workspace.page_source = workspace.page_draft_id = None
        db.commit()
    legacy_editor_save(client, login, "기존 편집기 수정본")
    opened = open_composer(client, login)
    assert opened["composer"] is True and "composerBlocked" not in opened
    latest = drafts(client, login, row["batchId"])[0]
    taste = next(m for m in latest["snapshot"]["previewModules"] if m["id"] == "taste")
    assert taste["texts"][0]["value"] == "기존 편집기 수정본"


def add_active_run(bid, status="PRIVACY_REVIEW"):
    from app.source_analysis.models import Run

    with get_sessionmaker()() as db:
        run = Run(batch_id=bid, mode="mock", model="m", targets=[], status=status)
        db.add(run)
        db.commit()
        return run.id


def run_status(run_id):
    from app.source_analysis.models import Run

    with get_sessionmaker()() as db:
        return db.get(Run, run_id).status


def test_AC_SRC_9_page_changed_elsewhere_cancels_a_running_analysis_and_says_so(client, login):
    set_modules()
    row = open_composer(client, login)  # fingerprint recorded
    run_id = add_active_run(row["batchId"])  # even a privacy review that may sit for days
    legacy_apply(client, login, "다른 화면에서 반영한 맛")
    reopened = open_composer(client, login)
    assert reopened["composer"] is True
    assert reopened["composerNotice"] == "PAGE_AND_AI_REPLACED"
    assert run_status(run_id) == "CANCELLED"
    latest = drafts(client, login, row["batchId"])[0]
    taste = next(m for m in latest["snapshot"]["previewModules"] if m["id"] == "taste")
    assert taste["texts"][0]["value"] == "다른 화면에서 반영한 맛"


def test_AC_SRC_9_pre_dev346_page_change_with_a_running_analysis_is_migrated_and_guarded(
    client, login
):
    set_modules()
    row = open_composer(client, login)
    legacy_apply(client, login, "기존 편집기로 반영한 맛")  # no draft matches the page now
    with get_sessionmaker()() as db:
        workspace = db.get(ProductWorkspace, "p-house")
        workspace.page_source = workspace.page_draft_id = None
        db.commit()
    run_id = add_active_run(row["batchId"], "QUEUED")
    reopened = open_composer(client, login)
    assert reopened["composer"] is True and run_status(run_id) == "CANCELLED"
    latest = drafts(client, login, row["batchId"])[0]
    taste = next(m for m in latest["snapshot"]["previewModules"] if m["id"] == "taste")
    assert taste["texts"][0]["value"] == "기존 편집기로 반영한 맛"
    legacy_apply(client, login, "또 다른 화면에서 반영한 맛")
    response = apply_latest(client, login, row)  # the now-stale composer draft
    assert response.status_code == 409
    assert response.json()["details"]["reason"] == "PAGE_CHANGED"


def resave_same_content(row):
    from app.source_analysis import service
    from app.source_analysis.models import Batch
    from app.source_analysis.schemas import DraftSave, DraftTarget

    with get_sessionmaker()() as db:
        batch = db.get(Batch, row["batchId"])
        service.save_drafts(
            db,
            batch,
            DraftSave(
                review_version=batch.review_version,
                targets=[
                    DraftTarget(
                        target_id=row["targetId"],
                        enabled_module_ids=["hero", "taste", "sizePhoto"],
                    )
                ],
            ),
            editor=True,
        )
        db.commit()


def test_AC_SRC_9_resaving_the_same_content_is_not_composer_work(client, login):
    set_modules()
    row = open_composer(client, login)
    resave_same_content(row)  # e.g. a refreshed version, nothing changed
    legacy_apply(client, login, "다른 화면에서 반영한 맛")
    assert "composerNotice" not in open_composer(client, login)


def test_AC_SRC_9_resaving_the_same_content_does_not_block_a_legacy_revision(client, login):
    set_modules()
    row = open_composer(client, login)
    resave_same_content(row)
    legacy_editor_save(client, login, "기존 편집기 수정본")
    opened = open_composer(client, login)
    assert opened["composer"] is True and "composerBlocked" not in opened


def test_AC_SRC_9_unchanged_page_keeps_a_running_analysis(client, login):
    set_modules()
    row = open_composer(client, login)
    run_id = add_active_run(row["batchId"])
    assert open_composer(client, login)["composer"] is True
    assert run_status(run_id) == "PRIVACY_REVIEW"


def test_AC_SRC_9_page_over_the_limits_never_cancels_the_analysis(client, login):
    set_modules()
    row = open_composer(client, login)
    run_id = add_active_run(row["batchId"])
    long = "가" * 2000
    with get_sessionmaker()() as db:  # changed elsewhere into a page the composer cannot hold
        product = db.get(Product, "p-house")
        product.module_detail = {
            "schemaVersion": 1,
            "modules": [
                {
                    "id": "summary",
                    "texts": [{"fieldKey": "summary", "value": long}] * 2,
                    "photos": [],
                    "illustrationId": None,
                }
            ],
        }
        product.version += 1
        db.commit()
    assert open_composer(client, login)["composer"] is False
    assert run_status(run_id) == "PRIVACY_REVIEW"


def test_AC_SRC_9_cancelled_analysis_lets_basic_info_follow_the_product(client, login):
    set_modules()
    row = open_composer(client, login)
    add_active_run(row["batchId"])
    with get_sessionmaker()() as db:
        db.get(Product, "p-house").expected_brix = 13.0
        db.commit()
    legacy_apply(client, login, "다른 화면에서 반영한 맛")
    assert open_composer(client, login)["composerNotice"] == "PAGE_AND_AI_REPLACED"
    _, info = basic_info(client, login, row["batchId"])
    assert info["expectedBrix"] == 13.0
    latest = drafts(client, login, row["batchId"])[0]
    batch = client.get(f"{SOURCE}/{row['batchId']}", headers=login("u-kang")).json()
    assert latest["snapshot"]["batchVersion"] == batch["version"]  # the migrated draft is fresh


def test_AC_SRC_9_shared_analysis_batch_is_not_cancelled(client, login):
    set_modules()
    row = open_composer(client, login)
    from app.source_analysis.models import Batch

    with get_sessionmaker()() as db:
        batch = db.get(Batch, row["batchId"])
        batch.targets = [
            *batch.targets,
            {"id": "src_other", "name": "다른 상품", "productId": None},
        ]
        db.commit()
    run_id = add_active_run(row["batchId"])
    legacy_apply(client, login, "다른 화면에서 반영한 맛")
    assert open_composer(client, login)["composer"] is False
    assert run_status(run_id) == "PRIVACY_REVIEW"


def test_AC_SRC_9_description_edit_during_an_analysis_keeps_draft_and_analysis(client, login):
    row = open_composer(client, login)  # description-only page migrated, fingerprint recorded
    run_id = add_active_run(row["batchId"])
    with get_sessionmaker()() as db:
        db.get(Product, "p-house").description = "상품 편집에서 고친 설명"
        db.commit()
    before = len(drafts(client, login, row["batchId"]))
    opened = open_composer(client, login)
    assert opened["composer"] is True and "composerNotice" not in opened
    assert run_status(run_id) == "PRIVACY_REVIEW"
    assert len(drafts(client, login, row["batchId"])) == before
