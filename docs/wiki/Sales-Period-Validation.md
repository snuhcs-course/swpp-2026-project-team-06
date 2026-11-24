# Validate sales periods and match historical-order locks

DEV-339 | Local implementation prepared for human review

Sales-period date inputs stack on narrow screens. Client validation checks valid dates, start/end ordering, overlaps and chronological earlybird pricing, and points to the affected period/date/option field as well as the footer. Payloads retain stage IDs and chronological order. Appending is disabled when no date remains before delivery; an earlybird can use a free front range. MyStage.hasOrders derives from all historical statuses including cancellations and matches server date/deletion guards without a database migration. Presale conflict reload warns about discarded input. Existing unified product editing is retained and regression-tested for DEV-338.

The source of truth is the related Korean feature specification and the issue-specific task file. Production deployment is a separate post-merge step.
