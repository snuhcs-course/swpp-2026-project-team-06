# 관리자 웹 구현 결정

> 제품 규칙: docs/spec/functional/FEAT-23-operator-admin.md · API: docs/spec/screens.md

| 날짜 | 구현 결정 | 근거 |
| --- | --- | --- |
| 2026-11-24 | 상품별 공개 제어는 사용자 상세 상품 카드의 인라인 확인 영역에서 기존 proxy·세션·CSRF·공용 카드 규격을 사용한다. 공개 상태와 승인 상태는 별도로 표시한다. | DEV-479, AC-23-13~15 |

테스트: `node --test scripts/admin-web/admin.test.mjs`. 운영 변경 테스트는 로컬 API·분리된 DB에서만 수행한다.
