# 관리자 페이지 (DEV-82, DEV-83, DEV-87, DEV-98, DEV-106, DEV-107, DEV-114, DEV-303, DEV-363)

운영자가 쓰는 임시 관리자 페이지다. 지금은 생산자 가입 신청과 상품 공급 물량 신청을 목록으로 보고 승인·반려하는 화면 두 개와 테스트 농가를 숨기는 화면, 사용자 검색·테스트 표시 화면이 있고, 왼쪽 메뉴에 관리 화면을 하나씩 늘려 간다. 빌드 없는 HTML 화면과 Vercel 함수(로컬은 `server.mjs`)로 되어 있다.

| 경로 | 화면 |
| -- | -- |
| `/login` | 로그인(공용 접속 비밀번호). 로그인한 상태면 `/producers`로 |
| `/producers` | 농가 가입 신청: 상태 탭 → 승인(두 번 눌러 확인) / 반려(사유) → 결정 이력 |
| `/id-accounts` | 아이디 계정(DEV-363): 공개 아이디 가입은 없고(PM 11/18) 원스토어 심사·UAT용 아이디·비밀번호 계정을 운영자가 만든다. 앱(소비자·생산자) → 아이디·닉네임(생산자는 이름, 선택)·휴대폰(소비자만, 선택) → `아이디 계정 만들기`. 틀린 칸만 빨갛게(서버 `details.fields` 포함). 임시 비밀번호는 만든 직후 한 번만 보임. 아래 목록(전체·소비자·생산자, 검색): 임시 비밀번호 사용 중·약관 동의 전·농가 상태 배지, `임시 비밀번호` 다시 발급 |
| `/capacity` | 공급 물량 승인(DEV-87): 상품별 첫 판매·증량 신청 → 신청량 전체 승인(두 번 눌러 확인) / 반려(사유). 부분 승인 없음 |
| `/farms` | 테스트 농가(DEV-98): 공개 중·숨김 탭 → 숨기기 / 다시 공개 → 미리보기(거부 사유, 출하 전 테스트 주문) → 두 번 눌러 실행. 테스트 계정이 아닌 소비자 주문이 있으면 거부 |
| `/users` | 사용자(DEV-107): 검색(이름·닉네임·아이디·ID·농가 이름·전화 끝 4자리), 역할·테스트 여부 탭 → 테스트로 표시 / 해제(두 번 눌러 확인). 전화는 끝 4자리만. 아이디 계정(DEV-363)은 `아이디 가입`·아이디 줄과 `임시 비밀번호`(두 번 눌러 발급, 기존 비밀번호·로그인 모두 풀림). 기존 시드 테스트 PRODUCER는 카카오·ID 로그인 자격 증명이 없고 연결 농가가 있을 때 `아이디 로그인 설정`을 눌러 username을 지정할 수 있다(DEV-439). 발급은 기존 user ID·역할·테스트 분류·농가 연결을 보존하며 첫 비밀번호 변경·현재 약관 동의가 필요하다. 결과 임시 비밀번호는 한 번만 보이고 닫기·목록 갱신·페이지 이탈 때 지워진다. 농가가 `APPROVED`가 아니면 로그인 자격 증명 발급만으로 농가·상품 접근 권한이 생기지 않는다 |
| `/user`, `/users/<id>` | 사용자 찾기(DEV-106): 사용자 ID·주문 ID·주문 번호로 찾기 → 주문·입금·환불 내역 → 입금 확인 대행 / 배송 완료 / 환불(금액·사유), 두 번 눌러 실행. 생산자면 농가 상품 전부(상태 배지, 반려 사유, 공급 승인·판매 한도, 옵션 줄 `5kg 29,000원 · 38박스 / 180박스`)와 작성 중 AI 초안을 읽기 전용으로 보여 줌(DEV-303). 사용자 목록의 생산자 링크는 `상세(상품·주문)`. 받는 사람 전화·주소는 안 보임 |
| `/ai-cost` | AI 비용(DEV-144): 기능별(코드 리뷰·상품 초안·상세 초안·AI 답변·자료 분석)·합계 × 이번 달 KST·최근 7일·전체 표, 기능 탭으로 거르는 호출 목록(50건씩 더 보기). 조회만 |
| `/inbox` | 문의함(DEV-111·DEV-150): 답변 대기·생산자·소비자·전체 탭 → 대화 보기(열면 읽음) → farmclub으로 답장. 생산자·소비자 앱 1:1 채팅 목록의 farmclub 대화방(로고)과 같은 대화. 사진은 '사진 N장'으로만 보임 |
| `/` | 로그인 상태에 따라 `/producers` 또는 `/login` |

## 구조

```
api/page.js      화면을 내려 준다. 로그인 안 했으면 /login?next=… 으로 보낸다
api/login.js     POST {password} → 맞으면 세션 쿠키, 틀리면 0.8초 늦게 401
api/logout.js    POST → 쿠키 지우고 /login
api/proxy.js     세션 확인 → 운영자 토큰을 붙여 실서버 /admin/… 허용 경로로 중계
api/_lib/        세션(서명 쿠키)·공용 함수. 밑줄 폴더라 함수·정적 파일로 나가지 않는다
api/_views/      화면 HTML(login, producers, id-accounts, capacity, farms, users, user). 데이터는 없고 중계로 불러온다
assets/          공용 스타일(admin.css)과 사이드바 메뉴·중계 호출(admin.js)
vercel.json      경로 규칙(rewrites). server.mjs도 같은 규칙을 읽는다(`/users/:id` 같은 이름 붙은 조각 포함)
```

- 실서버 CORS는 소비자·생산자 앱 주소만 허용한다. 그래서 브라우저가 실서버를 직접 부르지 않고, 중계가 `api/proxy.js` `ALLOWED`에 적은 경로(가입 신청, 공급 물량 신청, 테스트 농가, 사용자 목록, 사용자 상세와 주문 처리, 문의함, AI 비용)만 실서버로 넘긴다. DEV-363에서 아이디 계정 목록·만들기(`/admin/id-accounts`)와 임시 비밀번호 발급(`/admin/users/{id}/temporary-password`)을 더했다. 임시 비밀번호는 화면에 한 번만 보이고(`assets/admin.js` `secretBox`: 닫기·목록 다시 그리기·페이지 떠나기에 지움) 저장소·콘솔에 남기지 않는다. 중계 응답은 모두 `Cache-Control: no-store`이고 본문을 기록하지 않는다. DEV-307에서 농가 정지 미리보기·정지·정지 풀기·결정 이력(`/admin/farms/{id}/suspend-preview|suspend|unsuspend|history`), 반려 되돌리기(`/admin/producers/{id}/revert`), 활동 로그(`/admin/users/{id}/activity`), 홈 건수(`/admin/home`), 문의함 계정 필터(`/admin/support?kind=`)를 더했다. 화면은 DEV-308·309가 만든다.
- 계정 필터(DEV-307): 목록 API의 기본 계정 필터가 실사용자(`kind=real`)라서, 개편(DEV-308·309) 전까지 지금 화면이 테스트 계정 행도 계속 보이도록 사용자 '전체' 탭·가입 신청·공급 물량·문의함 화면은 `kind=all`을 보낸다. DEV-307 전 서버는 사용자 목록의 `kind=all`을 400으로 거절한다. 자동 배포는 서버와 관리 웹을 동시에 올리므로, 사용자 화면은 `kind=all`이 400 `VALIDATION_ERROR`로 거절되면 `kind` 없이(옛 기본 = 전체) 한 번 더 부른다. 반대로 새 서버가 먼저 뜨고 옛 관리 웹이 남아 있는 몇 분 동안은 목록에서 테스트 계정이 빠져 보일 수 있다(데이터 변화 없음).
- 로그인은 공용 비밀번호(`ADMIN_WEB_PASSWORD`)를 한 번 확인하고 `fc_admin` 쿠키를 준다. HttpOnly·SameSite=Strict, https에서는 Secure, 12시간 유효. 값은 만료 시각과 HMAC 서명이고, 서명 키는 비밀번호에서 만든다. 그래서 새 환경 변수가 없고, 비밀번호를 바꾸면 모든 로그인이 풀린다. 다른 사이트에서 온 POST(Origin이 다름)는 거절한다.
- 운영자 토큰(`ADMIN_TOKEN`)은 함수 환경 변수에만 있고 브라우저로 가지 않는다. 세션이 끝나면 화면이 `/login`으로 보내고, 다시 로그인하면 보던 화면으로 돌아온다.
- 링크와 비밀번호를 아는 사람은 누구나 승인·반려할 수 있고, 결정은 모두 운영자 계정(`u-admin`) 이름으로 기록된다. 사람별 기록이 필요해지면 사람별 운영자 계정(서버 변경)으로 바꾼다.

### 크기 단계 (DEV-149)

페이지 제목 22 / 카드·절 제목(h2) 16 굵게 / 본문·버튼·입력·탭·표 14 / 보조 13 / 배지 12. 버튼·입력 36, 탭 32. 새 화면은 `assets/admin.css`의 공용 요소(`.card`, `.meta`, `.tabs`, `.box` 표, `.badge`)를 쓰고 화면별 style에서 크기를 다시 정하지 않는다. Figma v6 '현재 시안 · 관리자'가 기준.

### 메뉴 늘리기

1. `api/_views/<이름>.html`을 만든다(`producers.html`처럼 `#side`·`assets/admin.js`를 쓴다).
2. `api/page.js`의 `PAGES`, `vercel.json` `rewrites`, `assets/admin.js`의 `NAV`에 한 줄씩 넣는다.
3. 새 실서버 경로를 부르면 `api/proxy.js`의 `ALLOWED`를 넓힌다.

## 운영자 토큰 발급 (7일 유효)

```sh
cd server
railway ssh -- .venv/bin/python -m app.accounts.admin_token
```

API 서버 컨테이너 안에서 실행해 토큰은 7일 유효하다. 만료되면 화면에 안내가 뜨고, 다시 발급해 `ADMIN_TOKEN`을 바꾼다. 운영 DB의 운영자 계정(`u-admin`)과 운영 `JWT_SECRET`으로 발급된다. `railway run`은 내 컴퓨터에서 실행하므로 내부 주소(`postgres.railway.internal`)인 운영 DB에 닿지 않는다. Railway에 연결된 체크아웃(`railway link`)에서 실행한다. 토큰은 비밀번호처럼 다루고 저장소·채팅에 붙이지 않는다.

## 로컬 실행

```sh
ADMIN_WEB_PASSWORD=… ADMIN_TOKEN=… node scripts/admin-web/server.mjs   # http://127.0.0.1:8090/login → https://api.farmclub.kr
# 로컬 서버에 붙일 때는 FARMCLUB_API_URL=http://127.0.0.1:8000 과 로컬에서 발급한 토큰
# (server/에서 같은 DATABASE_URL·JWT_SECRET으로 uv run python -m app.accounts.admin_token)
```

## Vercel 배포

이 폴더를 루트로 하는 별도 Vercel 프로젝트(`farmclub-admin`, https://admin.farmclub.kr)로 올린다. 빌드는 없고, Vercel이 `vercel.json`대로 `api/*.js`를 서버리스 함수로 만든다. Vercel 환경 변수에 `ADMIN_WEB_PASSWORD`와 `ADMIN_TOKEN`을 넣어야 동작한다(없으면 로그인·중계가 503). 실서버 주소를 바꾸려면 `FARMCLUB_API_URL`을 넣는다. 환경 변수는 Vercel 프로젝트에서만 바꾸고 워크플로·저장소에는 두지 않는다. `admin.farmclub.kr`은 Cloudflare `admin` CNAME(Proxied) → Vercel `farmclub-admin`이고(DEV-91, ADR 0012), `farmclub-admin.vercel.app`도 같은 배포다.

## DEV-439: 기존 UAT 생산자 ID 로그인 설정

운영자는 코드가 배포된 뒤 관리자 페이지에서 다음 순서로 처리한다. 이 작업은 credentials만 설정하며 UAT farm/product 상태를 바꾸지 않는다.

1. 관리자 페이지에 로그인하고 **사용자**(`/users`)로 이동한다. 역할을 **생산자**, 종류를 **테스트**로 고르고 `u-uat-p3` 또는 `UAT 생산자 3`을 검색한다.
2. 카드의 내부 ID가 `u-uat-p3`, 역할이 생산자, 계정 종류가 시드 테스트인지 확인한다. 카드에 farm link가 있는지 확인하고, 사용자 상세를 열어 farm ID `f-uat-3` 및 product ID `p-56ef428b08`이 실제로 연결돼 있는지 읽기 전용으로 확인한다. 화면의 현재 farm 상태와 product 가격·공급·재고 상태도 기록한다. 기대값을 스크린샷이나 과거 seed에서 추정하지 않는다.
3. farm status가 현재 `APPROVED`가 아니면 여기서 멈춘다. producer farm/product API는 `APPROVED` 상태를 요구한다. 이 credential 작업은 `PENDING`·`SUSPENDED`를 승인하거나 숨김 해제하지 않는다. 승인/visibility 변경은 별도 승인된 UAT 작업으로 결정해야 한다.
4. 카드에 **아이디 로그인 설정**이 보이면 새로 만들지 않고, 비밀정보가 아닌 username(영문자로 시작하는 영문·숫자 4~20자)을 입력한다. 한 번 눌러 확인 문구를 읽고 다시 눌러 발급한다. 기존 비밀번호·모든 이전 토큰은 무효화되고 `is_test_account` 및 farm link는 유지된다.
5. 임시 비밀번호는 결과 상자에서 한 번만 복사한다. 화면을 닫거나 목록을 다시 그리면 복구할 수 없다. facilitator에게 username과 임시 비밀번호를 승인된 비공개 암호화 경로로 직접 전달하고, Linear·일반 채팅·문서·스크린샷·녹화에는 붙이지 않는다.
6. facilitator는 Cycle 2용 승인된 producer 앱/build의 **아이디로 로그인**에서 받은 username과 임시 비밀번호로 로그인하고, 새 비밀번호를 설정한 뒤 현재 생산자 이용약관·개인정보 처리방침에 동의한다. 이후 UAT 전에 `UAT 농가 3`과 상품 ID를 다시 확인한다. 앱에서 farm/product 접근이 막히면 사용을 멈추고 상태를 다시 확인한다. 운영자가 farm approval, visibility, price, supply, inventory, or orders를 이 credential 작업과 함께 바꾸면 안 된다.

임시 비밀번호를 결과에서 놓친 경우 같은 설정 동작을 재시도하지 않는다(이미 발급된 account는 409). 이 경우 관리자 사용자 화면의 기존 **임시 비밀번호** 경로로 새 password를 발급해 다시 안전하게 전달한다.

- **테스트(CI)**: PR·main push에서 `scripts/admin-web/**`가 바뀌면 `ci.yml`의 `admin-web` job이 `node --test scripts/admin-web/admin.test.mjs`를 돌린다(DEV-114).
- **자동 배포**: main CI가 성공하고 그 커밋에 `scripts/admin-web/` 변경이 있으면 `deploy-vercel.yml`의 `deploy-admin` job이 `vercel deploy scripts/admin-web --prod`로 올리고 `https://admin.farmclub.kr/login`이 200인지 확인한다. 앱 배포와 같은 `VERCEL_TOKEN`(production Environment)을 쓰고, 토큰이 없으면 건너뛴다.
- **수동 실행**: Actions 탭 → `Deploy apps to Vercel` → Run workflow(브랜치 main). 변경 여부와 상관없이 두 앱과 관리자 페이지를 모두 올린다.
- **로컬에서 직접**(급할 때, Vercel 팀 권한 필요):

```sh
cd scripts/admin-web
vercel deploy --prod
```

검색 노출을 막는 헤더(`noindex`)를 붙인다. 로그인 전에는 로그인 화면만 열리고, 목록·승인은 세션이 있어야 된다.
