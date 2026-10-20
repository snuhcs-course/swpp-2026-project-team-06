"""운영 검증에 쓴 테스트 농가와 거기 연결된 데이터를 지운다(DEV-93).

실행: uv run python -m app.admin.purge_test_farm <농가 ID> [--commit]
기본은 시험 실행이다. 한 트랜잭션에서 지운 뒤 롤백하고 표별 행 수만 보여 준다.
--commit을 붙여야 남긴다.

지우는 조건(하나라도 어기면 아무것도 지우지 않는다):
- 농가 이름에 TEST_MARKER가 있다.
- 그 농가 주문의 소비자가 모두 테스트 계정이다.
  실사용자 거래 기록은 보관 정책(PQ-06) 전까지 지우지 않는다.
- 모은 행이 MAX_ROWS 이하다.

실제 사용자·농가 삭제(회원 탈퇴 등)는 이 명령의 범위가 아니다(DEV-94).
"""

import re
import sys
from typing import Any

from sqlalchemy import Connection, MetaData, String, Table, cast, or_, select, tuple_

from app.core.db import get_engine

TEST_MARKER = "(삭제 예정)"
MAX_ROWS = 500

Rows = dict[str, dict[tuple[Any, ...], dict[str, Any]]]


class PurgeRefused(Exception):
    pass


def _pk(table: Table, row: dict[str, Any]) -> tuple[Any, ...]:
    return tuple(row[c.name] for c in table.primary_key.columns)


def _add(found: Rows, table: Table, rows) -> int:
    bucket = found.setdefault(table.name, {})
    new = 0
    for row in rows:
        key = _pk(table, row)
        if key not in bucket:
            bucket[key] = dict(row)
            new += 1
    return new


def _mentions(column, id_: str):
    """문자열 안에 ID가 통째로 있는지(o-1이 o-11에 맞지 않게 ID 글자 경계를 본다)."""
    return column.regexp_match(f"(^|[^A-Za-z0-9_-]){re.escape(id_)}($|[^A-Za-z0-9_-])")


def _ids(found: Rows, table: str) -> list[str]:
    return [row["id"] for row in found.get(table, {}).values()]


def collect(conn: Connection, md: MetaData, farm_id: str) -> Rows:
    """농가에서 FK 자식 방향으로 지울 행을 모은다. 조건을 어기면 PurgeRefused."""
    t = md.tables
    farm = conn.execute(select(t["farms"]).where(t["farms"].c.id == farm_id)).mappings().first()
    if farm is None:
        raise PurgeRefused(f"{farm_id} 농가가 없어요.")
    if TEST_MARKER not in farm["name"]:
        raise PurgeRefused(f"농가 이름에 {TEST_MARKER} 표시가 없어요: {farm['name']}")

    found: Rows = {}
    _add(found, t["farms"], [farm])
    producer = (
        conn.execute(select(t["users"]).where(t["users"].c.id == farm["producer_id"]))
        .mappings()
        .first()
    )
    # 시드 테스트 계정은 다른 검증에도 쓰므로 남긴다.
    if producer is not None and not producer["is_test_account"]:
        _add(found, t["users"], [producer])

    def follow_fks() -> None:
        changed = True
        while changed:
            changed = False
            for child in md.sorted_tables:
                if child.name == "users":
                    continue
                # 복합 FK(예: 주문 → (product_id, option_id))는 열 묶음으로 맞춘다.
                # 열 하나씩 맞추면 다른 상품의 같은 옵션 ID까지 딸려 온다.
                for constraint in child.foreign_key_constraints:
                    parent = constraint.referred_table
                    if parent.name not in found:
                        continue
                    pairs = [(e.parent, e.column.name) for e in constraint.elements]
                    values = {
                        tuple(r[name] for _, name in pairs) for r in found[parent.name].values()
                    }
                    values = {v for v in values if None not in v}
                    if not values:
                        continue
                    cols = [col for col, _ in pairs]
                    where = (
                        cols[0].in_([v[0] for v in values])
                        if len(cols) == 1
                        else tuple_(*cols).in_(list(values))
                    )
                    rows = conn.execute(select(child).where(where)).mappings()
                    if _add(found, child, rows):
                        changed = True

    follow_fks()

    # 감사 이벤트와 멱등 기록은 ID를 문자열로만 가리킨다.
    text_ids = [
        *_ids(found, "farms"),
        *_ids(found, "products"),
        *_ids(found, "orders"),
        *_ids(found, "capacity_requests"),
    ]
    events, records = t["manager_events"], t["idempotency_records"]
    _add(
        found,
        events,
        conn.execute(
            select(events).where(or_(*[_mentions(events.c.target_id, i) for i in text_ids]))
        ).mappings(),
    )
    # 주문 생성은 scope가 "orders"라 응답에 담긴 주문 ID로 찾는다.
    record_match = [_mentions(records.c.scope, i) for i in text_ids] + [
        cast(records.c.response, String).contains(f'"{i}"') for i in _ids(found, "orders")
    ]
    _add(found, records, conn.execute(select(records).where(or_(*record_match))).mappings())
    follow_fks()

    farm_ids = set(_ids(found, "farms"))
    if farm_ids != {farm_id}:
        raise PurgeRefused(f"다른 농가가 섞였어요: {sorted(farm_ids - {farm_id})}")
    user_ids = set(_ids(found, "users"))
    if not user_ids <= {farm["producer_id"]}:
        raise PurgeRefused(f"다른 사용자가 섞였어요: {sorted(user_ids)}")
    consumers = {r["consumer_id"] for r in found.get("orders", {}).values()}
    if consumers:
        users = t["users"]
        real = (
            conn.execute(
                select(users.c.id).where(
                    users.c.id.in_(consumers), users.c.is_test_account.is_(False)
                )
            )
            .scalars()
            .all()
        )
        if real:
            raise PurgeRefused(f"실사용자 주문이 있어 지우지 않아요: {sorted(real)}")
    total = sum(len(rows) for rows in found.values())
    if total > MAX_ROWS:
        raise PurgeRefused(f"지울 행이 {total}개로 상한 {MAX_ROWS}를 넘어요.")
    return found


def purge(farm_id: str, commit: bool = False) -> dict[str, int]:
    """조건을 확인하고 지운다. commit이 아니면 롤백한다. 표별 행 수를 돌려준다."""
    engine = get_engine()
    md = MetaData()
    md.reflect(bind=engine)
    with engine.connect() as conn:
        tx = conn.begin()
        try:
            found = collect(conn, md, farm_id)
            for table in reversed(md.sorted_tables):
                rows = found.get(table.name)
                if rows:
                    cols = list(table.primary_key.columns)
                    conn.execute(table.delete().where(tuple_(*cols).in_(list(rows))))
        except BaseException:
            tx.rollback()
            raise
        if commit:
            tx.commit()
        else:
            tx.rollback()
    return {name: len(rows) for name, rows in sorted(found.items())}


def main(argv: list[str]) -> None:
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 1:
        sys.exit("사용법: python -m app.admin.purge_test_farm <농가 ID> [--commit]")
    commit = "--commit" in argv
    try:
        counts = purge(args[0], commit=commit)
    except PurgeRefused as exc:
        sys.exit(f"지우지 않았어요: {exc}")
    for name, count in counts.items():
        print(f"{name}: {count}")
    print(f"합계: {sum(counts.values())}")
    print(
        "지웠어요."
        if commit
        else "시험 실행이라 롤백했어요. 지우려면 --commit을 붙여 다시 실행하세요."
    )


if __name__ == "__main__":
    main(sys.argv[1:])
