## DEV-38 농가 공유 링크 실제 진입
- 목표: FEAT-19 AC-19-1/2/3의 서버 공유 페이지를 구현한다.
- 범위: `app/farms/router.py`, `app/farms/share.py`, `app/farms/templates/farm-share.html`, `app/farms/spec.md`, `app/main.py`, `tests/test_farms.py`, `tests/test_farm_share.py`, `tasks.md`.
- 결정: 기존 상대 shareUrl 계약을 서버 라우터에서 절대 URL로 완성한다. 승인 농가의 공개 필드만 OG에 쓰며 비승인/없는 농가는 동일 404 안내다. 사람은 소비자 농가 화면으로 이동하고 공유 크롤러는 정적 OG 태그를 읽는다. 자동 이스케이프, HTTP(S) 이미지만, no-store를 적용한다.
- 작업: [x] 공유 HTML·절대 URL [x] 권한·메타데이터·이스케이프 테스트 [x] 프런트 링크 실제 진입
- 기록: 10/16 DEV-29/38 브라우저 회귀 검사에서 발견. 사용자 요청한 생산자 공유 기능 범위이며 운영자·AI 구현은 제외.

- 검증: 전체 pytest 162개·Ruff 및 실서버 API 7개/Chromium 19개 통과. 공유 링크 메타데이터·승인 취소·HTML 이스케이프와 비로그인 실제 진입 확인.


