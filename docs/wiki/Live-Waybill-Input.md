# Format waybill numbers while typing without moving the caret

DEV-343 | Local implementation prepared for human review

Producer waybill input applies carrier grouping during typing and paste. Digit-relative caret mapping supports middle edits, range replacement and Backspace/Delete beside a separator. Other-carrier and letter-containing values stay unchanged. Numeric values whose grouping would exceed the existing 50-character contract retain their digits without separators; the input allows formatting overhead during edits. The formatted value shown to the producer is saved for shipping and tracking corrections, and the consumer sees that same value. The API, privacy and tracking-link contracts remain unchanged.

The source of truth is the related Korean feature specification and the issue-specific task file. Production deployment is a separate post-merge step.
