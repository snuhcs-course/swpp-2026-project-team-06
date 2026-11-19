# server/app/accounts spec

> 구현하는 기능: FEAT-01(Mock 로그인·카카오·아이디·비밀번호), FEAT-08(저장 배송지) · 지키는 규칙: R-22, N-05, N-06, N-07 · 인수 조건: AC-01-1, AC-01-3~7, AC-08-5
> 동작·규칙·인수 조건 원본: docs/spec/functional/FEAT-01-login.md, rules.md (여기에 다시 쓰지 않는다)
> API 원본: docs/spec/screens.md 7.2 accounts · 흐름: docs/spec/tech-design/stack.md 5장 "Mock 로그인", ADR 0009(I1), ADR 0003(카카오, I2)

## 역할
사용자와 역할, I1 Mock 로그인(시드 테스트 계정) → JWT 발급, 생산자 가입 신청과 운영자 승인·반려, 사용자별 저장 배송지(내 정보 SCR-17). 소비자 앱 카카오 로그인(DEV-32): 인가 코드 → 카카오 회원번호·이메일(2026-11-17부터 전화번호도, DEV-78) → (회원번호, 역할)로 계정 찾기·만들기 → JWT. 첫 가입 온보딩(닉네임·이름·휴대폰·가입 동의) 상태 판단과 저장, 배송지 수정·삭제·50개 제한.

## 구조
- `router.py` — prefix `/auth`(앱에서는 `/api/auth`). `GET /api/auth/test-accounts`, `POST /api/auth/test-login`, `GET /api/auth/me`, 생산자 신청 `POST`·`GET /api/auth/producer-application`, 배송지 `/api/auth/me/addresses`. 관리 API `/admin/producers/...`는 DEV-4. (I2) `POST /api/auth/kakao`.
- `models.py` — 담당 엔티티: `User`, `UserConsent`, `ShippingAddress`, `NoticeRead`(농가 법정 안내 읽음 기록, DEV-121)
- `schemas.py` — 테스트 계정·로그인 응답, 내 정보, 가입 신청, 배송지 입출력
- `service.py` — 테스트 계정 조회·로그인(플래그·`isTestAccount` 확인), 사용자 조회, JWT 발급, 가입 신청·승인, 배송지 저장. 카카오 토큰 교환·사용자 조회(httpx `_kakao_fetch`, 테스트에서 바꿔 끼움), `kakao_login`·`kakao_config`

## 계약
- `User`: id, kakaoId?(I2), isTestAccount, role(CONSUMER·PRODUCER·ADMIN 중 하나, 바꾸지 않음), name, phone (tech-design/README.md). 같은 사람이라도 소비자·생산자 계정은 따로다(ADR 0010).
- Mock 로그인은 설정 `MOCK_LOGIN_ENABLED`가 켜져 있을 때만 동작하고, 꺼지면 두 엔드포인트 모두 404다. `isTestAccount = true`인 테스트 계정(시드·UAT)만 로그인되고 새 계정은 만들지 않는다(AC-01-4·5). 테스트 계정에는 `ADMIN`을 주지 않는다(ADR 0009).
- 테스트 계정 목록·로그인은 `app`(`consumer`·`producer`)을 받아 그 앱 역할의 계정만 다룬다. 계정 역할이 `app`과 다르면 403 `WRONG_APP`.
- 생산자 가입 신청은 생산자 계정(`role = PRODUCER`, 농가 없음)만 할 수 있고, `ownerName`으로 계정 이름을 바꾸며 `Farm`(PENDING)을 만든다. 소비자 계정에 생산자 역할을 붙이지 않는다(AC-01-7).
- 시드: 소비자 2(김민지·이서준), 생산자 5(승인·확인 중·반려·정지·농가 없음), tech-design/README.md ‘시드 데이터’(N-07). 이름·연락처·주소는 가짜 값.
- UAT 데이터(DEV-305): `python -m app.core.seed_uat [--commit]`이 넣는 소비자 3(`u-uat-c1..c3`)·생산자 3(`u-uat-p1..p3`)도 테스트 계정이다. tech-design/README.md ‘UAT 데이터’.
- JWT 검증·현재 사용자 조회는 `core/security.py`가 제공하고, 토큰 발급은 이 모듈이 한다.
- 다른 모듈과의 경계
  - farms: 가입 신청이 만드는 `Farm`(approvalStatus=PENDING)과 승인 상태는 farms가 가진다. 이 모듈은 farms의 service 함수로 농가를 만들고 승인 상태를 바꾼다.
  - orders: 주문서 기본값으로 `ShippingAddress`를 이 모듈 service로 읽는다. 주문은 배송지를 참조하지 않고 주문 시점 값을 `Order`에 복사한다(배송지를 바꿔도 지난 주문은 그대로).

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | 저장 배송지는 accounts의 `ShippingAddress`(사용자별) | 사용자 정보와 함께 관리, 주문과 분리(팀 결정) | AC-08-5 |
| 2026-10-07 | 라우터 prefix는 `/auth` | stack.md 5장 | — |
| 2026-10-07 | I1 로그인은 시드 테스트 계정 Mock 로그인(플래그), 카카오는 I2 | P22 결정, ADR 0009 | AC-01-4, AC-01-5 |
| 2026-10-07 | 계정 분리: `User.role` 하나, test-accounts·test-login에 `app`, 가입 신청이 생산자 계정 만들기를 겸함(`ownerName`), 생산자 시드 5명 | SWPP-81, ADR 0010 | AC-01-6, AC-01-7 |
| 2026-10-08 | 테스트 계정 순서는 소비자 [u-minji, u-seojun], 생산자 [u-kang, u-misook, u-new, u-soonja, u-taeho]. 운영자 `u-admin`은 테스트 계정이 아니고 `python -m app.accounts.admin_token`으로 토큰을 받는다 | 화면 SCR-05·19, ADR 0008·0009 | AC-01-4 |
| 2026-10-08 | 주문서의 기본 배송지 저장은 `save_order_address`(같은 주소면 기본으로만 바꿈) | FEAT-08 | AC-08-5 |
| 2026-10-16 | 생산자 승인·반려마다 신청 시각·결정·사유·운영자·결정 시각을 이력으로 남기고 재신청은 현재 반려 필드만 지운다 | 재신청 뒤에도 운영 결정 추적 | AC-01-3 |
| 2026-10-18 | 카카오에서는 회원번호·이메일만 받는다(`KakaoProfile`, 이름·전화번호는 비즈 앱 심사 뒤 빈 칸에만 채움, 전화번호는 010-0000-0000 꼴로). 처음 계정은 `name=""`·`email` 저장. `needs_onboarding`: 소비자 카카오 계정이고 nickname·name·phone·필수 동의(TERMS·PRIVACY·AGE14) 중 하나라도 없으면 true(테스트 계정·생산자는 false). `PATCH /api/auth/me`(nickname 2~12, name 2~20, 휴대폰 형식), `GET`·`POST /api/auth/me/consents`(`UserConsent`, (user, kind)당 한 줄). 주문·팔로우·좋아요·채팅 시작·채팅 보내기는 `core/security.OnboardedConsumer`, 소식방 답장은 서비스에서 같은 검사 → 403 `ONBOARDING_REQUIRED`. 농가에 보이는 소비자 이름은 `public_name`(닉네임, 없으면 이름 앞 글자 + ○○). 배송지 `PATCH`·`DELETE`(남의 것 404, 기본 삭제 시 최근 것이 기본), 계정당 50개(409 `ADDRESS_LIMIT`), 주문의 ‘기본 배송지로 저장’은 50개면 건너뜀. 마이그레이션 0016 | FEAT-01 I2, 사용자 결정 10/18, DEV-32 | AC-01-8, AC-01-12~15 |
| 2026-10-17 | 카카오 로그인은 `GET /api/auth/kakao/config`(사용 여부·클라이언트 ID·복귀 경로 `/auth/kakao`)와 `POST /api/auth/kakao`(`code`, `redirectUri`, `app`). 복귀 주소는 CORS 허용 앱 주소의 `/auth/kakao`만 받는다. (카카오 식별자, 역할) 조합마다 계정 하나이며 처음이면 카카오계정 이메일(없으면 닉네임, 둘 다 없으면 ‘카카오 사용자’)을 이름으로 만든다(`isTestAccount=false`, 연락처 빈 값). 자리 이름이던 계정은 다음 로그인에서 실제 이름으로 바뀐다. REST API 키가 비면 404. 리프레시 토큰은 아직 없다(0009와 같은 7일 토큰) | FEAT-01 I2, ADR 0003·0010, DEV-32 | AC-01-8, AC-01-9, AC-01-10 |
| 2026-10-23 | `needs_onboarding`은 닉네임·휴대폰·필수 동의만 본다(이름 제외, 위 10-18 행을 대신함). 이름은 가입 때 받지 않고 첫 주문서의 받는 사람으로 받으며 `name=""`로 남을 수 있다. 카카오에서는 이름을 받지 않고 전화번호만 받는다(DEV-78 심사 뒤 `phone_number`) | 가입 간소화(당근식), 사용자 결정 | AC-01-12 |
| 2026-11-17 | 카카오계정(전화번호) 동의 항목 심사가 통과해 두 앱이 인가 요청에 `phone_number`를 넣는다(scope `account_email,phone_number`). 서버 코드는 그대로: `KakaoProfile.phone` ← `kakao_account.phone_number`, `_kakao_phone`이 `+82 10-1234-5678`을 `010-1234-5678`로 바꾸고(국내 휴대폰이 아니면 빈 값), 새 사용자는 가입 토큰 `phone`으로 계정에, 기존 회원은 빈 칸에만 채운다. 위 10-18 행의 ‘회원번호·이메일만’은 이 행이 대신한다. 이름(`name`)은 여전히 받지 않는다 | FEAT-01 I2 FQ-01, DEV-78 | AC-01-8, AC-01-16 |
| 2026-11-06 | 원산지 표시제도 안내 읽음(DEV-121, 원산지표시법 제6조 ⑥ 고지 증빙): `notice_reads`(사용자·종류·버전마다 한 줄, 처음 시각 유지, 탈퇴해도 남김), `POST /api/auth/me/notices`(`Producer` = 동의한 생산자, 승인 전도 됨, 지금 `ORIGIN_NOTICE_VERSION`만 받고 아니면 400), `UserView.origin_notice_read_at`(생산자만). `user_consents`에 넣지 않은 까닭: 동의가 아니라 읽음이고, (사용자, 종류) 한 줄이라 버전별 증빙이 남지 않는다. 마이그레이션 0027(#482의 0026 다음) | 원산지표시법 시행규칙 제4조의2 1호 | — |
| 2026-11-10 | 계정 종류(DEV-307): `account_kind`(REAL·SEED_TEST·OPS_TESTER), SQL `kind_clause`, `kind_matches`. 테스트 = `is_test_account` 또는 `ops_tester`, 탈퇴는 실사용자로 세고 `withdrawn`만 표시. 관리자 가입 신청 목록 `GET /admin/producers`에 `kind`(기본 real)와 행 `producerId`·`accountKind`·`withdrawn`(`AdminProducerApplication`) | 관리자 개편에서 목록 기본을 실사용자로(PM 결정 11/10) | AC-23-12 |
| 2026-11-10 | `TEST_ACCOUNTS` 뒤에 UAT 계정(소비자 `u-uat-c1..c3`, 생산자 `u-uat-p1..p3`, `app.core.seed_uat`)을 붙인다. 목록은 DB에 있는 `isTestAccount` 계정만 돌려주므로 UAT를 넣지 않은 로컬·CI는 그대로다. `MOCK_LOGIN_ENABLED` 기본값(false)은 바꾸지 않는다 | UAT는 새 테스트 계정으로(11/10), DEV-305 | AC-01-4·5 |
| 2026-11-18 | 아이디·비밀번호 로그인(DEV-363, 공개 가입 없음·운영자가 계정 생성, PM 11/18): `users.username`(소문자, (username, role) 유일)·`password_hash`(argon2id m=19MiB·t=2·p=1만, 동시 해시 4개, 11/19 W1)·`must_change_password`·`token_version`(JWT `ver`, 옛 토큰은 0), 표 `auth_throttles`(키 HMAC, 실제 시각). `passwords.py`(규칙·해시·더미 검증·임시 비밀번호), `throttle.py`(DB 카운터, 요청 세션과 따로 커밋, 아이디 15분 10번 사전 카운트, 하루 지난 행은 시도마다 정리, IP별 제한 없음 PM 11/18). `service.create_id_account`(운영자 생성, 임시 비밀번호)·`password_login`·`change_password`, 앱 API `POST /api/auth/login`·`/me/password`. 계정 관문은 `core/security.get_current_user`(경로 허용 목록): 임시 비밀번호 `PASSWORD_CHANGE_REQUIRED` → 동의 전 아이디 계정 소비자 `ONBOARDING_REQUIRED`·생산자 `CONSENT_REQUIRED`. 운영자 `admin/id_accounts.py`(만들기는 `run_manager_action`, 감사·멱등 본문은 `{app}`만·대상은 만든 사용자 ID, 평문은 결과·멱등 기록에 넣지 않음), `admin/users.py` 임시 비밀번호 재발급(감사 행만). 탈퇴는 아이디·해시를 지우고 아이디를 예약하지 않는다. 마이그레이션 0036 | FEAT-01 I4, PM 결정 11/18, `server/tasks/DEV-363.md` | AC-01-22·23·26·27·29~33 |
| 2026-11-18 | `CONSENT_VERSION` 2026-11-20: 처리방침에 아이디 계정 항목 추가(DEV-363, PM 11/18). 앱 `LEGAL_VERSION`·Mock과 같은 값(`scripts/test-legal.mjs`). 예전 버전 동의자는 `consent_required`로 재동의 | DEV-113 재동의 규칙 | AC-01-17·18 |
