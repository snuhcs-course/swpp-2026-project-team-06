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
