# DEV-367 login comparison

These images use local production web exports and fully intercepted, synthetic API fixtures. They are not screenshots of production data or additional human UAT results.

- Before: main a20b817f1bd3e3cbde6af91c99d6d8fcd651687f, real-API export, Kakao enabled, old evaluator build flag and query enabled.
- After: DEV-367 working changes, the same export/fixture with the retired query and stored evaluator marks. Seed-list requests were zero in both apps; ID/password and Kakao remain visible.
- farmclub-dev367-comparison.png puts consumer before/after and producer before/after side by side. Individual images retain their original 390px viewport width.

Shown to the requester before the implementation commit. Figma synchronization is tracked separately as DEV-368. This UI change does not disable the server test-login endpoints or revoke sessions; the human-operated MOCK_LOGIN_ENABLED setting remains the server guard.
