# Customer engagement (DEV-465)

This change addresses feedback that customers need a stronger reason to choose a farm, follow it, and look forward to its news. It adds a first-follow welcome card with a persistent fan number, a transparent farm temperature, and five activity challenges. All use the current app typography, cream surfaces, rounded cards, and brand accent tokens.

The [implementation specification](../spec/customer-engagement.md) defines AC-ENG-1 through AC-ENG-6.

## Approved presentation

The user approved the redesigned app screenshots on November 25, 2026. The screens retain the existing Figma consumer design language: Pretendard, white and neutral surfaces, burnt-orange tokens, 16px corners and gutters. The welcome pairs the existing bowing citrus illustration with a personalized greeting and a distinct card for the farm name and real guest number. Only that number uses a larger 44px display; body, supporting and metadata text retain the existing hierarchy. Decorative artwork is hidden from screen readers, and small accent text uses the darker existing accent token.

The challenge summary, titled “나의 작은 발자국,” presents the server's completed count and five independent activity stamps. They are not a required sequence. Compact rows retain each activity's icon after completion, add a check badge and explicit status text, and make incomplete rows actionable through the existing destinations. Their accessible names include the title, status, description and action. The reversible-completion explanation remains below the list. This redesign changes presentation while preserving first-success-only welcomes, persistent numbering, session isolation and server-derived completion. The approved [welcome](https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=787-4021) and [challenge board](https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=787-3820) are synced to the existing Figma consumer page with native text and reusable instances. The layout, copy, assets and displayed activity state were compared with the app; the 320px layout was checked in the app. Pretendard names remain intact, but the current Figma environment flags the font as missing, so text editing requires font access. PR #814 records validation evidence; pixel-identical rendering is not asserted.

## Persistent welcome

The server issues a number only when a consumer actually follows. A separate receipt survives unfollowing; retrying or following again cannot generate additional numbers. Existing active follows are backfilled from real rows, sorted by creation time and consumer ID. Numbering represents records available at rollout, not reconstructed historical membership. The welcome is acknowledged before opening the farm introduction. Chat auto-follow keeps its existing chat destination.

## Transparent temperature

[Daangn’s official product case study](https://careers.daangn.com/blog/post/당근마켓-매너온도-해외시장-진출-1/) describes a 36.5°C starting temperature and 99°C maximum while keeping its exact formula private. Farmclub uses an original explicit formula, not a reproduction of that algorithm.

Temperature is stored/calculated as integer tenths: clamp(0,990,365+F+P+L+H+R-M). F is active unique followers (cap100); P is public nondeleted posts in the last28 days (one per KST day, three per Monday-start week); L is unique reacting customers in the last28 days (cap30); H is unique customers receiving a saved human producer response after a consumer message in the last28 days (cap30). R is one verified completed-order star rating per order (4–5:+1,3:0,1–2:-1). M is distinct moderator-confirmed report incidents; pending/rejected/overturned reports contribute zero. Every point is0.1°C; only the final sum is clamped, allowing exact reversals at bounds. Deleted consumers do not contribute F/L/H/R; deleted posts, refunded orders, and artificial client counters do not qualify. Confirmed moderator incidents remain after reporter deletion and are removed only by overturning/rejecting the decision. The displayed value is an engagement reference, not a quality guarantee.

## Verified challenges and supporting actions

Temperature reads and report submissions use the same viewer-specific farm visibility rule as farm detail (R-29). Anonymous and regular accounts receive the same 404 for hidden test farms and nonexistent farms; test accounts retain access. Denied reports create no records. The introduction refreshes its temperature from the server after a successful follow/unfollow and when the account changes.

The dashboard derives five statuses from the current user’s saved records: active first follow, existing news reaction, sent customer message, completed nonrefunded purchase, and verified purchase rating. Removing the last qualifying action removes completion. Opening a screen, clicking a task, reporting a deposit, or making an unconfirmed order never completes a purchase. There is no completion-write endpoint or local completion flag.

Star ratings require the consumer’s own completed nonrefunded order and strict integer1–5 validation. Farm reports persist as pending and need a separate administrator decision. Administrators can page through submitted reports and inspect their contents through the authenticated API; consumer identifiers are excluded. AI-answer verification requests are not abuse reports. Duplicate reports for the same confirmed incident produce one temperature penalty. Customer/report data are never exposed in the public temperature response.

## Validation

Automated pytest, mock-contract, type, migration and real-stack browser tests cover positive, negative, boundary, duplicate, account-isolation, reversal and failure behavior. The existing CI discovers the new suites; make test-engagement exposes the focused checks. Actual commands/results are recorded in the DEV-465 task files and PR. Human review is required; this task does not merge or deploy.

The existing administrator purge tool explicitly classifies the three new tables under its existing retention rules. It removes all consumers and orders, so receipts, reports and ratings are explicitly removed as customer-owned records. Its preview, backup and target-confirmation guards remain in place. No production cleanup is executed by this change.
