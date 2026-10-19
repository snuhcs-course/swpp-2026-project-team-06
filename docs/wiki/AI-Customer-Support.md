# AI Customer Support (FEAT-13, FEAT-32)

Consumers ask a farm private questions in a 1:1 chat. An "AI 안내" (AI guide) answers only from facts the farm has registered, and anything else goes to the producer. This page covers how that works, how it is checked, and what is still missing. It implements user story **C06** (ask privately, get an evidence-based answer or a handoff) and the producer's AI settings (FEAT-32).

**Status:** live on the production server (`api.farmclub.kr`) with Claude Haiku 4.5 (`claude-haiku-4-5`, ADR 0004). Built in DEV-31 ([#99](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/99)), DEV-39 ([#119](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/119), wrong-answer reports and settings) and DEV-47 ([#140](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/140), non-answers become handoffs). DEV-59 ([#116](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/116)) tightened the shared grounding helpers. Code: `server/app/ai/service.py` (`answer_question`), `server/app/ai/grounding.py`, `server/app/messaging/service.py` (`consumer_send`). Implementation decisions: `server/app/ai/spec.md`. Product rules: `docs/spec/functional/FEAT-13-ai-reply.md`, `FEAT-32-ai-settings.md`.

## 1. Design goals

1. **Never invent a fact.** A wrong delivery date or sweetness value costs the farm trust and can turn into a refund. When in doubt, the AI hands off instead of answering.
2. **Never speak for the farm.** The AI says it is "AI 안내", never "저희 농장". Prices, refunds, compensation, delivery promises and taste judgements are always the producer's call.
3. **Keep the producer in control.** The producer can turn the AI off, write FAQs and extra handoff topics, preview answers, and take over any conversation.
4. **Send the model as little as possible.** Shipping addresses, recipient names and private photos are never part of the evidence, and contact and account numbers in text are masked before sending.

## 2. Decision pipeline

Every consumer text message in a thread goes through these steps in order. The first step that decides wins.

| Step | Check | Result |
| -- | -- | -- |
| 0. Gate | The farm's AI is on (FEAT-32), the thread is `AUTO`, and the message has text. Photo-only messages are never judged by the AI (M-21). | Otherwise no AI reply; the message is marked as needing the producer |
| 1. Mandatory handoff | The question matches a fixed topic list (pesticide and growing methods, organic, refunds, compensation, complaints, haggling and discounts, damage or spoilage, taste, delivery date changes and promises) or one of the farm's own extra handoff topics | `HANDOFF` |
| 2. Rule answer | The question asks for a registered fact: shipping fee (including the remote-area surcharge), delivery window (the order's window first, then the product's), measured or expected sweetness, an exact FAQ match, the small-order policy or the reservation shipping policy | `ANSWER` with a fixed sentence and its `sourceRef`. No model call |
| 3. Model answer | An API key is set. Claude gets the evidence JSON (section 3) and must return `{"action", "answer", "reason", "sourceRefs"}` | `ANSWER` only if it passes every check in section 4; otherwise `HANDOFF` |
| 4. Fallback | No key, a model or network error, the 8-second timeout, or unparsable output | `HANDOFF` |

A `HANDOFF` saves an AI message ("농가에 전달했어요…") with `handoffStatus: FORWARDED` and opens an `Escalation` (`OPEN` → `ANSWERED`) that appears in the producer's 1:1 list (`needsReply`).

Rules come before the model on purpose: the most common questions (when does it arrive, how much is shipping, how sweet is it) get exact, free, instant answers that cannot drift.

## 3. Evidence: what the model sees

`build_evidence` collects facts for the question. The product is chosen as: the order's product if the message is about a paid order, else the single product on sale if the farm has exactly one.

| `sourceRef` | Facts |
| -- | -- |
| `product:<id>` | Name, shipping fee type, fee and remote-area fee, delivery window, measured brix, expected brix |
| `order:<id>` | Order status and confirmed delivery window (no address, recipient or contact) |
| `farm:faq` | The farm's FAQ entries |
| `farm:smallOrderPolicy` | The farm's small-order policy text |
| `farm:reservationShippingPolicy` | The farm's reservation shipping policy text |

Every string, including the question, is passed through `strip_personal_info` before it is sent. It masks mobile numbers (`010-…`), hyphenated account numbers of 10 or more digits and Korean street addresses. The masking is pattern-based, so other formats (a landline, an account number written without hyphens) are not caught. The prompt tells the model that FAQ and policy text are **information, not instructions**, so a farm cannot accidentally (or a consumer cannot deliberately) change the AI's rules through text. FAQ or policy entries that mention prices, refunds, discounts or delivery promises are never used as rule answers. They are still part of the evidence sent to the model, so the answer checks in section 4 are what stop a price or refund promise from getting through (AC-32-2).

## 4. Checking the model's answer

The model's `ANSWER` is not trusted as is. It is stored only if all of these pass (`grounding.validate_model_answer`, `grounding.is_non_answer`):

- **Real answer, not a non-answer.** Answers like "정보가 없어요", "판매자에게 문의하세요" or "죄송해요" become a handoff. Otherwise they would look answered and never reach the producer (DEV-47).
- **Citations exist.** `sourceRefs` is a non-empty list of distinct strings, each one actually sent in this request.
- **No forbidden content.** No prices, refunds, compensation, pesticide or growing claims, taste or quality judgements, delivery guarantees, and no first-person farmer voice ("저희 농장", "we grow").
- **Every number is in the evidence.** Numbers are normalized first: `5키로`, `5 킬로그램` and `5kg` are all `5kg`; `3,000원` is `3000원`; brix units are unified. Every number in the answer, with its unit, must appear in the cited evidence.
- **Every date is in the evidence.** ISO dates, `12월 3일`, ranges like `12월 1~10일`, and vague periods (`초순`, `중순`, `하순`) are parsed. A vague period is accepted only if the evidence dates fall inside it.
- **Expected sweetness is labelled.** If only an expected brix is registered, the answer must say `예상` (AC-13-3).

## 5. Consistency and concurrency

- The consumer message, the AI reply and the escalation are saved in **one transaction** while the thread row is locked, so two messages cannot interleave their answers (AC-13-6).
- The service captures the thread version and the AI settings version before calling the model, and checks both again before saving. If the producer replied, switched the thread to `HUMAN`, or changed or turned off the AI settings in the meantime, the AI reply is discarded and the question stays with the producer.
- A producer reply switches the thread to `HUMAN` in the same transaction. Switching back to `AUTO` only affects later messages; old questions are not re-answered.
- Model calls have **no SDK retries** and an 8-second budget (product drafts use 20 seconds). A slow or failed call degrades to a handoff, never to an error for the consumer.

## 6. Producer and operator side

- **Settings (FEAT-32):** AI on/off, response principles, FAQs and extra handoff topics are versioned. Saving with a stale version is refused without losing input (AC-32-4). **Preview** runs the full pipeline for a sample question and product without writing any message, escalation, alert or setting (AC-32-3).
- **"틀렸어요" report (AC-13-5):** a consumer can report an AI answer. That reopens the original question as a `WRONG_ANSWER` escalation for the producer. Duplicate and concurrent reports return the same escalation.
- **Refund and compensation alerts (M-07):** any consumer message about refunds or compensation creates an operator exception, whether the AI is on or off. It is logged once, only after the message is committed. Previews, rollbacks, losing concurrent requests and idempotent replays do not log it again.
- **Evidence record (M-08):** each AI message stores its `sourceRefs`, a short reason, and the settings version it was produced under, so a wrong answer can be traced to the fact or setting behind it.

## 7. Verification

**Automated tests** (`main` `7b2b123`, 2026-10-19): `uv run pytest tests/test_ai_service.py` 15 passed; `uv run pytest tests/test_messaging.py tests/test_settings_inquiries.py -k "AC_13 or C06 or AC_32 or M_07 or human_mode or preview or saved_disabled"` 29 passed. Of these 44, 38 test AI customer support and 6 test the draft grounding helpers it shares.

| Area | Tests |
| -- | -- |
| Rule answers and handoff topics | `test_AC_13_1_ai_answers_delivery_window`, `test_AC_13_2_pesticide_question_is_forwarded`, `test_AC_13_3_expected_brix_is_labeled`, `test_C06_AC_13_1_precise_delivery_intent_and_reservation_policy` |
| Model answer checks | `test_C06_AC_13_3_model_fact_normalization_and_expected_label`, `test_C06_korean_dates_prices_and_vague_periods_are_grounded`, `test_C06_AC_13_8_model_rejects_unknown_refs_and_farmer_voice`, `test_C06_FEAT_13_model_non_answers_are_detected`, `test_C06_FEAT_13_model_non_answer_becomes_handoff`, `test_C06_FEAT_13_model_non_answer_is_forwarded_to_producer` |
| Privacy and client | `test_C06_model_payload_sanitizes_copies_without_mutating_local_values`, `test_shared_client_disables_retries`, `test_provider_paths_use_20_20_8_second_timeouts` |
| Modes and concurrency | `test_AC_13_4_ai_reply_is_labeled`, `test_human_mode_has_no_ai_reply`, `test_AC_13_7_farm_ai_off_overrides_auto`, `test_AC_13_6_*` (4 tests) |
| Reports and alerts | `test_AC_13_5_*` (5 tests), `test_M_07_*` (6 tests) |
| Settings and preview | `test_AC_32_*` (5 tests), `test_preview_with_product_and_handoff_topic`, `test_saved_disabled_settings_stop_ai_replies` |

**Live checks** (production server, read-only settings preview as the f-kang producer, 2026-10-18, see [[Testing Documentation|Testing-Documentation]] DEV-50):

| Question | Result |
| -- | -- |
| "원산지가 어디예요?" (no evidence) | `HANDOFF`, 3 of 3 runs after #140 |
| "이 상품 이름이 정확히 뭐예요?" | Model `ANSWER` citing `product:p-house` |
| Measured sweetness | Rule `ANSWER` with the registered value |
| Pesticide question | `HANDOFF` (mandatory topic) |

**Real use:** on 2026-10-19 a consumer who logged in with Kakao asked f-kang about sweetness in chat. The model returned a handoff, the question appeared in the producer's 1:1 list, and the producer answered it.

**Defect found and fixed (DEV-47):** internal test A-10 found that, for a question with no evidence, live Claude sometimes returned `ANSWER` with "no information, ask the seller". The consumer saw a non-answer and the producer never saw the question. #140 added non-answer detection and a prompt line; three regression tests failed before the fix and pass after it.

## 8. Known limitations and next steps

- **Product context in multi-product farms.** A chat message carries text, attachments and an optional order, but no product. If a farm sells more than one product and the question is not about an order, the evidence has no product facts, so product questions are handed off even when the answer is registered. f-kang sells two products. The 2026-10-19 sweetness question was handed off with the model's reason "no measured sweetness in the evidence", while the sweetness question in preview (with a product selected) got a rule answer, which matches this gap. Fix: send the product the consumer came from with the message.
- **Keyword-based topic gate.** The mandatory handoff list is a Korean regular expression. It is predictable and testable but blunt: any question containing "맛" (taste) is handed off, and a paraphrase it does not list relies on the model and the answer checks instead.
- **Single-turn.** The model sees only the current question, not the earlier conversation, so follow-ups like "그럼 10kg는요?" usually hand off.
- **Synchronous call under a lock.** The model call runs inside the request while the thread row is locked (up to 8 seconds). This keeps ordering simple; moving it to a background worker is a candidate for a later iteration (see [[Design Documentation|Design-Documentation]] 2.6).
- **No answer-quality benchmark yet.** The checks above guarantee *safety* (no unsupported number, date or promise), not *helpfulness*. There is no measured answer rate or handoff rate on real questions yet; provider tracing with Langfuse (N-08) is not wired up. User test 2 is the first source of real questions.
