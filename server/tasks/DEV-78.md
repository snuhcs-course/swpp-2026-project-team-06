## DEV-78 카카오 전화번호 동의 항목(비즈 앱 심사) — 2단계

- 기준 기록: `tasks/DEV-78.md`(범위·결정·검증·배포 뒤 확인)
- 이 폴더: 코드 변경 없음. `app/accounts/spec.md` 결정 행만 현재 사실로(‘회원번호·이메일만’ → 전화번호도 받음). 고위험 경로(`server/app/accounts/**`)라 PR 위험 등급은 고위험.
- 확인만 함: `KakaoProfile.phone` ← `kakao_account.phone_number`, `_kakao_phone`(`+82 10-1234-5678` → `010-1234-5678`), 새 사용자는 가입 토큰 `phone`으로, 기존 회원은 빈 칸에만. 테스트 `tests/test_accounts.py::test_kakao_name_phone_prefill_only_empty_fields`.
