"""DEV-304 고른 생산자만 남기는 운영 데이터 정리 명령."""

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from sqlalchemy import func, insert, select, update

from app.admin import purge_except
from app.admin.purge_except import RULES, PurgeRefused, main, parse, purge
from app.core.db import Base, get_sessionmaker

KEEP = ["u-kang", "u-halla"]
KEPT_FARMS = {"f-kang", "f-halla"}
ADMINS = {"u-admin", "u-farmclub"}
WHEN = datetime(2026, 10, 7, 1, tzinfo=UTC)
KEY_KANG = "a" * 32 + "/" + "b" * 32
KEY_OTHER = "c" * 32 + "/" + "d" * 32


def t(name):
    return Base.metadata.tables[name]


def rows(name, order=None) -> list[dict]:
    table = t(name)
    query = select(table).order_by(*(order or table.primary_key.columns))
    with get_sessionmaker()() as session:
        return [dict(r) for r in session.execute(query).mappings()]


def snapshot() -> dict[str, list[dict]]:
    return {table.name: rows(table.name) for table in Base.metadata.sorted_tables}


def event(event_id, target_type, target_id, actor=None):
    return dict(
        id=event_id,
        event_type="test",
        actor_id=actor,
        target_type=target_type,
        target_id=target_id,
        request_summary={},
        status="SUCCEEDED",
        retryable=False,
        attempts=1,
        created_at=WHEN,
        updated_at=WHEN,
    )


@pytest.fixture
def extras():
    """시드에 없는 표(미디어·첨부·감사·결정·멱등·자료·비용)를 채운다."""
    with get_sessionmaker()() as s, s.begin():
        s.execute(
            insert(t("public_media")),
            [
                dict(
                    id="med-kang",
                    farm_id="f-kang",
                    uploader_id="u-kang",
                    kind="image",
                    mime_type="image/jpeg",
                    ext="jpg",
                    size=1,
                    storage_key=KEY_KANG,
                    created_at=WHEN,
                ),
                dict(
                    id="med-other",
                    farm_id="f-hyodon",
                    uploader_id="u-hyodon",
                    kind="image",
                    mime_type="image/jpeg",
                    ext="jpg",
                    size=1,
                    storage_key=KEY_OTHER,
                    created_at=WHEN,
                ),
            ],
        )
        s.execute(
            update(t("products"))
            .where(t("products").c.id == "p-house")
            .values(photos=["/api/media/med-kang.jpg"])
        )
        s.execute(
            insert(t("private_attachments")),
            [
                dict(
                    id="att-kang",
                    uploader_id="u-kang",
                    thread_id="thread-support-f-kang",
                    order_id="o-1",
                    mime_type="image/jpeg",
                    size=1,
                    data=b"x",
                    bound=True,
                    created_at=WHEN,
                ),
                dict(
                    id="att-minji",
                    uploader_id="u-minji",
                    thread_id=None,
                    order_id=None,
                    mime_type="image/jpeg",
                    size=1,
                    data=b"x",
                    bound=True,
                    created_at=WHEN,
                ),
            ],
        )
        s.execute(
            insert(t("thread_messages")).values(
                id="m-kang-photo",
                thread_id="thread-support-f-kang",
                sender_type="PRODUCER",
                body="사진",
                photos=[],
                attachment_ids=["att-kang", "att-minji"],
                source_refs=[],
                masked=False,
                needs_human=False,
                created_at=WHEN,
                order_id="o-1",
            )
        )
        s.execute(
            insert(t("manager_events")),
            [
                event("ev-farm-kang", "farm", "f-kang", actor="u-admin"),
                event("ev-farm-other", "farm", "f-hyodon", actor="u-admin"),
                event("ev-user-halla", "user", "u-halla"),
                event("ev-user-minji", "user", "u-minji"),
                event(
                    "ev-capacity",
                    "capacity_request",
                    "p-cheonggyeon:capacity-p-cheonggyeon",
                    actor="u-minji",
                ),
                event("ev-order", "order", "o-1", actor="u-admin"),
                event("ev-thread", "thread", "thread-support-f-kang"),
            ],
        )
        s.execute(
            insert(t("producer_decisions")),
            [
                dict(
                    id="pd-kang",
                    farm_id="f-kang",
                    application_at=WHEN,
                    decision="APPROVED",
                    manager_id="u-admin",
                    decided_at=WHEN,
                ),
                dict(
                    id="pd-other",
                    farm_id="f-hyodon",
                    application_at=WHEN,
                    decision="APPROVED",
                    manager_id="u-admin",
                    decided_at=WHEN,
                ),
            ],
        )
        s.execute(
            insert(t("idempotency_records")),
            [
                dict(
                    user_id=uid,
                    scope="s",
                    key="k",
                    body_hash="h",
                    status_code=200,
                    response={},
                    created_at=WHEN,
                )
                for uid in ("u-admin", "u-kang", "u-minji")
            ],
        )
        s.execute(
            insert(t("source_batches")),
            [
                dict(id="batch-kang", farm_id="f-kang", targets=[], created_at=WHEN),
                dict(id="batch-other", farm_id="f-hyodon", targets=[], created_at=WHEN),
            ],
        )
        s.execute(insert(t("ai_usage")).values(id="usage-1", feature="ai_answer", created_at=WHEN))
        # 남는 소식이 지울 소비자의 답장을 인용한다
        s.execute(
            update(t("broadcasts"))
            .where(t("broadcasts").c.id == "n-2")
            .values(quoted_reply_id="reply-1")
        )


def test_DEV_304_rules_cover_every_table():
    assert set(RULES) == set(Base.metadata.tables)


def test_DEV_304_dry_run_changes_nothing(extras):
    before = snapshot()
    report = purge(KEEP)
    assert not report.committed
    assert report.tables["users"][0] > 0  # 지울 것을 보여 준다
    assert {u[0] for u in report.users} == ADMINS | set(KEEP)
    assert snapshot() == before


def test_DEV_304_commit_keeps_chosen_producers_and_removes_the_rest(extras):
    kept_products = [r for r in rows("products") if r["farm_id"] in KEPT_FARMS]
    kept_options = [r for r in rows("product_options") if r["product_id"].startswith("p-")]
    support = rows("threads")
    support = [r for r in support if r["id"] in {f"thread-support-{f}" for f in KEPT_FARMS}]
    support_messages = [
        r
        for r in rows("thread_messages")
        if r["thread_id"] in {s["id"] for s in support} and r["id"] != "m-kang-photo"
    ]
    capacity = rows("capacity_requests")
    assert len(support) == 2 and support_messages

    report = purge(KEEP, commit=True)
    assert report.committed

    assert {r["id"] for r in rows("users")} == ADMINS | set(KEEP)
    assert {r["id"] for r in rows("farms")} == KEPT_FARMS
    # 상품은 카운터 외에 그대로
    assert rows("products") == kept_products
    assert len(rows("product_options")) == len(
        [o for o in kept_options if o["product_id"] in {p["id"] for p in kept_products}]
    )
    assert rows("capacity_requests") == capacity
    assert [r for r in rows("threads")] == support
    left = rows("thread_messages")
    assert [m for m in left if m["id"] != "m-kang-photo"] == support_messages
    # 남는 메시지의 지운 첨부·주문 ID는 비운다
    photo = next(m for m in left if m["id"] == "m-kang-photo")
    assert photo["attachment_ids"] == ["att-kang"] and photo["order_id"] is None
    assert [(a["id"], a["order_id"]) for a in rows("private_attachments")] == [("att-kang", None)]

    assert {r["id"] for r in rows("producer_decisions")} == {"pd-kang"}
    events = {r["id"]: r for r in rows("manager_events")}
    purge_events = [e for e in events.values() if e["event_type"] == "data.purge_except"]
    assert len(purge_events) == 1
    assert purge_events[0]["request_summary"] == {"via": "cli", "keep": sorted(KEEP)}
    assert purge_events[0]["actor_id"] is None
    assert set(events) - {purge_events[0]["id"]} == {
        "ev-farm-kang",
        "ev-user-halla",
        "ev-capacity",
        "ev-thread",
    }
    assert events["ev-farm-kang"]["actor_id"] == "u-admin"
    assert events["ev-capacity"]["actor_id"] is None  # 지운 사용자를 가리키던 actor

    assert {r["id"] for r in rows("public_media")} == {"med-kang"}
    assert report.storage_keys == [KEY_OTHER]
    assert {r["id"] for r in rows("source_batches")} == {"batch-kang"}
    # 저장한 응답에 지울 소비자 정보가 있을 수 있어 남는 사용자 것도 지운다
    assert rows("idempotency_records") == []
    assert [r["id"] for r in rows("ai_usage")] == ["usage-1"]

    for name in (
        "orders",
        "payments",
        "refunds",
        "order_inquiries",
        "follows",
        "reactions",
        "room_replies",
        "room_reads",
        "support_threads",
        "support_messages",
        "shipping_addresses",
        "user_consents",
        "notice_reads",
        "escalations",
    ):
        assert rows(name) == [], name
    # 사용자를 가리키는 모든 FK가 남는 사용자만 가리킨다
    users = ADMINS | set(KEEP)
    for table in Base.metadata.sorted_tables:
        for fk in table.foreign_keys:
            if fk.column.table.name == "users":
                values = {r[fk.parent.name] for r in rows(table.name)} - {None}
                assert values <= users, (table.name, fk.parent.name, values)

    # 다시 셈: 팔로우·반응·주문이 모두 지워져 0
    assert {r["follower_count"] for r in rows("farms")} == {0}
    assert {r["reaction_count"] for r in rows("broadcasts")} == {0}
    assert {r["reserved_count"] for r in rows("stage_allocations")} == {0}
    assert next(r for r in rows("broadcasts") if r["id"] == "n-2")["quoted_reply_id"] is None


def test_DEV_304_kept_farm_still_works_after_commit(extras, client, login, admin_headers):
    purge(KEEP, commit=True)
    from app.accounts.admin_token import main as admin_token

    admin_token([])  # u-admin이 남아 토큰을 발급한다
    assert client.get("/admin/users", headers=admin_headers).status_code == 200
    farms = client.get("/api/farms").json()["items"]
    assert {f["farmId"] for f in farms} == KEPT_FARMS
    assert client.get("/api/farms/me", headers=login("u-kang")).status_code == 200


def test_DEV_304_admin_user_detail_keeps_products_and_drafts(extras, client, admin_headers):
    """DEV-303 관리자 사용자 상세의 상품·초안은 남은 농가 것 그대로, 지운 농가 초안은 사라진다."""
    with get_sessionmaker()() as s, s.begin():
        s.execute(
            insert(t("product_drafts")),
            [
                dict(
                    id=f"d-{farm}",
                    farm_id=f"f-{farm}",
                    input_text="귤",
                    output={"name": "귤"},
                    missing_fields=[],
                    failed=False,
                    created_at=WHEN,
                )
                for farm in ("kang", "hyodon")
            ],
        )

    def detail():
        body = client.get("/admin/users/u-kang", headers=admin_headers).json()
        # 주문을 지우면 판매 상태(남은 물량·옵션별 예약 수)는 바뀐다. 상품 정의·옵션·초안만 비교한다
        products = [
            {k: v for k, v in p.items() if k not in {"availability", "remainingGrams", "options"}}
            | {"options": [{k: v for k, v in o.items() if k != "reserved"} for o in p["options"]]}
            for p in body["products"]
        ]
        return products, [d["draftId"] for d in body["drafts"]]

    before_products, before_drafts = detail()
    assert before_products and before_drafts == ["d-kang"]
    purge(KEEP, commit=True)
    assert detail() == (before_products, ["d-kang"])
    assert [r["id"] for r in rows("product_drafts")] == ["d-kang"]


@pytest.mark.parametrize(
    ("keep", "message"),
    [
        (["u-minji"], "생산자가 아니에요"),
        (["u-admin"], "생산자가 아니에요"),
        (["u-nobody"], "사용자가 없어요"),
        (["u-kang", "u-new"], "농가가 없어요"),
        ([], "한 명 이상"),
    ],
)
def test_DEV_304_refuses_bad_keep_and_changes_nothing(keep, message):
    before = snapshot()
    with pytest.raises(PurgeRefused, match=message):
        purge(keep, commit=True)
    assert snapshot() == before


def test_DEV_304_refuses_withdrawn_producer():
    with get_sessionmaker()() as s, s.begin():
        s.execute(update(t("users")).where(t("users").c.id == "u-halla").values(deleted_at=WHEN))
    with pytest.raises(PurgeRefused, match="탈퇴"):
        purge(KEEP, commit=True)
    assert len(rows("users")) > 4


def test_DEV_304_refuses_when_kept_product_uses_other_farm_media(extras):
    with get_sessionmaker()() as s, s.begin():
        s.execute(
            update(t("products"))
            .where(t("products").c.id == "p-redhyang")
            .values(photos=["/api/media/med-other.jpg"])
        )
    before = snapshot()
    with pytest.raises(PurgeRefused, match="med-other"):
        purge(KEEP, commit=True)
    assert snapshot() == before


def test_DEV_304_refuses_table_without_rule(monkeypatch):
    monkeypatch.delitem(RULES, "follows")
    with pytest.raises(PurgeRefused, match="follows"):
        purge(KEEP)


def test_DEV_304_parse_rejects_unknown_options():
    assert parse(["--keep", "u-kang", "--keep=u-halla", "--commit"]) == (
        ["u-kang", "u-halla"],
        True,
    )
    for argv in (
        [],
        ["--commit"],
        ["--keep"],
        ["--keep", "--commit"],
        ["u-kang"],
        ["--keep", "u-kang", "--comit"],
        ["--keep="],
    ):
        with pytest.raises(PurgeRefused):
            parse(argv)


def test_DEV_304_cli_dry_run_then_commit(extras, capsys, monkeypatch):
    with pytest.raises(SystemExit):
        main(["--keep", "u-minji"])
    main(["--keep", "u-kang", "--keep", "u-halla"])
    out = capsys.readouterr().out
    assert "미리보기라 되돌렸어요" in out and "u-kang" in out and KEY_OTHER in out
    assert len(rows("users")) > 4

    deleted = []
    monkeypatch.setattr(purge_except, "get_settings", lambda: SimpleNamespace(source_storage="r2"))
    monkeypatch.setattr(
        purge_except, "delete_storage", lambda keys: (deleted.extend(keys), (len(keys), []))[1]
    )
    main(["--keep", "u-kang", "--keep", "u-halla", "--commit"])
    out = capsys.readouterr().out
    assert "지웠어요" in out and "R2 파일 1개" in out
    assert deleted == [KEY_OTHER]
    with get_sessionmaker()() as session:
        assert session.scalar(select(func.count()).select_from(t("users"))) == 4


KEY_SHARED = "e" * 32 + "/" + "f" * 32
KEY_PAGE = "1" * 32 + "/" + "2" * 32


@pytest.fixture
def source_rows(extras):
    """자료 분석 표와 생산자 문의 대화방(support_threads)을 남는 쪽·지우는 쪽 모두 채운다."""
    with get_sessionmaker()() as s, s.begin():
        for side, batch in (("kang", "batch-kang"), ("other", "batch-other")):
            asset_key = KEY_KANG if side == "kang" else KEY_SHARED
            s.execute(
                insert(t("source_assets")).values(
                    id=f"asset-{side}",
                    batch_id=batch,
                    checksum="x",
                    storage_key=asset_key,
                    filename="a.pdf",
                    mime="application/pdf",
                    size=1,
                    target_ids=[],
                )
            )
            s.execute(
                insert(t("source_pages")).values(
                    id=f"page-{side}",
                    asset_id=f"asset-{side}",
                    revision=1,
                    number=1,
                    spans=[],
                    redacted_spans=[],
                    image_key=KEY_PAGE if side == "other" else None,
                )
            )
            s.execute(
                insert(t("source_runs")).values(
                    id=f"run-{side}", batch_id=batch, mode="m", model="m", targets=[]
                )
            )
            s.execute(
                insert(t("source_items")).values(
                    id=f"item-{side}",
                    run_id=f"run-{side}",
                    asset_id=f"asset-{side}",
                    revision=1,
                    target_ids=[],
                )
            )
            s.execute(
                insert(t("source_candidates")).values(
                    id=f"cand-{side}",
                    batch_id=batch,
                    item_id=f"item-{side}",
                    field_key="f",
                    value="v",
                    evidence=[],
                )
            )
        # 지우는 농가 자료와 같은 파일을 남는 상품 사진이 쓴다 → 그 키는 지우지 않는다
        s.execute(
            insert(t("source_public_photos")),
            [
                dict(id="pp-kang", product_id="p-house", storage_key=KEY_SHARED),
                dict(id="pp-other", product_id="p-hyodon", storage_key=KEY_OTHER),
            ],
        )
        s.execute(
            insert(t("support_threads")).values(id="st-kang", user_id="u-kang", created_at=WHEN)
        )
        s.execute(
            insert(t("support_messages")).values(
                id="sm-kang", thread_id="st-kang", sender_type="OPERATOR", created_at=WHEN
            )
        )


def test_DEV_304_source_rows_and_storage_keys(source_rows):
    report = purge(KEEP, commit=True)
    for name, kept in (
        ("source_assets", {"asset-kang"}),
        ("source_pages", {"page-kang"}),
        ("source_runs", {"run-kang"}),
        ("source_items", {"item-kang"}),
        ("source_candidates", {"cand-kang"}),
        ("source_public_photos", {"pp-kang"}),
    ):
        assert {r["id"] for r in rows(name)} == kept, name
    # 남는 생산자의 소비자형 문의방도 남는다
    assert [r["id"] for r in rows("support_threads")] == ["st-kang"]
    assert [r["id"] for r in rows("support_messages")] == ["sm-kang"]
    # 지운 공개 미디어·자료 페이지 키만. 남는 상품 사진이 쓰는 KEY_SHARED와 남는 KEY_KANG은 빠진다
    assert report.storage_keys == sorted([KEY_OTHER, KEY_PAGE])


def test_DEV_304_skips_keys_of_source_files_already_cleaned(source_rows):
    """status=DELETED 자료는 워커 cleanup()이 파일을 이미 지웠으므로 지울 키로 세지 않는다."""
    key_gone = "9" * 32 + "/" + "8" * 32
    with get_sessionmaker()() as s, s.begin():
        s.execute(
            update(t("source_assets"))
            .where(t("source_assets").c.id == "asset-other")
            .values(storage_key=key_gone, deleted=True, status="DELETED")
        )
    report = purge(KEEP, commit=True)
    assert {r["id"] for r in rows("source_assets")} == {"asset-kang"}
    assert report.storage_keys == sorted([KEY_OTHER, KEY_PAGE])


def test_DEV_304_refuses_kept_history_saved_by_deleted_user():
    with get_sessionmaker()() as s, s.begin():
        s.execute(
            insert(t("farm_ai_settings_history")).values(
                farm_id="f-kang", version=1, settings={}, saved_by="u-minji", created_at=WHEN
            )
        )
    before = snapshot()
    with pytest.raises(PurgeRefused, match="saved_by"):
        purge(KEEP, commit=True)
    assert snapshot() == before


def test_DEV_304_fk_violation_rolls_back_and_refuses(source_rows):
    # 남는 배치의 후보가 지울 배치의 항목을 가리킨다(규칙으로 못 고치는 연결)
    with get_sessionmaker()() as s, s.begin():
        s.execute(
            update(t("source_candidates"))
            .where(t("source_candidates").c.id == "cand-kang")
            .values(item_id="item-other")
        )
    before = snapshot()
    with pytest.raises(PurgeRefused, match="되돌렸어요"):
        purge(KEEP, commit=True)
    assert snapshot() == before


def test_DEV_304_kept_broadcast_drops_deleted_reply_snapshot(extras):
    with get_sessionmaker()() as s, s.begin():
        s.execute(
            update(t("broadcasts"))
            .where(t("broadcasts").c.id == "n-2")
            .values(reply_to={"senderType": "CONSUMER", "body": "답장"})
        )
        # 지울 이벤트의 지울 actor는 세지 않는다
        s.execute(insert(t("manager_events")).values(event("ev-gone", "order", "o-2", "u-minji")))
    report = purge(KEEP, commit=True)
    n2 = next(r for r in rows("broadcasts") if r["id"] == "n-2")
    assert n2["quoted_reply_id"] is None and n2["reply_to"] is None
    # 남는 행만 센다: 지운 소비자 actor를 가진 남는 이벤트는 ev-capacity 하나
    assert report.nulled["manager_events.actor_id"] == 1
    assert report.nulled["broadcasts.quoted_reply_id"] == 1
    assert "broadcasts.reply_to" not in report.nulled


def test_DEV_304_kept_broadcast_drops_legacy_snapshot_without_reply_id(extras):
    """0030~0031 사이 인용 소식은 quoted_reply_id 없이 소비자 답장 스냅샷만 있다."""
    with get_sessionmaker()() as s, s.begin():
        s.execute(
            update(t("broadcasts"))
            .where(t("broadcasts").c.id == "n-1")
            .values(reply_to={"senderType": "CONSUMER", "body": "옛 답장"}, quoted_reply_id=None)
        )
    report = purge(KEEP, commit=True)
    assert next(r for r in rows("broadcasts") if r["id"] == "n-1")["reply_to"] is None
    assert report.nulled["broadcasts.reply_to"] == 1


def test_DEV_304_dry_run_does_not_touch_r2(extras, capsys, monkeypatch):
    called = []
    monkeypatch.setattr(purge_except, "get_settings", lambda: SimpleNamespace(source_storage="r2"))
    monkeypatch.setattr(purge_except, "delete_storage", lambda keys: called.append(keys))
    main(["--keep", "u-kang", "--keep", "u-halla"])
    assert called == []
    assert "미리보기라 되돌렸어요" in capsys.readouterr().out


def test_DEV_304_delete_storage_reports_failures(monkeypatch):
    deleted = []

    class FakeStorage:
        def delete(self, key):
            if key == KEY_OTHER:
                raise RuntimeError("down")
            deleted.append(key)

    monkeypatch.setattr("app.source_analysis.storage.Storage", FakeStorage)
    done, failed = purge_except.delete_storage([KEY_KANG, KEY_OTHER, "../etc/passwd"])
    assert (done, deleted) == (1, [KEY_KANG])
    assert failed == [KEY_OTHER, "../etc/passwd"]


def test_DEV_304_gives_up_when_tables_are_locked_by_another_writer(monkeypatch):
    monkeypatch.setattr(purge_except, "LOCK_TIMEOUT", "200ms")
    with get_sessionmaker()() as other, other.begin():
        other.execute(update(t("farms")).where(t("farms").c.id == "f-kang").values(intro="잠금"))
        before = len(rows("users"))
        with pytest.raises(PurgeRefused, match="잠그지 못했어요"):
            purge(KEEP, commit=True)
    assert len(rows("users")) == before


def test_DEV_304_conversations_between_kept_producers_are_deleted(extras):
    # 남는 생산자(u-halla)가 남는 농가(f-kang)와 나눈 1:1 대화는 문의방이 아니라 지운다
    with get_sessionmaker()() as s, s.begin():
        s.execute(
            insert(t("threads")).values(
                id="thread-halla-kang",
                farm_id="f-kang",
                consumer_id="u-halla",
                ai_mode="AUTO",
                version=1,
                created_at=WHEN,
            )
        )
    purge(KEEP, commit=True)
    assert {r["id"] for r in rows("threads")} == {f"thread-support-{f}" for f in KEPT_FARMS}


def test_DEV_304_kept_capacity_request_forgets_deleted_decider():
    with get_sessionmaker()() as s, s.begin():
        s.execute(
            update(t("capacity_requests"))
            .where(t("capacity_requests").c.id == "capacity-p-cheonggyeon")
            .values(decided_by="u-minji")
        )
    report = purge(KEEP, commit=True)
    assert [r["decided_by"] for r in rows("capacity_requests")] == [None]
    assert report.nulled["capacity_requests.decided_by"] == 1


@pytest.mark.parametrize(
    ("table", "row_id", "values"),
    [
        ("farms", "f-halla", {"photo": "/api/media/med-other.jpg"}),
        ("broadcasts", "n-1", {"photos": ["/api/media/med-other.jpg"]}),
        ("thread_messages", "m-kang-photo", {"photos": ["/api/media/med-other.jpg"]}),
    ],
)
def test_DEV_304_refuses_other_farm_media_in_farm_or_news(extras, table, row_id, values):
    with get_sessionmaker()() as s, s.begin():
        s.execute(update(t(table)).where(t(table).c.id == row_id).values(**values))
    before = snapshot()
    with pytest.raises(PurgeRefused, match="med-other"):
        purge(KEEP, commit=True)
    assert snapshot() == before


def test_DEV_304_refuses_other_farm_media_in_kept_ai_faq(extras):
    with get_sessionmaker()() as s, s.begin():
        s.execute(
            insert(t("farm_ai_settings")).values(
                farm_id="f-kang",
                faqs=[{"q": "사진", "a": "![](/api/media/med-other.jpg)"}],
                updated_at=WHEN,
            )
        )
    before = snapshot()
    with pytest.raises(PurgeRefused, match="med-other"):
        purge(KEEP, commit=True)
    assert snapshot() == before


def test_DEV_304_kept_attachment_forgets_deleted_thread(extras):
    """남는 문의방 메시지가 지울 방에서 올린 첨부를 가리키면 첨부는 남고 방 ID만 비운다."""
    with get_sessionmaker()() as s, s.begin():
        s.execute(
            update(t("private_attachments"))
            .where(t("private_attachments").c.id == "att-kang")
            .values(thread_id="thread-gone")
        )
    report = purge(KEEP, commit=True)
    assert [(a["id"], a["thread_id"]) for a in rows("private_attachments")] == [("att-kang", None)]
    assert report.nulled["private_attachments.thread_id"] == 1


def test_DEV_304_refuses_other_farm_media_in_kept_ai_history(extras):
    with get_sessionmaker()() as s, s.begin():
        s.execute(
            insert(t("farm_ai_settings_history")).values(
                farm_id="f-kang",
                version=1,
                settings={"faqs": [{"a": "/api/media/med-other.jpg"}]},
                saved_by="u-kang",
                created_at=WHEN,
            )
        )
    before = snapshot()
    with pytest.raises(PurgeRefused, match="med-other"):
        purge(KEEP, commit=True)
    assert snapshot() == before


def test_DEV_304_refuses_kept_product_using_deleted_product_source_photo(source_rows):
    """다른 농가 상품의 자료 분석 사진 주소를 남는 상품이 담고 있으면 거부한다."""
    with get_sessionmaker()() as s, s.begin():
        s.execute(
            update(t("products"))
            .where(t("products").c.id == "p-house")
            .values(photos=["/api/source-media/pp-other"])
        )
    before = snapshot()
    with pytest.raises(PurgeRefused, match="pp-other"):
        purge(KEEP, commit=True)
    assert snapshot() == before
