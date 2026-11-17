## DEV-78 카카오 전화번호 동의 항목(비즈 앱 심사) — 2단계

- 기준 기록: `tasks/DEV-78.md`(범위·결정·검증·배포 뒤 확인)
- 이 폴더: `src/lib/kakao.ts`·`src/lib/kakao.native.ts`의 인가 요청 scope를 `account_email,phone_number`로(`KAKAO_SCOPE`). 가입 신청(SCR-20, `src/app/apply.tsx`) 연락처 칸을 처음 신청일 때 계정 `phone`으로 미리 채운다(빈 칸일 때만, 반려 뒤 재신청은 이전 값). `spec.md` 결정 행 추가. 검사는 `scripts/e2e/producer-kakao.spec.ts`의 DEV-78 테스트.
