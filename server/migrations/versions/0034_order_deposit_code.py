"""Short deposit code (depositor name) on orders, backfilled for awaiting orders, and the origin of
thread order contexts (DEV-342)."""

import random
import re

import sqlalchemy as sa
from alembic import op

revision = "0034"
down_revision = "0033"
branch_labels = depends_on = None

# Same rule as app/orders/deposit_code.py at the time of writing (kept here so later code changes
# do not change what this migration does): the first 3 Hangul/Latin letters of the masked public
# name the farm already sees (nickname, else the first letter of the name; never the raw account
# name or the recipient name), else '주문'; 2 digits, then 3 digits when all 100 are taken;
# unique (ignoring letter case) among one farm's AWAITING_DEPOSIT orders.
_NOT_NAME = re.compile(r"[^가-힣A-Za-z]")


def _name(public_name):
    return _NOT_NAME.sub("", public_name or "")[:3] or "주문"


def _public_name(nickname, name, deleted):
    """Same as accounts.public_name at the time of writing."""
    if deleted:
        return "탈퇴한 회원"
    if nickname:
        return nickname
    return f"{(name or '고')[:1]}○○"


def _pick(name, taken, rng):
    used = {c.upper() for c in taken}  # case-insensitive, like the admin lookup
    for digits in (2, 3):
        free = [c for n in range(10**digits) if (c := f"{name}{n:0{digits}d}").upper() not in used]
        if free:
            return rng.choice(free)
    return None


def upgrade():
    op.add_column("orders", sa.Column("deposit_code", sa.String(16), nullable=True))
    op.create_index(op.f("ix_orders_deposit_code"), "orders", ["deposit_code"], unique=False)
    # CONSUMER: the consumer's paid-order entry (a linked order). PRODUCER: a producer's '채팅하기'
    # (visibility only). Existing rows were all consumer entries.
    op.add_column(
        "thread_order_contexts",
        sa.Column("source", sa.String(16), nullable=False, server_default="CONSUMER"),
    )
    _backfill(op.get_bind())


def _backfill(bind):
    """Backfill only AWAITING_DEPOSIT orders whose buyer has not reported paying yet: those are
    the ones a buyer may still be paying. A buyer who already reported a transfer used the old
    instructions (the order number), so those keep NULL like every other state and the apps show
    the order number."""
    rows = bind.execute(
        sa.text(
            "select o.id, p.farm_id, u.nickname, u.name, u.deleted_at "
            "from orders o join products p on p.id = o.product_id "
            "join users u on u.id = o.consumer_id "
            "where o.status = 'AWAITING_DEPOSIT' and o.deposit_code is null "
            "and o.deposit_reported_at is null "
            "order by o.created_at, o.id"
        )
    ).all()
    taken: dict[str, set[str]] = {}
    for order_id, farm_id, nickname, account_name, deleted_at in rows:
        codes = taken.setdefault(farm_id, set())
        # Seeded by order id: re-running on the same data gives the same codes
        public = _public_name(nickname, account_name, deleted_at is not None)
        code = _pick(_name(public), codes, random.Random(order_id))
        if code is None:
            # All 1,100 codes used for one name on one farm: the apps show the order number
            continue
        codes.add(code)
        bind.execute(
            sa.text("update orders set deposit_code = :code where id = :id"),
            {"code": code, "id": order_id},
        )


def downgrade():
    op.drop_column("thread_order_contexts", "source")
    op.drop_index(op.f("ix_orders_deposit_code"), table_name="orders")
    op.drop_column("orders", "deposit_code")
