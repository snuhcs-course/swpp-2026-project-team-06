# Order Notifications

DEV-495 (FEAT-18, first phase) tells a farm about new orders outside the app. A producer QA on 11/27 found that farms did not know an order had arrived until they opened the app, while the 24-hour deposit deadline (R-28) was already running.

## What is sent
- **New order** (`ORDER_AWAITING_DEPOSIT`): when the buyer receives the bank-transfer instructions and the order becomes awaiting deposit. Farm name, product, quantity, depositor name, amount and deadline.
- **Deposit reported** (`DEPOSIT_REPORTED`): each time the buyer taps "I have paid" (a new signal after the producer declines and keeps the order waiting counts again). Product, quantity, depositor name and amount.

Messages are KakaoTalk Alimtalk (informational templates reviewed by Kakao), with the provider's SMS/LMS fallback when Alimtalk cannot be delivered. The provider is SOLAPI. Messages never include the recipient's name, address or phone number. Cancellations after payment, consumer notifications, app push and web push are out of scope for this phase.

## How it works
- The order request only writes a notification row (an outbox) in the same database transaction, inside a savepoint. If writing the row fails, the order still succeeds; the order request never calls the provider.
- A sender loop inside the API process (every 5 seconds, `FOR UPDATE SKIP LOCKED` with a 60-second lease, safe with several processes) sends due rows after commit. Right before sending it re-reads the order (skips if it was cancelled or confirmed, or the deposit signal changed), skips rows older than six hours, and re-checks the farm.
- Connection errors, timeouts, 5xx and 429 are retried after 1, 5 and 30 minutes, then marked failed; 4xx and provider rejections fail at once. A timeout retry can rarely deliver the same message twice; the PM chose this over missing it.
- Rows are skipped (with a reason) for seed test-account farms, farms that are not approved or have notifications turned off, contact numbers that are not mobile numbers, and over the limits (30 per farm per hour, 1,000 per day overall). Test accounts are checked both when the row is written and right before sending.
- `NOTIFY_PROVIDER=none` is the default (local, CI, tests and production until the provider account is ready): nothing is sent and rows are recorded as skipped. Tests never open a network connection; the SOLAPI client takes an injected `httpx` transport and tests use `MockTransport` only.

## Privacy and operations
- Logs and the admin API show only notification and order ids, event, status, provider status code and the last four digits of the number (`●●●●1234`) — never the full number, template variables, request bodies or API keys.
- Operators use `GET /admin/notifications?orderId=&status=` and `POST /admin/notifications/{id}/retry` (failed rows only, idempotency key, audit record).
- The privacy-policy update (provider as a processor) follows in a separate pull request once the provider's legal name is confirmed.
