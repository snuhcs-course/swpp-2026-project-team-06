# UAT Cycle 2 Quick Fixes

DEV-454 makes server-reported checkout price/period/weight changes explicit in a modal. Dismissal preserves the form without creating an order; reopening the modal is distinct from explicitly reserving at the new price. Existing server revalidation, unresolved-deposit recovery, sold-out handling and informational entry-price notices remain in force.

Automatically forwarded consumer questions expose the existing open reply request as a compact action attached beneath the original message bubble for the producer. Tapping that request quotes the original question and focuses the composer while preserving the draft. Sending that quoted reply closes only its associated request; failure preserves the request, quote and draft. Explicit AI answer checks retain their existing confirmation/correction flow. News-room and order-list redesigns are separate work.

If the latest product read fails after a conflict, the modal hides the unverified total and disables confirmation. A compact retry action refreshes the product without submitting an order.

Jinwoo reviewed the actual local before/after screens and approved merging DEV-454 on 2026-11-24 (Human 0.5h). Producer order undo remains separate in DEV-455. Production verification is recorded after deployment.
