# Testing Documentation

## Changes in this iteration

- I1: wrote 50 acceptance criteria (Given / When / Then) for all 17 P0 features. They are listed in section 3. No tests have run yet.
- I1 (P22): now 62 criteria. Added AC-01-4–5 (mock login), AC-06-4–5 (home), AC-09-3 (idempotency), AC-12-4–5 (chat), AC-15-3–5 (likes), AC-17-4–5 (shipping). AC-13-5 and AC-17-1 are deferred to I2.
- I1 (SWPP-81): now 64 criteria, one retired. Consumer and producer accounts are separate (ADR 0010): AC-01-2 is retired and AC-01-6–7 are added. AC-06-5 and AC-17-2 follow screen spec 1.1. 61 criteria are tested in I1.

## 1. Testing Plan and Results (Iteration 2~)

## 2. AI Module Testing (Iteration 3~)

## 3. Acceptance Testing (Iteration 4)

Each criterion has an ID `AC-<feature>-<n>`. Test names include the AC ID (for example `test_AC_09_1_last_item_concurrent_payment`). Screen IDs (SCR-xx) refer to the sitemap in Design Documentation.

### FEAT-01 Sign-up and login

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-01-1 | A logged-out user is on a product detail page | They tap "Reserve" and log in with a test account | Checkout (SCR-10) opens |
| ~~AC-01-2~~ | ~~A test account is logged in to the consumer app~~ | ~~The same account logs in to the producer app~~ | ~~They log in as the same user, with no new account~~ — retired (SWPP-81, ADR 0010); replaced by AC-01-6 |
| AC-01-3 | A producer is not yet approved | They open SCR-22–30 or call a producer API | They are sent to SCR-21 and the API refuses the call |
| AC-01-4 | Mock login is on | The test-login API is called with a user ID that is not a seeded test account | It is refused and no account is created |
| AC-01-5 | Mock login is off | The test-account list or test-login API is called | Both are refused |
| AC-01-6 | There is a consumer account token and a producer account token | The producer login (SCR-19) account list is opened, a producer API is called with the consumer token, or a consumer API (for example creating an order) is called with the producer token | The producer list shows only producer accounts, and both calls are refused with 403 `WRONG_APP` |
| AC-01-7 | A consumer is logged in to the consumer app | They tap "Start as a farm" in My info | A notice says the producer app needs its own sign-up, then the producer app sign-up opens; no producer role is added to the consumer account |

### FEAT-02 Farm profile

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-02-1 | An approved producer | Changes the farm name and saves | SCR-02 and SCR-03 show the new name |
| AC-02-2 | The farm name is empty | The producer taps Save | Nothing is saved and the empty field is marked |

### FEAT-03 AI product draft

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-03-1 | The text has no sweetness or delivery time | A draft is made | Those two fields stay empty and are marked as blanks |
| AC-03-2 | The text contains "5kg 25,000 won" | A draft is made | The price is not filled in |
| AC-03-3 | The AI call fails | The producer taps "Make draft" | An empty edit screen opens for manual input |

### FEAT-04 Product edit and publishing request

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-04-1 | The delivery window is empty | The producer tries to request publishing | The button is disabled and the missing fields are shown |
| AC-04-2 | A product is pending approval or rejected | A consumer looks for it in the consumer app | It is not visible |
| AC-04-3 | A product is pending approval | The operator approves it through the admin API | It becomes "on sale" and appears on SCR-03 |
| AC-04-4 | A product is on sale | The producer changes the price and saves | Consumers still see the old price until it is approved again |

### FEAT-05 Stage, price, and quantity setup

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-05-1 | Stage 2 for 5 kg is 25,000 won | The producer enters 27,000 won for stage 1 5 kg and saves | Nothing is saved and the reason is shown |
| AC-05-2 | Stage 1 runs Oct 7–20 | The producer sets stage 2 to start Oct 15 | The periods overlap, so nothing is saved |
| AC-05-3 | The producer picks a default | The screen opens | Number of stages, periods, and discount size are filled in |

### FEAT-06 Farm search and follow

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-06-1 | Farm A's stage ends tomorrow and farm B's ends next week | The farm list opens | A is shown above B |
| AC-06-2 | A farm has Hallabong as a variety | The user searches "Hallabong" | Only that farm appears |
| AC-06-3 | A logged-in consumer | Follows a farm | The farm appears in My info, and its news appears in the News tab |
| AC-06-4 | Product A's stage ends tomorrow and product B's ends next week, both on sale | Home opens | A is shown before B in the recommended products |
| AC-06-5 | No product is on sale | Home opens | "No products open for reservation" is shown, and the farm cards (browse farms) still show |

### FEAT-07 Product detail

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-07-1 | The current stage has 0 left | The product detail opens | "Sold out" and the next stage's start date are shown, and "Reserve" cannot be tapped |
| AC-07-2 | A measured sweetness is registered | The product detail opens | The measured value is shown instead of the expected value |

### FEAT-08 Reservation order

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-08-1 | One of the four consent boxes is not checked | The consumer taps "Pay" | They cannot move on |
| AC-08-2 | The maximum quantity per order is 3 | The consumer picks a quantity | 4 or more cannot be chosen |
| AC-08-3 | The product has a separate shipping fee | Checkout opens | Product amount, shipping fee, and total are shown separately |
| AC-08-4 | The delivery address is in a remote area set by the producer | The address is entered | The extra shipping fee is added to the total |
| AC-08-5 | The consumer saved a delivery address in My info | Checkout opens | Recipient, phone number, and address are filled in and can be edited |

### FEAT-09 Card payment (mock)

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-09-1 | Only 1 unit is left | Two people pay at the same time | Only one succeeds; the other gets a sold-out notice |
| AC-09-2 | An order is pending payment | The consumer picks "fail" | The remaining quantity does not drop and they return to checkout |
| AC-09-3 | A payment request was sent | It is sent again with the same idempotency key | Payment and stage quantity change happen only once, with the same result |

### FEAT-10 Order history and detail

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-10-1 | An order's delivery window has changed | Order history opens | That order is at the top and stays there until the consumer accepts or takes a refund |
| AC-10-2 | 8 days have passed since delivery | The consumer has not confirmed the purchase | The purchase is confirmed automatically |
| AC-10-3 | An order was refunded because the farm was suspended | The order detail opens | The refund reason is shown |

### FEAT-11 Cancel before shipping

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-11-1 | An order is reserved | The consumer cancels | It is fully refunded and that stage's remaining quantity goes up |
| AC-11-2 | An order has shipped | The order detail opens | There is no cancel button |

### FEAT-12 1:N news and 1:1 chat

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-12-1 | Consumer A asked a farm in chat | Consumer B opens the same farm chat or calls the API | A's reply does not appear anywhere |
| AC-12-2 | The message body has "Call me at 010-1234-5678" | It is sent | The number is masked when stored and shown |
| AC-12-3 | A news post is marked public | It is posted | It appears in followers' News tab and in the farm page news tab |
| AC-12-4 | A logged-in consumer does not follow a farm | They tap "Chat" | They see "Follow and start chatting", the farm is followed, and the chat opens |
| AC-12-5 | A followed farm posted news | The Chat tab and that farm's chat open | The news is not shown; only 1:1 Q&A is |

### FEAT-13 AI reply, forwarding, and producer answer

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-13-1 | The product has a delivery window | A consumer replies "When will it ship?" | The AI answer gives that window |
| AC-13-2 | Even if the product description mentions growing methods | A consumer replies "How much pesticide do you use?" | AI does not answer and the question goes to the question inbox |
| AC-13-3 | Only expected sweetness is registered | A consumer replies "How sweet is it?" | AI answers and says it is an expected value |
| AC-13-4 | AI sent an answer | The conversation opens | The answer has an "AI answer" label |
| AC-13-5 (I2) | AI answered "ships in mid-January" | The consumer taps "This is wrong" | The question appears in the farm's question inbox (SCR-28), marked as a wrong answer |

### FEAT-14 Producer dashboard

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-14-1 | The producer is viewing the dashboard | A new order is paid | On reopening, that stage's reservation count is up and remaining quantity is down |
| AC-14-2 | An order has been delivered | The producer views it on the dashboard | Address and phone number are hidden |

### FEAT-15 Farm news and likes

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-15-1 | A message was sent as private | The news tab opens | That message is not shown |
| AC-15-2 | The user is logged out | The news tab opens | Public news is shown |
| AC-15-3 | A logged-in consumer sees a post with 3 likes | They tap Like, then tap it again | First 4 with their like shown, then back to 3 |
| AC-15-4 | A logged-out user sees a public post | They tap Like and log in | They return to that post and the like is applied |
| AC-15-5 | A followers-only post from a farm the user does not follow | The like API is called | It is refused and the count does not change |

### FEAT-17 Shipping

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-17-1 (I2) | AI found an order and asked for confirmation | Before the producer taps confirm | No order changes state |
| AC-17-2 | An order is preparing shipment | The producer taps confirm | The consumer's order detail shows "In delivery" (state `SHIPPED`) and the cancel button disappears |
| AC-17-3 | A product has 3 reserved orders | The producer taps "Start harvest" | All 3 become "preparing shipment", and consumers can still cancel |
| AC-17-4 | An order has shipped | The producer sends a request to mark it delivered | It is refused and the order stays shipped |
| AC-17-5 | Tracking number "123-456" is entered on a preparing order | It is marked shipped | The ship date and tracking number are saved and shown on the consumer's order detail |

### FEAT-19 Farm link sharing

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-19-1 | A link to an approved farm | It is opened in a logged-out browser | That farm page shows right away |
| AC-19-2 | A link to a farm whose approval was revoked | It is opened | A "farm not found" notice is shown, then the farm list |
| AC-19-3 | A share link to an approved farm | It is pasted into a KakaoTalk chat | A preview with the farm name and main photo is shown |

## 4. Alpha and Beta Testing (Iteration 5)

Source of truth: `docs/spec/functional/` (Korean).
