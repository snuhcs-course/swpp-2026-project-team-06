## DEV-78 카카오 전화번호 동의 항목(비즈 앱 심사) — 2단계

- 기준 기록: `tasks/DEV-78.md`(범위·결정·검증·배포 뒤 확인)
- 이 폴더: `src/lib/kakao.ts`·`src/lib/kakao.native.ts`의 인가 요청 scope를 `account_email,phone_number`로(`KAKAO_SCOPE`). 온보딩(SCR-06) 휴대폰 칸과 첫 주문서 연락처 칸은 이미 `user.phone`으로 미리 채우고 있어 화면 코드는 바꾸지 않았다.
