# apps/producer spec

> 구현하는 기능: FEAT-01, FEAT-02, FEAT-03, FEAT-04, FEAT-05, FEAT-12, FEAT-13, FEAT-14, FEAT-15, FEAT-17, FEAT-19 · 지키는 규칙: R-05, R-06, R-15, R-17, R-18, R-19, R-20, R-21, R-22, R-23, R-25, M-01, M-09, M-11, M-12, M-13, M-14, N-01, N-02, N-04, N-06
> 동작·규칙·인수 조건 원본: docs/spec/functional/ (여기에 다시 쓰지 않는다)
> 화면·경로·레이블 원본: docs/spec/ia.md 2장·4장·6장, 화면별 명세·API: docs/spec/screens.md 6장·7장, FEAT ↔ 폴더: docs/spec/tech-design/stack.md 4장

## 역할
생산자 앱(모바일 웹). Expo + Expo Router 웹 출력으로 만들고 Vercel에 정적 배포한다(ADR 0001). 로그인 SCR-19, 가입·대기 SCR-20·21, 정지 안내, 승인 후 화면 SCR-22~30을 맡는다.

## 구조
- `src/app/` — Expo Router 라우트. 파일 하나가 화면 하나다.
- 하단 탭 4개(ia.md 4장): 현황(SCR-22) · 상품(SCR-23) · 채팅(SCR-28) · 환경설정(SCR-33). `src/app/(tabs)/_layout.tsx`
- 탭 밖 화면은 루트 Stack에 둔다: 로그인, 가입 신청, 승인 대기, 정지 안내, 소식 올리기, 출하 처리.
- 승인 전 생산자는 SCR-21(승인 대기)만, 정지된 생산자는 정지 안내만, 농가 없는 생산자 계정은 SCR-20만 열린다(ia.md 6장, AC-01-3). 탭 그룹 진입 시 막는 처리는 DEV-3, 서버 검사는 DEV-4(N-06).

| SCR | 화면 | 경로 | 파일 | FEAT |
| --- | --- | --- | --- | --- |
| SCR-19 | 로그인(생산자 테스트 계정만) | `/login` | `src/app/login.tsx` | FEAT-01 |
| SCR-19 하위 | 정지 안내 | `/suspended` | `src/app/suspended.tsx` | FEAT-01 |
| SCR-20 | 가입 신청 | `/apply` | `src/app/apply.tsx` | FEAT-01 |
| SCR-21 | 승인 대기 | `/pending` | `src/app/pending.tsx` | FEAT-01 |
| SCR-22 | 현황(홈) | `/` | `src/app/(tabs)/index.tsx` | FEAT-14 |
| SCR-23 | 상품 목록 | `/products` | `src/app/(tabs)/products/index.tsx` | FEAT-04 |
| SCR-24 | AI 상품 초안 | `/products/new` | `src/app/(tabs)/products/new.tsx` | FEAT-03 |
| SCR-25 | 상품 편집 | `/products/:id/edit` | `src/app/(tabs)/products/[id]/edit.tsx` | FEAT-04 |
| SCR-26 | 예약 기간·가격 | `/products/:id/stages` | `src/app/(tabs)/products/[id]/stages.tsx` | FEAT-05 |
| SCR-27 | 소식 올리기 | `/broadcast/new` | `src/app/broadcast/new.tsx` | FEAT-12, 15 |
| SCR-28 | 채팅 목록 | `/chats` | `src/app/(tabs)/chats/index.tsx` | FEAT-12, 13 |
| SCR-28 하위 | 소비자별 채팅 | `/chats/:consumerId` | `src/app/(tabs)/chats/[consumerId].tsx` | FEAT-13 |
| SCR-29 | 출하 처리 | `/ship` | `src/app/ship.tsx` | FEAT-17 |
| SCR-30 | 농가 프로필·링크 | `/farm` | `src/app/(tabs)/farm/index.tsx` | FEAT-02, 19 |
| SCR-30 하위 | 프로필 항목 고치기 | `/farm/edit/:field` | `src/app/(tabs)/farm/edit/[field].tsx` | FEAT-02 |

| SCR-33 | 환경설정 | `/settings` | `src/app/(tabs)/settings.tsx` | FEAT-02, 13 |
| SCR-28 하위 | 농가 소식방 | `/news/:farmId` | `src/app/news/[farmId].tsx` | FEAT-12 |

## 계약
- 공용 컴포넌트·토큰은 `@farmclub/ui`(packages/ui), 서버 호출은 `@farmclub/api`(packages/api)만 쓴다.
- 서버 주소는 `EXPO_PUBLIC_API_URL`(packages/api spec).
- 환경설정 → 농가 프로필에서 복사하는 링크는 서버의 `/s/farms/<id>`다(ADR 0006). 소비자 앱 주소를 직접 복사하지 않는다.
- I1 로그인은 생산자 테스트 계정 선택(`GET /api/auth/test-accounts?app=producer`, `POST /api/auth/test-login`의 `app: producer`, ADR 0009·0010). 시드 생산자는 승인·확인 중·반려·정지·농가 없음 5명(tech-design 시드 데이터). 소비자 계정은 이 앱에 로그인하지 않고, 403 `WRONG_APP`이면 토큰을 지우고 로그인으로. 가입 신청(SCR-20)이 생산자 계정 만들기를 겸한다. 카카오 리다이렉트 `/auth/kakao`는 I2.
- 출하 처리(SCR-29)는 주문을 여러 건 골라 ‘n건 출하로 바꾸기’ → 주문마다 `POST /api/orders/{orderId}/ship`(`carrier`, `trackingNumber`)을 반복한다(새 일괄 API 없음). 생산자는 배송 완료로 바꾸지 못한다(R-19). 자연어 입력은 I2.
- 화면 모양·크기·문구는 `docs/design/`이 기준이다(주요 버튼 56, 할 일 숫자 48, 목록 줄 최소 56).
- 쓰는 API는 screens.md 7.2.

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | 라우트는 `src/app/`, 탭 화면은 `(tabs)` 그룹(상품 탭은 Stack). 로그인·가입·대기·소식 올리기·출하 처리는 탭 밖 루트 Stack | ia.md 2장 경로와 4장 탭 구성을 함께 지킴 | — |
| 2026-10-07 | 웹 출력은 `web.output: "single"`(SPA). Vercel rewrite는 DEV-8 | 정적 호스팅, 동적 경로 | — |
| 2026-10-07 | Expo는 SDK마다 바뀌므로 docs.expo.dev의 버전별 문서를 확인하고, 패키지는 반드시 `npx expo install`로 추가한다 | create-expo-app이 만든 AGENTS.md 규칙을 루트 AGENTS.md 하나로 합치며 옮김 | — |
| 2026-10-07 | DEV-12의 화면은 `Placeholder`로 "SCR-xx 화면 이름 · FEAT-xx"만 보여준다. 승인 전 잠금은 아직 없음 | 뼈대 이슈, 기능은 DEV-3·DEV-4 | AC-01-3 |
| 2026-10-07 | SCR-27 레이블을 ‘소식 올리기’로, SCR-29는 상태 변경 + 송장(자연어 I2), 로그인은 테스트 계정 | P22 결정(SWPP-26) | AC-17-2, AC-17-4 |
| 2026-10-07 | 로그인을 SCR-19(생산자 계정만)로, `/suspended`·`/questions/:escalationId`·`/farm/edit/:field` 하위 화면, 현황의 출하 처리 버튼 대신 할 일, 여러 건 출하와 택배사 | SWPP-81(screens.md 1.1, ADR 0010) | AC-01-3, AC-01-6, AC-17-2 |


## DEV-3 로컬 이식 결정 (2026-10-07)

ZIP의 SCR-19~30과 상태별 진입 제어, 질문함·농가 하위 경로를 이식했다. 루트 npm run dev로 Mock 로컬 실행하며 소비자 링크는 로컬 주소를 따른다.

기존 구현 결정 표의 DEV-12 뼈대 설명은 과거 기록이며 현재 구현은 이 절을 따른다.


DEV-3: 현황·농가 소식 FAB은 /broadcast를 연다. 본인 farmId의 NewsRoom에 모든 답장을 표시하며 입력은 전체 방송이다. /broadcast/new는 첨부·공개 범위 작성용으로 유지한다.

## DEV-3 스펙 1.2 구현 기준

PR #38의 contracts-1.2.md와 디자인 README를 따른다. 판매 설정/날짜 기간의 버전·멱등 키와 권한을 공유 Mock까지 구현한다. 공용 대화 UI에 API 함수를 주입하고 활성 화면만 polling한다. 구형 로컬 중간 구조의 호환 API는 남기지 않는다.


## DEV-3 화면 구조 1.3 (변경 이력)

이전 탭/로컬 이식 기록은 변경 이력이다. PR #39의 navigation-1.3.md를 따른다. 소비자 발견/내 주문/채팅/내 정보, 생산자 현황/상품/채팅/환경설정. 주문은 `/orders`, 채팅 목록은 소식방/1:1 선택을 유지하며 활성 화면만 갱신한다. 앱 공통 메신저 행/헤더는 API를 직접 호출하지 않는다. 전체 cursor 수집은 취소·실패·반복 cursor를 처리한다. 새 API/DB 계약은 없다.


## DEV-3 공급 물량 승인 1.4 (현재 구현 기준)

제품·API 기준은 main에 먼저 머지한 PR #40의 `docs/spec/capacity-1.4.md`이며 위 1.2/1.3 기록에서 충돌하는 결정은 대체한다. 상품별 kg 입력을 정수 g로 전달하고 승인량과 판매 한도를 구분한다. 최초 승인만 상품을 공개하고 증액 심사 중에는 기존 판매를 유지한다. 가격은 신규 주문부터 즉시 반영하며 기존 결제 중량·가격 스냅샷은 보존한다(AC-04-8/9, AC-05-6, AC-09-6). 요청 버전과 멱등 키는 동일 본문 재시도에서 유지한다.

Mock 스키마 7은 단일 판매값·capacityRequests·주문 unitWeightGrams/releasedQuantity를 사용한다. 예전 승인 복제값·publish-request·박스 총 한도·런타임 마이그레이션은 제거한다. 로컬 공유 서버와 독립 브라우저 저장소를 지원하며 실제 서버는 DEV-4 범위다. 로그인 변경 시 탭 상태를 새로 만들고 비동기 이전 응답을 폐기한다.

소비자 주문 문구는 미확정 주문, 생산자 상품 그룹은 판매 중/심사 중/작성 중/판매 중지/판매 종료다. 배송 기간 변경은 미출하 결제 주문의 동의·환불 선택을 보존한다(R-21). 일반 상품 변경·가격 변경에 재승인을 요구하지 않는다.
