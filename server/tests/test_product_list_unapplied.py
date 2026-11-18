"""DEV-361 PR C: the producer product list marks buyer-visible products with private changes not
applied yet (`hasUnappliedChanges`), so the card can say '반영 안 한 수정 있음'.

Product draft, a composer page draft whose content differs from the applied one, and an unapplied
legacy-editor revision count. Pre-sale and closed products never do (they save directly / cannot
change). The list query does not grow per product.
"""

from sqlalchemy import event

from app.core.db import get_sessionmaker
from app.source_analysis.models import ProductWorkspace
from tests.test_product_draft import (
    apply_all,
    page_draft,
    put_draft,
    save_page,
    saved,
    workspace,
)
from tests.test_source_analysis import source_settings  # noqa: F401
from tests.test_source_page_migration import set_modules


def flags(client, login):
    response = client.get("/api/products/mine", headers=login("u-kang"))
    assert response.status_code == 200, response.text
    return {p["productId"]: p["hasUnappliedChanges"] for p in response.json()["items"]}


def test_DEV_361_list_is_clean_without_private_changes(client, login):
    assert not any(flags(client, login).values())
    workspace(client, login)  # opening the composer alone is not a change
    assert flags(client, login)["p-house"] is False


def test_DEV_361_saved_product_draft_marks_the_card_until_applied(client, login):
    view = saved(client, login, "p-house", {"name": "산지직송 하우스 감귤"})
    assert flags(client, login)["p-house"] is True
    applied = apply_all(client, login, "p-house", view["version"])
    assert applied.status_code == 200, applied.text
    assert flags(client, login)["p-house"] is False


def test_DEV_361_pending_approval_draft_marks_the_card(client, login):
    saved(client, login, "p-cheonggyeon", {"name": "청견 5kg 산지직송"})
    result = flags(client, login)
    assert result["p-cheonggyeon"] is True
    assert result["p-house"] is False


def test_AC_SRC_9_DEV_361_changed_page_draft_marks_the_card_and_apply_clears_it(client, login):
    set_modules()
    row = workspace(client, login)
    # re-saving the same page content is not a change
    save_page(row, ["hero", "taste", "sizePhoto"])
    assert flags(client, login)["p-house"] is False
    save_page(row, ["hero", "taste"])
    assert flags(client, login)["p-house"] is True
    applied = apply_all(
        client, login, "p-house", row["version"], page=page_draft(client, login, row)
    )
    assert applied.status_code == 200, applied.text
    assert flags(client, login)["p-house"] is False


def test_DEV_361_unapplied_legacy_revision_marks_the_card(client, login):
    workspace(client, login)
    with get_sessionmaker()() as db:
        row = db.get(ProductWorkspace, "p-house")
        row.snapshot = {**row.snapshot, "hiddenSectionIds": ["story"]}
        db.commit()
    assert flags(client, login)["p-house"] is True


def test_DEV_361_pre_sale_and_closed_products_are_never_marked(client, login):
    result = flags(client, login)
    assert result["p-hallabong"] is False
    assert result["p-josaeng"] is False
    # a pre-sale product saves directly; it never holds a draft that needs '상품에 반영'
    row = workspace(client, login, "p-hallabong")
    refused = put_draft(client, login, "p-hallabong", row["version"], {"name": "x"})
    assert refused.status_code == 409
    assert flags(client, login)["p-hallabong"] is False


def test_DEV_361_list_query_count_does_not_grow_with_products(client, login):
    saved(client, login, "p-house", {"name": "산지직송"})
    saved(client, login, "p-cheonggyeon", {"name": "청견 산지직송"})
    engine = get_sessionmaker()().get_bind()
    statements: list[str] = []

    def count(conn, cursor, statement, *args):
        if "source_drafts" in statement or "source_product_workspaces" in statement:
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", count)
    try:
        assert flags(client, login)["p-house"] is True
    finally:
        event.remove(engine, "before_cursor_execute", count)
    # one workspace query (+ at most one draft query), not one per product
    assert len(statements) <= 2, statements
