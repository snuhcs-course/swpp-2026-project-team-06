## DEV-87 관리자 페이지: 공급 물량 승인 화면과 신청 목록 API

- 이슈: [DEV-87](https://linear.app/sswp6/issue/DEV-87)
- 브랜치: `nemodleo/dev-87-dev-관리자-페이지-공급-물량-승인-화면과-신청` (DEV-83 브랜치 위에서 시작, DEV-83 머지 뒤 main으로 다시 맞춘다)
- 기능·인수 조건: FEAT-04 AC-04-3·AC-04-8, R-25, [1.4 계약](../docs/spec/capacity-1.4.md), ADR 0008
- 상태: 진행 중

### 목표
운영자가 여러 상품의 공급 물량 신청(첫 판매·증량)을 한 화면에서 보고 승인·반려한다. 지금은 Swagger에서 상품·신청 ID를 알아야 한다.

### 범위 (수정 허용 경로)
- 서버: `server/app/catalog/{router,schemas,service,spec}.py|md`(`GET /admin/capacity-requests`), `server/app/main.py`(라우터 등록), `server/tests/test_admin.py`, `server/tasks.md`
- 관리자 페이지: `scripts/admin-web/**`
- 문서: `docs/spec/screens.md`(7.2 운영자 행), `docs/spec/ia.md`(운영자 안내)

### 비범위
- 승인·반려 규칙(부분 승인 없음, 버전 검사 등) 변경, 상품 상세 보기·편집, 사람별 운영자 계정, 페이지네이션

### 결정 사항
- 10/19 목록은 `GET /admin/capacity-requests?status=PENDING|APPROVED|REJECTED|WITHDRAWN|ALL`(기본 PENDING), 신청 최신순. 응답은 `CapacityRequestView` + 상품 이름·상태, 농가 ID·이름, 현재 승인량·판매 한도(`AdminCapacityRequest`). 운영자만. 상품별 기존 `GET /api/products/{id}/capacity-requests`는 그대로.
- 10/19 화면 `/capacity`는 가입 신청과 같은 모양(상태 탭 → 카드 → 승인 두 번 눌러 확인 / 반려 사유). 승인·반려는 기존 API에 목록의 `version`을 보낸다. 버전이 바뀌었으면(409) 알림 후 목록을 다시 불러온다. 증량은 증가분(+kg)을 같이 보여 준다.
- 10/19 중계 허용 경로를 목록(정규식 배열)으로 바꿔 `/admin/capacity-requests`와 `/admin/products/{id}/capacity-requests/{id}/approve|reject`를 더한다. 다른 관리 API는 계속 400.
- 10/19 목록 화면 공용 스타일(탭·카드 항목·배지·반려 칸)을 `producers.html`에서 `assets/admin.css`로 옮겨 두 화면이 같이 쓴다.

### 작업
- [x] 서버 목록 API와 테스트
- [x] 관리자 페이지 공급 물량 승인 화면·메뉴·중계 경로·테스트
- [x] 문서(screens.md, ia.md, catalog spec.md, README)
- [x] 로컬 확인
- [ ] Vercel 배포, 운영 서버 배포 뒤 확인

### 완료 조건
- [x] 관리자 페이지에서 심사 중 공급 물량 신청을 보고 승인·반려할 수 있다(로컬)
- [x] 테스트 통과
- [ ] 리뷰 1명 승인 후 main 머지(DEV-83 다음)

### 기록
- 10/19 DEV-83 브랜치(bf5683d, main b6ee11a 병합)에서 시작.
- 10/19 로컬 확인: DB `farmclub_dev83` + uvicorn :8003 + `server.mjs` :8093. 미로그인 `/capacity` → `/login?next=%2Fcapacity` → 로그인 후 `/capacity`. 심사 중 3건(시드 청견 첫 판매 + 테스트 생산자로 만든 하우스 감귤·레드향 증량). 하우스 감귤 3,000kg 승인(두 번 눌러 확인), 레드향 빈 사유 거절 후 사유 반려, 청견 첫 판매 승인 → DB에서 청견 PUBLISHED·한도 250kg, 하우스 승인량 3,000kg(판매 한도 2,400kg 유지), 레드향 승인량 300kg 유지·반려 사유, 결정자 u-admin. 가입 신청 화면 그대로, 콘솔 오류 없음.

