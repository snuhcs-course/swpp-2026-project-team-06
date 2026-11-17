# Consumer recovery Figma synchronization — 17 November 2026

This record links design synchronization to the implemented consumer states. The user resumed the previously held Figma work after confirming access. The target is the existing [current consumer page, 108:1734](https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=108-1734).

The editing service cannot load Pretendard Variable. New state copies therefore use **Noto Sans KR**, an explicit fallback in `packages/ui/src/tokens.ts`. Font-bound component copies were detached where the service could not override their text; the resulting text and layout remain editable, with the existing design-system layout and token fills retained. Source screens and library originals were left untouched. These are editable design states, not raster replacements or a claim that every copy remains a live library instance.

Design readback and screenshot review establish the represented copy, layout and state annotations. They do not establish a new runtime test result, human acceptance, merge or deployment. Product behavior remains defined by `docs/spec/`; this synchronization introduces no behavior change.

## DEV-319 — Inquiry loading, failure and retry

- Linear: [DEV-319](https://linear.app/sswp6/issue/DEV-319); implementation: [PR #593 / DEV-318](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/593)
- Requirements: FEAT-33 / AC-33-5 / SCR-32; SCR-14 refresh recovery
- Design board: [708:3656 — 문의 조회와 재시도](https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=708-3656)
- Compared implementation: `d2386f363c739745d066a259ebe27a3506f5f7bc`

| Editable screen | Represented state and behavior |
| --- | --- |
| [708:3662 — SCR-32 first load](https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=708-3662) | `주문 불러오는 중…`; the send action is disabled until the required order information has loaded. The annotation distinguishes a pending lookup from an absent order. |
| [708:3814 — SCR-32 failed lookup](https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=708-3814) | `주문 정보를 불러오지 못했어요`; common LoadError title `불러오지 못했어요`, generic-error example `잠시 뒤 다시 시도해 주세요.`, and outline `다시 시도`. The selected inquiry type, entered body and uploaded-photo preview remain visible. `사진 삭제` remains available and the native file input is clear, matching the implemented uploader. Sending remains disabled. |
| [708:3972 — SCR-32 retry succeeds](https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=708-3972) | The same inquiry type, body and uploaded photo are retained; the order name and option/quantity/order reference return. `농가에 문의 보내기` becomes enabled once the owned paid order, nonblank body and completed upload satisfy the ordinary send conditions. The retry annotation explicitly preserves the draft during loading. |
| [708:4128 — SCR-14 refresh failure](https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=708-4128) | Existing order information remains below LoadError with `다시 시도`. This example uses the offline icon and timeout text `주문 내용을 불러오지 못했어요. 다시 시도해 주세요.` The annotation excludes 401/403/404 from retained private content and records the existing access-denied/order-list recovery paths. |

Implementation references: `apps/consumer/src/app/(tabs)/orders/[orderId]/inquiry.tsx`, `apps/consumer/src/app/(tabs)/orders/[orderId]/index.tsx`, `apps/consumer/src/lib/useOrderDetail.ts`, `apps/consumer/src/lib/views.tsx`, and `packages/ui/src/PrivatePhotos.tsx`.

Verification on 17 November: independent AI review compared the four rendered states with the Linear requirements and source. It identified and then verified corrections for the uploaded-photo preview/delete control, cleared file input, input text/surface colors and SCR-14 offline icon. Final screenshot `farmclub-dev319-final.png` was visually inspected; Figma metadata readback confirmed the board, all four screen IDs, 390 px screen widths, retained draft/photo nodes and the SCR-14 offline icon. The editing pass's final structural readback counted 437 nodes and 92 editable text nodes, all using Noto Sans KR; image nodes were the two 220 × 160 photo previews and a 64 × 64 product photo, with no full-screen image. The source Pretendard text remained unchanged. No consequential requirement mismatch remained in this design review. Human review and repository-documentation merge remain pending. No application tests were rerun for this design/documentation-only update.


## DEV-321 — Reservation-result recovery

- Linear: [DEV-321](https://linear.app/sswp6/issue/DEV-321); implementation: [PR #597 / DEV-320](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/597)
- Requirements: FEAT-08 / FEAT-09 / AC-09-3 / SCR-10
- Design board: [713:3656 — 예약 결과 복구](https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=713-3656)
- Compared implementation: d2386f363c739745d066a259ebe27a3506f5f7bc

| Editable screen | Represented state and behavior |
| --- | --- |
| [713:3662 — unresolved result](https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=713-3662) | Notice title `예약 결과를 확인해 주세요`; body `기존 요청의 결과를 확인한 뒤 다음 예약을 진행할 수 있어요. 바꾼 내용은 아직 저장되지 않았어요.` The enabled `예약 결과 확인하기` CTA remains available after quantity/note edits and unchecked consent. It resolves the original request before any new reservation. |
| [713:3835 — checking result](https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=713-3835) | The unresolved Notice is hidden while busy. The disabled action retains its invisible label width and shows a centered spinner, matching Button loading behavior. The edited draft remains visible. |
| [713:4002 — original reservation recovered](https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=713-4002) | Notice title `이미 만든 예약이 있어요`; body `예약 후 바꾼 내용은 저장되지 않았어요. 내용을 바꾸려면 기존 예약을 취소하고 다시 예약해 주세요.` The enabled `입금 안내 보기` opens the original reservation's product, order, option and quantity. The annotation distinguishes original quantity 1 from unsaved edited quantity 2. |

Existing normal checkout and price/stock-conflict frames were preserved. Screens expand the existing scroll content for inspection; the annotation identifies the action bar as fixed in the application. No additional checkout layout or product rule was introduced.

Implementation references: `apps/consumer/src/app/checkout/[productId]/index.tsx` and `packages/ui/src/Button.tsx`.

Verification on 17 November: structured readback found **458 native nodes and 118 editable text layers**, all using the documented Noto Sans KR fallback. The only image fills are three existing 64 × 64 product thumbnails. Independent AI review compared exact copy, draft/consent state, original-request identity, totals and CTA behavior against source. It inspected `farmclub-dev321-final.png` after the spinner was centered and found no actionable issue, clipping or overlap. Human review and documentation merge remain pending. No application tests were rerun for this design/documentation-only update.


## DEV-337 — Price freshness and reconfirmation

- Linear: [DEV-337](https://linear.app/sswp6/issue/DEV-337); implementation: [PR #649](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/649)
- Requirements: FEAT-07 / FEAT-08 / AC-05-5 / AC-08-8 / R-17
- Design board: [716:3656 — 가격 최신화와 재확인](https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=716-3656)
- Compared implementation: d2386f363c739745d066a259ebe27a3506f5f7bc

| Editable screen or annotation | Represented state and behavior |
| --- | --- |
| [716:3662 — different initial checkout price](https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=716-3662) | `가격이 바뀌었어요` with `25,000원 → 27,000원 · 아래 총 입금액을 확인해 주세요.` The authoritative unit price and total are 27,000 won; the normal action is `27,000원 예약하기`. This initial-load notice is informational and adds no second checkbox or confirmation stage. |
| [716:3835 — price changes after checkout opens](https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=716-3835) | `가격이 바뀌었어요` with `5kg 한 상자 25,000원 → 27,000원. 입력한 내용은 그대로 두었어요. 바뀐 금액으로 예약할지 확인해 주세요.` The current total is 27,000 won; `처음 본 합계` retains struck-through 25,000 won. Only `바뀐 금액으로 예약하기` resubmits after the first request was rejected before order creation. Recipient, note, quantity and consent remain. |
| [716:4013 — product refresh loading elements](https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=716-4013) | Disabled `예약하기` while the product refresh is pending. This is a labeled state-element panel, not a replacement product layout. |
| [716:4019 — product refresh failure elements](https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=716-4019) | Common LoadError / `다시 시도` and disabled `예약하기`. The annotation retains the previous product information and blocks reservation until a successful reload. |

The board points to [existing home 652:2](https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=652-2) and [product detail 658:2](https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=658-2). It records refetch on return without requiring browser refresh, preserves the reviewed checkout snapshot during address-screen trips, and avoids a redundant notice when the initial price already matches. Original normal, price and stock-conflict screens were not modified.

Implementation references: `apps/consumer/src/app/(tabs)/index.tsx`, `apps/consumer/src/app/(tabs)/products/[productId].tsx`, `apps/consumer/src/app/checkout/[productId]/index.tsx`, `apps/consumer/src/lib/useFocusedAsync.ts`, and `apps/consumer/src/lib/checkoutConflict.ts`.

Verification on 17 November: structured readback found **333 native nodes and 95 editable text layers**, all using the documented Noto Sans KR fallback. The only image fills are two existing 64 × 64 product thumbnails. Independent AI source/readback review confirmed exact copy, current and old totals, the explicit changed-price action and refresh guards. Visual inspection of `farmclub-dev337-review.png` found no clipping or overlap. All three boards together contain **1,228 native nodes and 305 editable text layers**, with no full-screen raster UI. The original source font remains Pretendard Variable. This follow-up changed no application code; the earlier runtime results remain separately recorded in the assigned-work audit. Human review, merge and deployment remain pending.
