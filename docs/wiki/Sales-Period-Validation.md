# Validate sales periods and match historical-order locks

DEV-339 | Local implementation prepared for human review

Sales-period dates are edited from a date box in each period card title that opens the calendar sheet (DEV-486; previously stacked start/end inputs). Client validation checks valid dates, start/end ordering, overlaps and chronological earlybird pricing, and points to the affected period/date/option field as well as the footer. Payloads retain stage IDs and chronological order. Appending is not disabled when no date remains before delivery: pressing it shows a toast explaining why (DEV-486), and validation errors also appear as a toast with the field highlighted; an earlybird can use a free front range. MyStage.hasOrders derives from all historical statuses including cancellations and matches server date/deletion guards without a database migration. Presale conflict reload warns about discarded input. Existing unified product editing is retained and regression-tested for DEV-338.

The source of truth is the related Korean feature specification and the issue-specific task file. Production deployment is a separate post-merge step.
