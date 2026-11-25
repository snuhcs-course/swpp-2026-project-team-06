# Recover failed sales-page saves while retaining product input

DEV-332 | Local implementation prepared for human review

A failed sales-page save retains the local draft and exposes a compact text recovery action beside the existing error row. A standard two-action confirmation explains the discard boundary. Only after all latest-source reads succeed are unsaved sales-page text, photo additions and content selections reset. Product name, origin, storage and sales terms remain in the parent editor and can still be saved. Cancel or failed refresh retains local edits and supports retry.

The source of truth is the related Korean feature specification and the issue-specific task file. Production deployment is a separate post-merge step.
