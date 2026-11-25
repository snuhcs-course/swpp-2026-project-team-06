# Engagement implementation — DEV-465

Source: docs/spec/customer-engagement.md, AC-ENG-1~6; extends FEAT-06/12/15.

- Durable FollowReceipt is assigned under Farm FOR UPDATE, with pair PK and per-farm ordinal uniqueness. Active Follow rows remain the only follow-score evidence; deletion does not remove the receipt.
- Temperature uses seven bounded aggregate/day queries and integer tenths, with final clamp only. Posting has at most29 unique KST days within the inclusive28-day window. F/L/H/R customer signals join nondeleted CONSUMER users; confirmed M is administrator evidence and survives reporter deletion. Human replies use persisted seq, excluding AI/OPERATOR.
- CustomerReview is an order-keyed upsert under the same Order row lock used by refunds. Eligibility is reevaluated for reads; old reviews cease contributing after invalidation/refund.
- FarmReport submission serializes on Farm, unique consumer/farm; pending submissions have no temperature effect. ADMIN-only moderation stores reviewer/timestamp and groups confirmed incidents by key.
- Temperature and report farm lookups use farms.public_farm_clause with the current viewer (R-29); hidden test farms return the same 404 as missing farms. Report lookups retain FOR UPDATE with populate_existing so serialization uses fresh Farm state.
- Achievements have no persistence table or write route: EXISTS over current authoritative evidence per authenticated consumer. JSON progress is always0/1, with five fixed task ids.

- ADMIN GET /engagement/reports uses the existing20/default50/max page limit and validated offset cursor, returning reasons only to admins. No consumer identifier appears in this queue response. Moderation changes appear on the next temperature read.
- Achievement action routes use current IA: /farms, /chats?view=news, /chats, /orders.
