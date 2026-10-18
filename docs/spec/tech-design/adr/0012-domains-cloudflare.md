# 0012 도메인: farmclub.kr, DNS는 Cloudflare

- 상태: 결정 (2026-10-18)
- 관련: FEAT-19(공유 링크), [0003](./0003-auth-kakao.md)(카카오 로그인), [0006](./0006-share-link-og.md)(공유 링크 OG), [0008](./0008-operator-admin-api.md)(운영자), [stack.md](../stack.md) TQ-02, DEV-69

## 배경
I1은 `farmclub-consumer.vercel.app`, `farmclub-producer.vercel.app`, `farmclub-api-production.up.railway.app` 같은 호스팅 기본 주소로 운영했다. 공유 링크(FEAT-19), 카카오 로그인 복귀 주소, PortOne 웹훅이 모두 주소에 묶여 있어서 실사용자를 받기 전에 고정 도메인으로 옮긴다. 디자인(P-SCR-30)도 `farmclub.kr/s/farms/...`를 쓴다.

## 결정

### 등록처와 DNS
- `farmclub.kr`은 KISA 인증 등록대행자인 호스팅케이알(hosting.kr)에서 산다. Cloudflare Registrar는 `.kr`을 팔지 않고(지원 TLD 목록에 없음, 2026-10 확인), KISA는 직접 팔지 않으며 인증 등록대행자만 등록할 수 있다. 등록자는 국내 연락처·주소를 적고, 소유자는 등록대행자가 아니라 우리로 기록되므로 나중에 다른 등록대행자로 옮길 수 있다.
- 네임서버만 Cloudflare(Free 플랜)로 옮기고 DNS는 Cloudflare에서 관리한다. 호스팅케이알에는 갱신·네임서버·(지원하면) DNSSEC DS 레코드만 남는다.

### 주소

| 주소 | 용도 | 연결 대상 |
| -- | -- | -- |
| `farmclub.kr` | 소비자 앱, 농가 공개 페이지, 공유 링크 `/s/farms/<id>` | Vercel `farmclub-consumer` |
| `www.farmclub.kr` | `farmclub.kr`로 308 리다이렉트 | Vercel `farmclub-consumer`(리다이렉트 도메인) |
| `farm.farmclub.kr` | 생산자 앱 | Vercel `farmclub-producer` |
| `api.farmclub.kr` | FastAPI 서버(관리 API, `/docs` 포함) | Railway `farmclub-api` |
| `admin.farmclub.kr` | 운영자 화면(FEAT-23) | 지금은 레코드 없음. 아래 참고 |
| `dev.farmclub.kr`, `staging.farmclub.kr` | 개발·검증 | 지금은 레코드 없음. 아래 참고 |

- 앱이 소비자·생산자로 나뉘어 있고 계정도 앱별이라([0010](./0010-separate-accounts.md)) 앱마다 호스트를 따로 둔다. 소비자 앱이 apex를 쓰는 것은 공유 링크와 첫 진입이 소비자 쪽이기 때문이다.
- 대상이 없는 서브도메인은 레코드를 만들지 않는다. 지워진 Vercel·Railway 주소를 가리키는 CNAME이 남으면 다른 사람이 그 주소를 가져가 우리 도메인으로 페이지를 띄울 수 있다(서브도메인 탈취).

### 공유 링크 경로
공유 링크는 `https://farmclub.kr/s/farms/<id>`로 나간다. OG HTML은 그대로 서버가 만든다(ADR 0006).
- 소비자 앱 `apps/consumer/vercel.json`이 `/s/*`를 `https://api.farmclub.kr/s/*`로 프록시(rewrite)한다. 나머지 경로는 지금처럼 `index.html`(SPA)로 간다.
- 서버는 공유 주소의 앞부분을 `SHARE_BASE_URL`로 받는다. 비우면 지금처럼 요청이 들어온 서버 주소를 쓴다(로컬·테스트). 운영은 `https://farmclub.kr`.
- 고른 이유: 링크 도메인이 서비스 도메인과 같아 카톡 미리보기와 주소창이 자연스럽고, 설정이 레포(vercel.json)에 남는다. Cloudflare Worker로 경로를 나누는 방법은 레포 밖 설정이 늘어서 쓰지 않았다.

### 운영자(admin)
- 전용 운영자 화면(FEAT-23)이 생기기 전까지 `admin.farmclub.kr`은 만들지 않는다. 운영자는 지금처럼 `https://api.farmclub.kr/docs`의 Swagger UI로 관리 API를 호출한다.
- 화면이 생기면 `admin.farmclub.kr`을 그 앱(Vercel 프로젝트)에 연결하고, Cloudflare Access(무료, 50명까지)로 운영자 이메일만 들어오게 막는다. 서버의 `ADMIN` 역할 검사(N-06)는 그대로 유지한다.
- 운영 `/docs`를 ADMIN만 보게 하거나 닫는 일(ADR 0008)은 이 결정과 별개의 작업으로 남는다.

### dev, staging
- 지금은 Railway·Vercel 모두 운영 환경 하나뿐이라 붙일 대상이 없다. 레코드를 만들지 않고 이름만 예약한다.
- 제안: 실서버 전환 뒤에도 사용자 테스트용 Mock 빌드(서버 없이 브라우저 안 데이터)가 필요하면 `staging.farmclub.kr`에 별도 Vercel 프로젝트로 올린다. `dev.farmclub.kr`은 Railway에 `staging` 환경을 만들 때 그 API 주소로 쓴다. 둘 다 필요해지는 시점에 이슈를 따로 만든다.

### Cloudflare 설정

| 타입 | 이름 | 값 | 프록시 |
| -- | -- | -- | -- |
| CNAME | `@` | Vercel이 `farmclub.kr` 추가 때 보여 주는 프로젝트 값(`<id>.vercel-dns-017.com`). Cloudflare가 apex CNAME을 펼쳐 응답한다 | Proxied |
| CNAME | `www` | `@`와 같은 Vercel 값. Vercel에서 `farmclub.kr`로 308 리다이렉트 | Proxied |
| CNAME | `farm` | Vercel이 `farm.farmclub.kr` 추가 때 보여 주는 값 | Proxied |
| CNAME | `api` | Railway가 커스텀 도메인 추가 때 보여 주는 `*.up.railway.app` 값 | Proxied |
| TXT | Railway·Vercel이 요구하는 검증 이름(예: `_railway-verify.api`) | 콘솔이 보여 주는 값 | — |
| MX | `@` | `0 .`(null MX, 메일 받지 않음) | — |
| TXT | `@` | `v=spf1 -all` | — |
| TXT | `_dmarc` | `v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s` | — |

- Vercel 레코드(`@`·`www`·`farm`)는 **프록시를 켠다**(주황 구름, 2026-10-18 사용자 결정). 방문자는 Cloudflare를 거쳐 Vercel로 간다. Vercel은 이때 "Proxy Detected" 경고를 띄우고, 자체 봇·DDoS 차단이 방문자를 모두 Cloudflare IP로 보게 되어 그 역할은 Cloudflare가 맡는다.
- 프록시를 켠 동안 지킬 설정:
  - SSL/TLS 모드 **Full (strict)**. Flexible이면 Cloudflare–Vercel 구간이 평문이 되고 리다이렉트 루프가 생긴다.
  - **Bot Fight Mode 끔**. 켜면 카카오톡 미리보기 크롤러(`/s/farms/<id>`)와 Vercel 인증서 확인 요청이 막힌다.
  - **Rocket Loader 끔**. 스크립트 순서를 바꿔 Expo 웹 앱이 빈 화면이 될 수 있다.
  - 이름이 고정된 정적 파일(`og.jpg`, 파비콘)을 바꾸면 Caching → Purge Cache.
- Vercel 도메인이 Invalid로 바뀌거나 인증서 갱신 경고가 오거나 배포 뒤 옛 화면이 계속 보이면 해당 레코드를 DNS only로 바꾼다. 되돌리기는 스위치 하나다.
- `api`(Railway)도 프록시를 켰다(2026-10-18, `/health` 200 확인). 서버가 보는 클라이언트 IP는 Cloudflare IP이고, 실제 IP는 `CF-Connecting-IP` 헤더에 있다. 지금 서버는 클라이언트 IP를 쓰지 않는다. Railway 인증서 갱신에 문제가 생기면 이 레코드를 DNS only로 바꾼다.
- Always Use HTTPS 켬.
- 메일은 쓰지 않으므로 null MX·SPF·DMARC로 우리 도메인을 사칭한 메일을 거부하게 한다. 고객센터 메일이 필요해지면 Cloudflare Email Routing을 켜고 이 세 레코드를 그에 맞게 바꾼다.
- DNSSEC: Cloudflare에서 켜고, 호스팅케이알이 `.kr` DS 레코드 입력을 지원하면 그 값을 넣는다.

### 같이 바꾸는 설정

| 어디 | 무엇 |
| -- | -- |
| Railway `farmclub-api` 변수 | `CONSUMER_APP_URL=https://farmclub.kr`, `PRODUCER_APP_URL=https://farm.farmclub.kr`(끝 `/` 없이. CORS 허용 출처와 카카오 복귀 주소 검증 기준), `SHARE_BASE_URL=https://farmclub.kr` |
| GitHub 레포 변수 | 실서버 빌드면 `APP_API_URL=https://api.farmclub.kr` |
| 레포(이 결정의 PR) | 배포 워크플로의 앱·헬스체크 주소, 앱 기본 URL, `index.html` OG 주소, 소비자 앱 `/s/*` 프록시 |
| 카카오 개발자 콘솔 | 플랫폼 Web 사이트 도메인 `https://farmclub.kr`, `https://farm.farmclub.kr`. Redirect URI `https://farmclub.kr/auth/kakao`(생산자 앱 로그인이 붙으면 `https://farm.farmclub.kr/auth/kakao`) |
| PortOne 콘솔 | 웹훅 주소 `https://api.farmclub.kr/api/payments/portone/webhook`(DEV-36, 결제 연동 머지 뒤) |

### 전환 순서
1. 호스팅케이알에서 도메인 구매 → Cloudflare에 사이트 추가 → 호스팅케이알에서 네임서버를 Cloudflare 값 2개로 변경 → Cloudflare가 Active가 될 때까지 대기.
2. SSL/TLS·메일 거부 레코드 설정.
3. Vercel 두 프로젝트와 Railway에 커스텀 도메인 추가 → 보여 주는 레코드를 Cloudflare에 넣음 → 세 주소가 HTTPS로 열리는지 확인(`https://api.farmclub.kr/health`).
4. Railway 변수 `CONSUMER_APP_URL`·`PRODUCER_APP_URL` 변경, 카카오 콘솔에 새 도메인 추가(옛 vercel.app 주소는 전환이 끝날 때까지 남김).
5. 이 결정의 PR 머지 → 서버·앱 자동 배포(새 주소로 빌드, `/s/*` 프록시).
6. Railway 변수 `SHARE_BASE_URL=https://farmclub.kr` → 카톡으로 농가 링크를 보내 미리보기와 이동을 확인.
7. 문제가 없으면 카카오 콘솔의 옛 주소를 지운다.

PR을 3번 전에 머지하면 배포 확인(`/health`, 사이트 200)과 OG 이미지 주소가 아직 없는 도메인을 가리켜 실패한다. `SHARE_BASE_URL`을 5번 전에 넣으면 `farmclub.kr/s/...`가 SPA로 떨어져 미리보기가 사라진다.

## 결과
- 사용자가 보는 주소가 서비스 이름과 같고, 호스팅을 바꿔도 주소는 그대로다.
- 카카오·PortOne·CORS 설정이 한 도메인 체계로 묶인다. 대신 서버의 앱 주소는 하나씩만 허용하므로, 전환 중 옛 vercel.app 주소의 실서버 빌드는 API 호출이 막힌다(Mock 빌드는 영향 없음).
- 공유 링크가 소비자 앱(Vercel)을 한 번 더 거친다.
- DNS·도메인 갱신은 사람이 관리한다. 도메인 만료일을 팀 캘린더에 둔다.
