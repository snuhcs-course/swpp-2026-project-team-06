# Customer engagement (DEV-465)

This change addresses feedback that customers need a stronger reason to choose a farm, follow it, and look forward to its news. It adds a first-follow welcome card with a persistent fan number, a transparent farm temperature, and five activity challenges. All use the current app typography, cream surfaces, rounded cards, and brand accent tokens.

The [implementation specification](../spec/customer-engagement.md) defines AC-ENG-1 through AC-ENG-6.

## Persistent welcome

The server issues a number only when a consumer actually follows. A separate receipt survives unfollowing; retrying or following again cannot generate additional numbers. Existing active follows are backfilled from real rows, sorted by creation time and consumer ID. Numbering represents records available at rollout, not reconstructed historical membership. The welcome is acknowledged before opening the farm introduction. Chat auto-follow keeps its existing chat destination.

## Transparent temperature

[Daangn’s official product case study](https://careers.daangn.com/blog/post/당근마켓-매너온도-해외시장-진출-1/) describes a 36.5°C starting temperature and 99°C maximum while keeping its exact formula private. Farmclub uses an original explicit formula, not a reproduction of that algorithm.

Temperature is stored/calculated as integer tenths: clamp(0,990,365+F+P+L+H+R-M). F is active unique followers (cap100); P is public nondeleted posts in the last28 days (one per KST day, three per Monday-start week); L is unique reacting customers in the last28 days (cap30); H is unique customers receiving a saved human producer response after a consumer message in the last28 days (cap30). R is one verified completed-order star rating per order (4–5:+1,3:0,1–2:-1). M is distinct moderator-confirmed report incidents; pending/rejected/overturned reports contribute zero. Every point is0.1°C; only the final sum is clamped, allowing exact reversals at bounds. Deleted consumers do not contribute F/L/H/R; deleted posts, refunded orders, and artificial client counters do not qualify. Confirmed moderator incidents remain after reporter deletion and are removed only by overturning/rejecting the decision. The displayed value is an engagement reference, not a quality guarantee.

## Verified challenges and supporting actions

The dashboard derives five statuses from the current user’s saved records: active first follow, existing news reaction, sent customer message, completed nonrefunded purchase, and verified purchase rating. Removing the last qualifying action removes completion. Opening a screen, clicking a task, reporting a deposit, or making an unconfirmed order never completes a purchase. There is no completion-write endpoint or local completion flag.

Star ratings require the consumer’s own completed nonrefunded order and strict integer1–5 validation. Farm reports persist as pending and need a separate administrator decision. Administrators can page through submitted reports and inspect their contents through the authenticated API; consumer identifiers are excluded. AI-answer verification requests are not abuse reports. Duplicate reports for the same confirmed incident produce one temperature penalty. Customer/report data are never exposed in the public temperature response.

## Validation

Automated pytest, mock-contract, type, migration and real-stack browser tests cover positive, negative, boundary, duplicate, account-isolation, reversal and failure behavior. The existing CI discovers the new suites; make test-engagement exposes the focused checks. Actual commands/results are recorded in the DEV-465 task files and PR. Human review is required; this task does not merge or deploy.

The existing administrator purge tool explicitly classifies the three new tables under its existing retention rules. It removes all consumers and orders, so receipts, reports and ratings are explicitly removed as customer-owned records. Its preview, backup and target-confirmation guards remain in place. No production cleanup is executed by this change.
