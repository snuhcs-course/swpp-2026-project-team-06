## DEV-60 농가 목록·검색과 팔로우 목록 API
- 이슈: [DEV-60](https://linear.app/sswp6/issue/DEV-60) (GitHub [#122](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/122))
- 브랜치: `nemodleo/dev-60-dev-add-get-apifarms-and-get-apifarmsfollowing-consumer-farm`
- 기능·인수 조건: FEAT-06 / AC-06-1, AC-06-3 · screens.md 7.2 farms(`GET /api/farms`, `GET /api/farms/following`)
- 상태: 리뷰 중
- 목표: Mock에만 있던 두 경로가 서버에 없어 소비자 앱 검색(SCR-02)과 내 정보 팔로우 목록(SCR-17)이 실서버에서 404. 스펙 표대로 서버에 추가한다.
- 범위(수정 허용 경로): `server/app/farms/{router,service}.py`, `server/tests/test_farms.py`, `server/app/farms/spec.md`, `server/tasks.md`. 앱·Mock·docs/spec 변경 없음(표에 이미 있음)
- 결정 사항:
  - 10/17 고정 경로 두 개를 `/{farm_id}` 앞에 둔다. 페이지는 orders 라우터와 같은 offset cursor.
  - 10/17 검색은 Mock과 같은 부분 일치(농가명·지역·주 품목·판매 중 상품명). 품종은 상품 카드에 없어 제외.
  - 10/17 팔로우 목록은 최근 팔로우가 위, 승인 취소(SUSPENDED 등) 농가는 뺀다.
- 작업: [x] 서비스·라우터 [x] pytest 4개 [x] Ruff [x] 실서버에서 내 정보·검색 화면 확인
- 검증: Ruff 통과, 전체 pytest 214개 통과(신규 4개). 로컬 실서버에서 `/api/farms`(정렬·검색)·`/api/farms/following`(401/200) 확인, 소비자 앱 `/farms`·`/me` 렌더링 확인.
- 10/18 main(a7e41db) 병합: 충돌은 `server/tasks.md`(섹션 추가끼리, 둘 다 유지)뿐. `/farms` 아래 다른 고정 경로 추가 없음. Ruff check 통과, 전체 pytest 332개 통과(별도 DB `farmclub_dev60`; 공용 `farmclub` DB에 다른 브랜치 테이블이 있어 drop 실패), typecheck 4 workspace 통과, 실서버 API 시나리오 7개 통과. Playwright는 다른 세션의 Expo가 `[::1]:8081`을 쓰고 있어 로컬에서는 돌리지 못했고 CI integration으로 확인.

