"""DEV-228 / AC-03-5: 자료 분석 뒤 비어 있는 예상 당도를 자료 글로 미리 채운다(모델 호출 없음)."""

import base64
import io

import pytest
from PIL import Image

from app.ai.grounding import single_brix
from app.ai.source_analysis import ExtractionResponse
from app.source_analysis import preprocess, worker
from app.source_analysis.schemas import Extraction
from tests.test_source_analysis import PREFIX, drain, key, source_settings, start, upload

__all__ = ["source_settings"]

# 제안서 4절 입력 예시 표. (자료 글, 칸에 들어갈 값)
TABLE = [
    ("당도 11브릭스 정도예요", 11),
    ("Brix 12.5 선별", 12.5),
    ("브릭스 11 나왔습니다", 11),
    ("11~12브릭스", 11),
    ("올해 당도 12브릭스, 작년엔 13브릭스", None),
    ("당도 12브릭스 … 평균 12brix", 12),
    ("당도 12브릭스 5키로 3박스", 12),
    ("당도 높은 귤", None),
]


@pytest.fixture(autouse=True)
def no_model(monkeypatch):
    """모델 대신 빈 추출 결과를 돌려준다. 당도 칸은 모델 출력과 무관해야 한다."""

    def fake(mode, model, chunk, targets, images):
        return ExtractionResponse(
            Extraction(candidates=[], photo_requests=[]), {"mock": True}, None
        )

    monkeypatch.setattr(worker, "extract", fake)


def make(client, headers, brix=None, count=1):
    response = client.post(
        PREFIX,
        headers=key(headers),
        json={
            "targets": [
                {
                    "name": f"테스트 감귤 {i}",
                    "basicInfo": {"variety": "온주밀감", "expectedBrix": brix},
                }
                for i in range(count)
            ]
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def analysed(client, headers, batch):
    run = start(client, headers, batch["id"])
    drain()
    status = client.get(f"{PREFIX}/{batch['id']}/runs/{run['id']}", headers=headers).json()
    assert status["status"] == "SUCCEEDED", status
    return client.get(f"{PREFIX}/{batch['id']}", headers=headers).json()


def brix_of(batch, index=0):
    return batch["targets"][index]["basicInfo"]["expectedBrix"]


@pytest.mark.parametrize(("text", "expected"), TABLE)
def test_AC_03_5_single_brix_rule_table(text, expected):
    assert single_brix(text) == expected


@pytest.mark.parametrize(("text", "expected"), TABLE)
def test_AC_03_5_text_source_prefills_blank_expected_brix(client, login, text, expected):
    h = login("u-kang")
    batch = make(client, h)
    upload(client, h, batch, text=f"서귀포 노지 온주밀감\n{text}\n서늘한 곳에 보관해 주세요.")
    after = analysed(client, h, batch)
    assert brix_of(after) == expected


def test_AC_03_5_dev_228_p7_text_fills_field_and_quality_suggestion(client, login):
    h = login("u-kang")
    batch = make(client, h)
    upload(
        client,
        h,
        batch,
        text=(
            "서귀포 효돈 노지 온주밀감\n"
            "올해 귤은 껍질이 얇고 새콤달콤해요. 당도 11브릭스 정도 나왔어요.\n"
            "수확한 날 바로 보내요. 서늘한 곳에 보관해 주세요."
        ),
    )
    after = analysed(client, h, batch)
    assert brix_of(after) == 11
    assert after["targets"][0]["basicInfo"]["variety"] == "온주밀감"
    review = client.get(f"{PREFIX}/{batch['id']}/review", headers=h).json()
    quality = next(
        e["field"]["value"]
        for e in review["editorFields"]
        if e["field"]["fieldKey"] == "qualityEvidence"
    )
    assert "11" in quality


def test_AC_03_5_existing_value_is_not_overwritten(client, login):
    h = login("u-kang")
    batch = make(client, h, brix=12)
    upload(client, h, batch, text="당도 11브릭스 정도예요")
    after = analysed(client, h, batch)
    assert brix_of(after) == 12


def test_AC_03_5_producer_can_edit_prefilled_value(client, login):
    h = login("u-kang")
    batch = make(client, h)
    upload(client, h, batch, text="당도 11브릭스 정도예요")
    after = analysed(client, h, batch)
    assert brix_of(after) == 11
    response = client.put(
        f"{PREFIX}/{batch['id']}/basic-info",
        headers=h,
        json={
            "version": after["version"],
            "targets": [
                {
                    "targetId": after["targets"][0]["id"],
                    "basicInfo": {"variety": "온주밀감", "size": "", "expectedBrix": 10.5},
                }
            ],
        },
    )
    assert response.status_code == 200, response.text
    assert brix_of(response.json()) == 10.5
    # 다시 분석해도 생산자가 넣은 값은 그대로다.
    assert brix_of(analysed(client, h, response.json())) == 10.5


def test_AC_03_5_different_values_across_sources_stay_blank(client, login):
    h = login("u-kang")
    batch = make(client, h)
    upload(client, h, batch, text="당도 12브릭스")
    batch = client.get(f"{PREFIX}/{batch['id']}", headers=h).json()
    upload(client, h, batch, text="당도 13브릭스")
    after = analysed(client, h, batch)
    assert brix_of(after) is None


def test_AC_03_5_product_specific_sources_fill_only_their_product(client, login):
    h = login("u-kang")
    batch = make(client, h, count=2)
    first, second = (t["id"] for t in batch["targets"])
    for target_id, text in ((first, "당도 11브릭스"), (second, "당도 13브릭스")):
        current = client.get(f"{PREFIX}/{batch['id']}", headers=h).json()
        response = client.post(
            f"{PREFIX}/{batch['id']}/sources",
            headers=h,
            data={"batchVersion": current["version"], "text": text, "targetIds": target_id},
        )
        assert response.status_code == 201, response.text
    after = analysed(client, h, batch)
    assert [brix_of(after, 0), brix_of(after, 1)] == [11, 13]


@pytest.mark.parametrize(
    ("mime", "filename"),
    [("image/png", "label.png"), ("application/pdf", "label.pdf")],
)
def test_AC_03_5_photo_and_pdf_ocr_spans_fill_expected_brix(
    client, login, monkeypatch, mime, filename
):
    image = io.BytesIO()
    Image.new("RGB", (40, 40), "orange").save(image, format="PNG")
    if mime == "application/pdf":
        from app.source_analysis.synthetic import material

        data, mime, _ = material({"kind": "pdf", "text": "label", "pages": 1})
    else:
        data = image.getvalue()

    def fake_prepare(raw, raw_mime):
        if raw_mime == "text/plain":
            return preprocess.parse(raw, raw_mime)
        # OCR 조각은 줄 단위로 나뉜다: "당도" / "12.5 Brix" / "5kg 3박스".
        spans = [
            {"id": "s0", "text": "당도", "box": [0.1, 0.1, 0.3, 0.2]},
            {"id": "s1", "text": "12.5 Brix 선별", "box": [0.1, 0.3, 0.6, 0.4]},
            {"id": "s2", "text": "5kg 3박스", "box": [0.1, 0.5, 0.6, 0.6]},
        ]
        return [
            {
                "spans": spans,
                "image": base64.b64encode(image.getvalue()).decode(),
                "regions": [],
                "rotation": 0,
                "preprocessVersion": preprocess.PREPROCESS_VERSION,
            }
        ]

    monkeypatch.setattr(worker, "prepare", fake_prepare)
    h = login("u-kang")
    batch = make(client, h)
    response = client.post(
        f"{PREFIX}/{batch['id']}/sources",
        headers=h,
        data={"batchVersion": batch["version"], "targetIds": batch["targets"][0]["id"]},
        files={"file": (filename, data, mime)},
    )
    assert response.status_code == 201, response.text
    after = analysed(client, h, batch)
    assert brix_of(after) == 12.5
