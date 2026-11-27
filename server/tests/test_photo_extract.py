"""DEV-452: product photos found inside uploaded documents."""

import base64
import io
import json
import random

import pypdfium2 as pdfium
import pytest
from PIL import Image, ImageDraw
from sqlalchemy import select

from app.core.db import get_sessionmaker
from app.source_analysis.models import Asset, Batch, Draft
from app.source_analysis.photo_extract import (
    dhash,
    field_for,
    find_photos,
    near_duplicate,
    pdf_image_boxes,
    trim_text_bands,
)
from app.source_analysis.worker import add_extracted_photos
from tests.test_source_analysis import PREFIX, create, source_settings, upload  # noqa: F401
from tests.test_source_sale import setup_page, submit


def photo(width=600, height=400, seed=1):
    """Colourful, noisy picture: behaves like a photograph for the heuristics."""
    rng = random.Random(seed)
    image = Image.new("RGB", (width, height))
    px = image.load()
    for y in range(height):
        for x in range(width):
            px[x, y] = (
                min(255, 120 + x * 120 // width + rng.randint(-40, 40)),
                min(255, 60 + y * 150 // height + rng.randint(-40, 40)),
                max(0, 40 + rng.randint(-30, 60)),
            )
    # Distinct large shapes per seed, so different seeds are different pictures.
    draw = ImageDraw.Draw(image)
    for _ in range(6):
        x, y = rng.randrange(width), rng.randrange(height)
        r = rng.randint(width // 8, width // 3)
        draw.ellipse((x - r, y - r, x + r, y + r), fill=tuple(rng.randrange(256) for _ in "rgb"))
    return image


def page_with_photo(box=(200, 500, 800, 900), size=(1000, 1400)):
    page = Image.new("RGB", size, "white")
    page.paste(photo(box[2] - box[0], box[3] - box[1]), box[:2])
    ImageDraw.Draw(page).rectangle((100, 100, 900, 140), fill="black")  # a text-like bar
    return page


def pdf_with_embedded_photo():
    pdf = pdfium.PdfDocument.new()
    page = pdf.new_page(600, 800)
    image = pdfium.PdfImage.new(pdf)
    bitmap = pdfium.PdfBitmap.from_pil(photo())
    image.set_bitmap(bitmap)
    # 300x200 pt picture, bottom-left at (150, 400) in PDF coordinates.
    image.set_matrix(pdfium.PdfMatrix().scale(300, 200).translate(150, 400))
    page.insert_obj(image)
    page.gen_content()
    out = io.BytesIO()
    pdf.save(out)
    return out.getvalue()


def test_AC_SRC_photo_pdf_object_bounds_are_found():
    with pdfium.PdfDocument(pdf_with_embedded_photo()) as pdf:
        page = pdf[0]
        [box] = pdf_image_boxes(page)
        assert [round(v, 2) for v in box] == [0.25, 0.25, 0.75, 0.5]
        rendered = page.render(scale=2).to_pil().convert("RGB")
        [found] = find_photos(rendered, [], page)
    assert found["method"] == "pdf-object"
    with Image.open(io.BytesIO(base64.b64decode(found["image"]))) as crop:
        assert crop.size == (600, 400)


def test_AC_SRC_photo_layout_heuristic_finds_photo_in_screenshot():
    [found] = find_photos(page_with_photo(), [])
    assert found["method"] == "layout"
    x1, y1, x2, y2 = found["box"]
    assert abs(x1 - 0.2) < 0.03 and abs(y1 - 500 / 1400) < 0.03
    assert abs(x2 - 0.8) < 0.03 and abs(y2 - 900 / 1400) < 0.03


def test_AC_SRC_photo_text_blocks_and_flat_graphics_are_not_photos():
    page = page_with_photo()
    text = [{"id": "t", "text": "본문", "box": [0.2, 500 / 1400, 0.8, 900 / 1400]}]
    assert find_photos(page, text) == []  # region is covered by text
    flat = Image.new("RGB", (1000, 1400), "white")
    ImageDraw.Draw(flat).rectangle((200, 500, 800, 900), fill=(40, 160, 60))
    assert find_photos(flat, []) == []


def test_AC_SRC_photo_DEV452_text_band_below_a_photo_is_cut_out(monkeypatch):
    # A photo (y 500-900) with a price line directly below it (y 900-960), merged into one block.
    page = Image.new("RGB", (1000, 1400), "white")
    page.paste(photo(600, 400), (200, 500))
    ImageDraw.Draw(page).rectangle((200, 905, 800, 955), fill=(30, 30, 30))
    merged = (0.2, 500 / 1400, 0.8, 960 / 1400)
    monkeypatch.setattr(
        "app.source_analysis.photo_extract.layout_boxes", lambda image, spans: [merged]
    )
    price = {"id": "p", "text": "한 상자 28,000원", "box": [0.2, 900 / 1400, 0.8, 960 / 1400]}
    [found] = find_photos(page, [price])
    x1, y1, x2, y2 = found["box"]
    assert abs(y1 - 500 / 1400) < 0.005
    assert y2 <= 900 / 1400 + 0.001  # the price band is not in the crop
    with Image.open(io.BytesIO(base64.b64decode(found["image"]))) as crop:
        assert crop.size[1] <= 405


def test_AC_SRC_photo_DEV452_trim_keeps_largest_text_free_band_and_rejects_slivers():
    box = (0.1, 0.2, 0.9, 0.6)
    assert trim_text_bands(box, []) == box
    spans = [{"box": [0.1, 0.5, 0.9, 0.6]}]
    top, bottom = trim_text_bands(box, spans)[1::2]
    assert (top, bottom) == (0.2, 0.5)
    # Text in the middle: the larger band survives, the text rows never do.
    mid = [{"box": [0.1, 0.28, 0.9, 0.34]}]
    trimmed = trim_text_bands(box, mid)
    assert trimmed[1] == 0.34 and trimmed[3] == 0.6
    # Nearly all text: nothing photo-sized remains.
    assert trim_text_bands(box, [{"box": [0.1, 0.22, 0.9, 0.6]}]) is None
    # Text elsewhere on the page does not touch the block.
    assert trim_text_bands(box, [{"box": [0.1, 0.8, 0.9, 0.9]}]) == box


def test_AC_SRC_photo_near_duplicates_and_sections():
    a = base64.b64encode(_png(photo(seed=1))).decode()
    b = base64.b64encode(_png(photo(seed=1).resize((580, 386)))).decode()
    c = base64.b64encode(_png(photo(seed=1).transpose(Image.FLIP_LEFT_RIGHT))).decode()
    assert near_duplicate(dhash(a), dhash(b))
    assert not near_duplicate(dhash(a), dhash(c))
    spans = [{"text": "3대째 이어온 우리 농장", "box": [0.1, 0.1, 0.9, 0.15]}]
    assert field_for([0.1, 0.2, 0.9, 0.5], spans) == "farmPhotos"
    assert field_for([0.1, 0.7, 0.9, 0.9], spans) == "taste"  # text too far away


def _png(image):
    out = io.BytesIO()
    image.save(out, "PNG")
    return out.getvalue()


def _extract(bid, sid, pages):
    with get_sessionmaker()() as db:
        batch = db.get(Batch, bid)
        source = db.get(Asset, sid)
        add_extracted_photos(db, batch, source, pages)
        db.commit()


def _page(*images, text=""):
    return {
        "spans": [{"id": "s0", "text": text, "box": [0, 0, 1, 0.05]}] if text else [],
        "photos": [
            {
                "image": base64.b64encode(_png(i)).decode(),
                "box": [0.1, 0.1, 0.9, 0.5],
                "method": "layout",
            }
            for i in images
        ],
    }


def test_AC_SRC_photo_extracted_assets_are_unconfirmed_deduped_and_off_quota(
    client,
    login,
    source_settings,  # noqa: F811
):
    h = login("u-kang")
    batch = create(client, h)
    source = upload(client, h, batch)
    pages = [
        _page(photo(seed=1), photo(seed=2), text="선물 상자 포장"),
        _page(photo(seed=1)),  # the same picture repeated on another page
        _page(photo(seed=3), photo(seed=4), photo(seed=5), text="선물 상자"),
    ]
    _extract(batch["id"], source["id"], pages)
    with get_sessionmaker()() as db:
        rows = list(
            db.scalars(
                select(Asset)
                .where(Asset.batch_id == batch["id"], Asset.original_photo.is_(True))
                .order_by(Asset.created_at)
            )
        )
        assert len(rows) == 5
        assert all(r.status == "PREPARED" for r in rows)
        info = [r.placement["extracted"] for r in rows]
        assert all(not i["confirmed"] and i["sourceId"] == source["id"] for i in info)
        assert [i["page"] for i in info] == [1, 1, 3, 3, 3]
        # At most two placed per section; the rest stay in the photo strip.
        assert [r.placement["fieldKey"] for r in rows] == [
            "packagePhoto",
            "packagePhoto",
            None,
            None,
            None,
        ]
        assert db.get(Batch, batch["id"]).targets[0]["representativeAssetId"] == rows[0].id
    view = client.get(f"{PREFIX}/{batch['id']}", headers=h).json()
    extracted = [s for s in view["sources"] if s["placement"].get("extracted")]
    assert len(extracted) == 5
    # Re-preparing the same document replaces its extraction instead of adding more.
    _extract(batch["id"], source["id"], pages[:1])
    view = client.get(f"{PREFIX}/{batch['id']}", headers=h).json()
    assert len([s for s in view["sources"] if s["placement"].get("extracted")]) == 2


def test_AC_SRC_photo_sale_request_needs_confirmed_extracted_photos(client, login):
    preview = setup_page(client, login)
    h = login("u-kang")
    bid = preview["batch"]["id"]
    with get_sessionmaker()() as db:
        source = db.scalar(select(Asset).where(Asset.batch_id == bid, Asset.deleted.is_(False)))
        sid = source.id
    _extract(bid, sid, [_page(photo(seed=7))])
    with get_sessionmaker()() as db:
        extracted = db.scalar(
            select(Asset).where(Asset.batch_id == bid, Asset.filename.like("%-p1-1.png"))
        )
        eid, revision = extracted.id, extracted.revision
        # The saved page uses the extracted photo (any reference inside the draft counts).
        draft = db.get(Draft, preview["draft"]["id"])
        draft.snapshot = {**draft.snapshot, "galleryPhotoIds": [eid]}
        db.commit()
    blocked = submit(client, login, preview)
    assert blocked.status_code == 400, blocked.text
    assert "자료에서 가져온 사진 1장" in blocked.json()["details"]["fields"]["photos"]
    wrong = client.post(f"{PREFIX}/{bid}/sources/{sid}/confirm-extracted?version=1", headers=h)
    assert wrong.status_code == 400  # only extracted photos can be confirmed
    ok = client.post(
        f"{PREFIX}/{bid}/sources/{eid}/confirm-extracted?version={revision}", headers=h
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["placement"]["extracted"]["confirmed"] is True
    result = submit(client, login, preview)
    assert result.status_code == 200, result.text


def test_AC_SRC_photo_removing_extracted_photo_keeps_the_analysis(client, login, source_settings):  # noqa: F811
    h = login("u-kang")
    batch = create(client, h)
    source = upload(client, h, batch)
    _extract(batch["id"], source["id"], [_page(photo(seed=1), photo(seed=2))])
    before = client.get(f"{PREFIX}/{batch['id']}", headers=h).json()
    first = next(s for s in before["sources"] if s["placement"].get("extracted"))
    removed = client.delete(
        f"{PREFIX}/{batch['id']}/sources/{first['id']}?version={first['revision']}", headers=h
    )
    assert removed.status_code == 202, removed.text
    after = client.get(f"{PREFIX}/{batch['id']}", headers=h).json()
    assert after["version"] == before["version"]  # runs and drafts stay current
    assert after["reviewVersion"] == before["reviewVersion"] + 1
    assert len([s for s in after["sources"] if s["placement"].get("extracted")]) == 1
    rep = after["targets"][0]["representativeAssetId"]
    assert rep and rep != first["id"]


def test_AC_SRC_10_setup_prices_win_over_material_prices():
    """DEV-452: with prices entered on the setup page, material prices start out of the page."""
    from app.source_analysis.source_preserving import build_plan

    target = {"id": "target-1", "name": "카라향"}
    versions = {"source-1": {"revision": 1, "sanitizationVersion": 1}}

    def cand(cid, quote):
        return {
            "id": cid,
            "targetId": "target-1",
            "fieldKey": "farmStory",
            "value": quote,
            "historical": False,
            "evidence": [
                {
                    "sourceId": "source-1",
                    "sourceRevision": 1,
                    "page": 1,
                    "spanIds": [f"s-{cid}"],
                    "quote": quote,
                }
            ],
        }

    cands = [cand("c1", "선물용 3kg 37,000원입니다."), cand("c2", "아버지와 함께 농사짓습니다.")]
    without = build_plan(target, cands, source_versions=versions)
    price = next(p for p in without["passages"] if "37,000" in p["value"])
    assert price["status"] == "PENDING" and price["includedInDraft"]
    result = build_plan(target, cands, source_versions=versions, input_prices=True)
    price = next(p for p in result["passages"] if "37,000" in p["value"])
    story = next(p for p in result["passages"] if "아버지" in p["value"])
    assert price["status"] == "EXCLUDED" and price["inputPreferred"] == "PRICE"
    assert not price["includedInDraft"] and not price["reviewPending"]
    assert story["includedInDraft"]
    # The producer can explicitly put the material's price back into the page.
    kept = build_plan(
        target,
        cands,
        source_versions=versions,
        input_prices=True,
        decisions=[
            {
                "bindingHash": price["bindingHash"],
                "action": "KEEP",
                "note": "판매 설정 가격과 다른 자료 속 가격을 확인하고 본문에 넣었어요.",
                "module": "farmStory",
            }
        ],
    )
    price = next(p for p in kept["passages"] if "37,000" in p["value"])
    assert price["status"] == "READY" and price["includedInDraft"]


def test_AC_SRC_10_option_lines_keep_size_and_count_without_material_price():
    """DEV-452 text-only material: '가정용 3kg (9~12과) 32,000원' → 구성 '가정용 3kg (9~12과)'."""
    from app.source_analysis.source_preserving import build_plan, without_price

    assert without_price("- 가정용 3kg (9~12과) 32,000원") == "가정용 3kg (9~12과)"
    assert without_price("선물용 5kg : 49,000원") == "선물용 5kg"
    # A price inside a sentence is never cut out of it; the whole passage stays out instead.
    assert without_price("선물용 3kg 37,000원입니다.") == ""
    assert without_price("택배비 4000원 별도") == ""
    assert without_price("3만원") == ""
    quote = "- 가정용 3kg (9~12과) 32,000원"
    cand = {
        "id": "c1",
        "targetId": "target-1",
        "fieldKey": "historicalSales",
        "value": quote,
        "historical": True,
        "evidence": [
            {"sourceId": "s", "sourceRevision": 1, "page": 1, "spanIds": ["a"], "quote": quote}
        ],
    }
    plan = build_plan(
        {"id": "target-1", "name": "한라봉"},
        [cand],
        source_versions={"s": {"revision": 1, "sanitizationVersion": 1}},
        input_prices=True,
    )
    [passage] = plan["passages"]
    assert passage["value"] == "가정용 3kg (9~12과)" and passage["priceRemoved"]
    assert passage["originalValue"] == quote and passage["inputPreferred"]
    assert passage["module"] == "composition" and passage["includedInDraft"]
    assert not passage["reviewPending"]
    assert "32,000" not in json.dumps(plan["modules"], ensure_ascii=False)


def test_AC_SRC_1_combined_flow_never_prefills_brix_and_names_from_hint(client, login):
    """DEV-452: '작년 평균 13~14브릭스' is not registered brix; an empty name takes the hint."""
    from app.source_analysis.service import prefill_expected_brix
    from tests.test_product_setup import inputs, post, prepare

    row = prepare(client, login)
    info = {**inputs(), "productName": "", "productHint": "한라봉"}
    result = post(client, login, row, info)
    assert result.status_code == 200, result.text
    assert result.json()["product"]["name"] == "한라봉"
    with get_sessionmaker()() as db:
        batch = db.get(Batch, row["batchId"])
        assert batch.source_copy_enabled
        before = json.dumps(batch.targets, sort_keys=True)
        prefill_expected_brix(db, batch)
        assert json.dumps(batch.targets, sort_keys=True) == before


def test_AC_SRC_10_material_box_sizes_that_differ_from_sale_options_start_off_the_page():
    """DEV-452: sale options 5kg; material '선물 3kg' → excluded with inputPreferred WEIGHT."""
    from app.source_analysis.source_preserving import build_plan, weight_conflict

    assert weight_conflict("선물 3kg", (5.0,))
    assert not weight_conflict("가정용 3kg (9~12과)", (3.0, 5.0))
    assert not weight_conflict("500g 소포장", (0.5,))
    assert not weight_conflict("과즙이 많아요", (5.0,))
    assert not weight_conflict("선물 3kg", ())

    def cand(cid, quote, field):
        return {
            "id": cid,
            "targetId": "target-1",
            "fieldKey": field,
            "value": quote,
            "historical": False,
            "evidence": [
                {"sourceId": "s", "sourceRevision": 1, "page": 1, "spanIds": [cid], "quote": quote}
            ],
        }

    args = {
        "source_versions": {"s": {"revision": 1, "sanitizationVersion": 1}},
        "input_weights": (5.0,),
    }
    target = {"id": "target-1", "name": "천혜향"}
    plan = build_plan(target, [cand("a", "선물 3kg", "composition")], **args)
    [p] = plan["passages"]
    assert p["status"] == "EXCLUDED" and p["inputPreferred"] == "WEIGHT"
    same = build_plan(target, [cand("b", "선물 5kg", "composition")], **args)
    assert same["passages"][0]["includedInDraft"] and not same["passages"][0].get("inputPreferred")


def test_AC_SRC_1_page_status_lists_combined_drafts_for_the_product_list(
    client, login, other_farm_headers
):
    """DEV-452: list shows making / ready (+ to-check count) / failed and a name fallback."""
    from app.source_analysis.models import Run
    from tests.test_product_setup import inputs, post, prepare

    row = prepare(client, login)
    h = login("u-kang")
    url = "/api/source-analysis/product-workspaces/page-status"
    assert post(client, login, row, {**inputs(), "productName": ""}).status_code == 200
    [entry] = [
        i for i in client.get(url, headers=h).json()["items"] if i["productId"] == row["productId"]
    ]
    assert entry["state"] == "NONE" and entry["nameHint"] == "카라향"
    with get_sessionmaker()() as db:
        run = Run(
            batch_id=row["batchId"], mode="mock", model="mock", targets=[], status="ANALYZING"
        )
        db.add(run)
        db.commit()
        run_id = run.id
    [entry] = [
        i for i in client.get(url, headers=h).json()["items"] if i["productId"] == row["productId"]
    ]
    assert entry["state"] == "MAKING" and entry["run"]["id"] == run_id
    with get_sessionmaker()() as db:
        db.get(Run, run_id).status = "SUCCEEDED"
        db.commit()
    [entry] = [
        i for i in client.get(url, headers=h).json()["items"] if i["productId"] == row["productId"]
    ]
    assert entry["state"] == "READY" and entry["toCheck"] == 0
    with get_sessionmaker()() as db:
        db.get(Run, run_id).status = "FAILED"
        db.commit()
    [entry] = [
        i for i in client.get(url, headers=h).json()["items"] if i["productId"] == row["productId"]
    ]
    assert entry["state"] == "FAILED"
    # Other farms never see these products.
    other = client.get(url, headers=other_farm_headers)
    assert other.status_code == 200
    assert all(i["productId"] != row["productId"] for i in other.json()["items"])


@pytest.mark.parametrize(
    ("code", "replaced"),
    [("INCOMPLETE_OCR", True), ("INVALID_OCR", True), ("REQUEST_UNCERTAIN", False)],
)
def test_AC_SRC_5_unfinished_remote_reading_falls_back_to_embedded_pdf_text(
    monkeypatch, code, replaced
):
    """DEV-452: a dense PDF page the reader cannot finish uses its embedded text, not a block."""
    from app.ai.source_analysis import ExtractionError
    from app.core.config import get_settings
    from app.source_analysis import worker

    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 1)
    image = io.BytesIO()
    Image.new("RGB", (24, 24), "white").save(image, "PNG")
    embedded = {"id": "pdf-s0", "text": "가정용 3kg 상자에 9~12과를 담아 보냅니다."}
    chunk = {
        "pages": [
            {"number": 1, "spans": [embedded, {"id": "s0", "text": "로컬 OCR"}]},
            {"number": 2, "spans": [{"id": "s0", "text": "로컬 전사로 대체하면 안 됩니다."}]},
            {"number": 3, "spans": [{"id": "pdf-s0", "text": "정상적으로 읽히는 쪽"}]},
        ]
    }

    readable = io.BytesIO()
    Image.new("RGB", (30, 30), "white").save(readable, "PNG")

    def by_page(encoded, **_):
        # Pages 1-2 (24px) cannot be finished with `code`; page 3 (30px) reads normally.
        from app.ai.source_ocr import Transcription

        data = encoded if isinstance(encoded, bytes) else base64.b64decode(encoded)
        with Image.open(io.BytesIO(data)) as crop:
            if crop.width == 30:
                return Transcription(["정상적으로 읽히는 쪽입니다."], {}, "fixture")
        raise ExtractionError(code)

    monkeypatch.setattr(worker, "transcribe", by_page)
    pages = {1: image.getvalue(), 2: image.getvalue(), 3: readable.getvalue()}
    diagnostics = worker.transcribe_pages(chunk, pages, lambda *args: args[5]())
    failed = [p["number"] for p in diagnostics["pagesFailed"]]
    native = [p["number"] for p in diagnostics.get("pagesNativeText", [])]
    if replaced:
        assert native == [1] and failed == [2]
        assert chunk["pages"][0]["spans"] == [embedded]
    else:
        assert native == [] and failed == [1, 2]
        assert chunk["pages"][0]["spans"] == []
    assert chunk["pages"][1]["spans"] == []  # local OCR never stands in
    assert chunk["pages"][2]["spans"]


def test_AC_SRC_5_reading_progress_counts_pages_not_crops(monkeypatch):
    """DEV-452: the waiting bar showed '93/41쪽'; progress must count finished pages."""
    from app.ai.source_ocr import Transcription
    from app.core.config import get_settings
    from app.source_analysis import worker

    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 1)
    tall = io.BytesIO()
    Image.new("RGB", (400, 6000), "white").save(tall, "PNG")  # several crops per page
    chunk = {"pages": [{"number": n, "spans": []} for n in (1, 2, 3)]}
    monkeypatch.setattr(
        worker, "transcribe", lambda encoded, **_: Transcription(["한 줄"], {}, "fixture")
    )
    seen = []
    worker.transcribe_pages(
        chunk,
        {n: tall.getvalue() for n in (1, 2, 3)},
        lambda *args: args[5](),
        None,
        lambda stage, done, total: seen.append((stage, done, total)),
    )
    assert seen and all(stage == "READ" and done <= total == 3 for stage, done, total in seen)
    assert [done for _, done, _ in seen] == [1, 2, 3]


def test_AC_SRC_10_variants_and_out_of_season_text_follow_the_sale_settings():
    """DEV-452 (PM 11/27): rule b for option variants, rule a for harvest seasons."""
    from app.source_analysis.source_preserving import (
        build_plan,
        months_in,
        option_conflict,
        season_conflict,
    )

    assert months_in("1월 중순부터 2월 말까지 수확합니다.") == {1, 2}
    assert months_in("4~5월 제주에서 보내드리는 제철 과일") == {4, 5}
    assert months_in("12월~2월 수확") == {12, 1, 2}
    assert season_conflict("1월 중순부터 2월 말까지 수확합니다.", (11,))
    assert not season_conflict("11월부터 판매합니다.", (11, 12))
    assert not season_conflict("올해도 맛있어요.", (11,))
    assert option_conflict("선물용 3kg (8~10과)", (3.0, 5.0), ("3kg", "5kg"))
    assert not option_conflict("한라봉 3kg (9~12과)", (3.0, 5.0), ("3kg", "5kg"))
    assert not option_conflict("가정용 3kg (9~12과)", (3.0,), ("가정용 3kg",))

    def cand(cid, quote, field):
        return {
            "id": cid,
            "targetId": "t",
            "fieldKey": field,
            "value": quote,
            "historical": False,
            "evidence": [
                {"sourceId": "s", "sourceRevision": 1, "page": 1, "spanIds": [cid], "quote": quote}
            ],
        }

    cands = [
        cand("a", "선물용 3kg (8~10과)", "composition"),
        cand("b", "한라봉 3kg (9~12과)", "composition"),
        cand("c", "1월 중순부터 2월 말까지 수확합니다.", "productionProcess"),
        cand("d", "껍질이 얇아요.", "taste"),
    ]
    plan = build_plan(
        {"id": "t", "name": "한라봉"},
        cands,
        source_versions={"s": {"revision": 1, "sanitizationVersion": 1}},
        input_weights=(3.0,),
        input_labels=("3kg",),
        input_months=(11,),
    )
    by = {p["value"]: p for p in plan["passages"]}
    assert by["선물용 3kg (8~10과)"]["inputPreferred"] == "WEIGHT"
    assert by["선물용 3kg (8~10과)"]["status"] == "EXCLUDED"
    assert by["한라봉 3kg (9~12과)"]["includedInDraft"]
    assert by["1월 중순부터 2월 말까지 수확합니다."]["inputPreferred"] == "SEASON"
    assert not by["1월 중순부터 2월 말까지 수확합니다."]["reviewPending"]
    assert by["껍질이 얇아요."]["includedInDraft"]
    # Without sale settings nothing changes (ordinary composer and older batches).
    plain = build_plan(
        {"id": "t", "name": "한라봉"},
        cands,
        source_versions={"s": {"revision": 1, "sanitizationVersion": 1}},
    )
    assert not any(p.get("inputPreferred") for p in plain["passages"])
