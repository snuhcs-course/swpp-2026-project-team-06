## DEV-91 관리자 페이지 admin.farmclub.kr 연결과 도메인 문서 갱신

- 이슈: [DEV-91](https://linear.app/sswp6/issue/DEV-91)
- 브랜치: `nemodleo/dev-91-dev-관리자-페이지-adminfarmclubkr-연결과-도메인-문서`
- 관련: [ADR 0012](../docs/spec/tech-design/adr/0012-domains-cloudflare.md), DEV-69(도메인), DEV-83·DEV-87(관리자 페이지)
- 상태: 리뷰 대기

### 범위 (수정 허용 경로)
- 문서: `docs/spec/tech-design/adr/0012-domains-cloudflare.md`, `README.md` 도메인 절, `scripts/admin-web/README.md`, `docs/spec/ia.md` 운영자 안내(10·86·146행 근처), `docs/spec/prd.md` FEAT-23 행, `docs/spec/tech-design/stack.md` 운영자 화면 행, `server/tasks.md`
- 콘솔(코드 아님): Vercel `farmclub-admin` 도메인 추가(에이전트), Cloudflare `admin` CNAME(사용자)

### 비범위
- Cloudflare Access(운영자 이메일 제한), 예전 `farmclub-admin.vercel.app` 막기·리다이렉트, 코드 변경

### 결정 사항
- 10/19 `admin.farmclub.kr` → Vercel `farmclub-admin`. Cloudflare CNAME `admin`(Vercel 프로젝트 값) Proxied, 다른 Vercel 레코드와 같은 방식.
- 10/19 Cloudflare Access는 아직 켜지 않음(운영자 이메일은 사용자가 콘솔에서 넣을 일). ADR 0012 운영자 절에 남은 일로 적음.
- 10/19 Vercel이 `farm` 추가 때 만든 `www.farm.farmclub.kr`은 두 단계 서브도메인이라 Cloudflare 무료 인증서가 덮지 않음 → 쓰지 않고 지움(ADR에 규칙으로 적음).

### 작업
- [x] Vercel `farmclub-admin`에 `admin.farmclub.kr` 추가
- [x] Cloudflare `admin` CNAME Proxied(사용자)
- [x] 운영 확인: `https://admin.farmclub.kr/login` 200, `/producers`·`/capacity` → `/login?next=…` 302, `server: cloudflare`·`x-vercel-id`, 사용자 로그인 성공
- [x] 문서 갱신

### 완료 조건
- [x] 새 주소로 관리자 페이지에 로그인할 수 있다
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/19 main 61a8034에서 시작. 문서만 바꿔 실행할 테스트 없음.
- 10/19 리뷰 지적: ia.md 10·146행("I1은 화면 없이 Swagger UI, 전용 화면은 I2")이 86행(관리자 페이지 있음)과 어긋남 → 세 곳과 prd.md FEAT-23 행, stack.md 운영자 화면 행을 "I1에서는 화면 없이 Swagger UI였지만 관리자 UI를 만들어 바꿨다"로 맞춤(사용자 지정 문구).
- 10/23 main 병합(DEV-98·106·107·111·113·114·127·132 뒤). 충돌 4곳 해결: README 예약 서브도메인에서 `admin` 제외, ia.md는 main의 관리자 페이지 안내를 유지하고 운영자 문구·운영 주소만 반영, admin-web README는 DEV-114가 자동 배포를 적어 '배포는 자동이 아니다' 문장을 빼고 DNS 사실만 한 줄로, 이 섹션은 파일 끝으로 이동.

