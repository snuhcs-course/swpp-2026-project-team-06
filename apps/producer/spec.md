# apps/producer spec

> 구현하는 기능: FEAT-01, FEAT-02, FEAT-03, FEAT-04, FEAT-05, FEAT-12, FEAT-13, FEAT-14, FEAT-15, FEAT-17, FEAT-19 · 지키는 규칙: R-05, R-06, R-15, R-17, R-18, R-19, R-20, R-21, R-22, R-23, R-25, M-01, M-09, M-11, M-12, M-13, M-14, N-01, N-02, N-04, N-06
> 동작·규칙·인수 조건 원본: docs/spec/functional/ (여기에 다시 쓰지 않는다)
> 화면·경로·레이블 원본: docs/spec/ia.md 2장·4장·6장, 화면별 명세·API: docs/spec/screens.md 6장·7장, FEAT ↔ 폴더: docs/spec/tech-design/stack.md 4장

## 역할
생산자 앱(모바일 웹). Expo + Expo Router 웹 출력으로 만들고 Vercel에 정적 배포한다(ADR 0001). 로그인 SCR-05, 가입·대기 SCR-20·21, 승인 후 화면 SCR-22~30을 맡는다.

## 구조
- `src/app/` — Expo Router 라우트. 파일 하나가 화면 하나다.
- 하단 탭 4개(ia.md 4장): 현황(SCR-22) · 상품(SCR-23) · 질문함(SCR-28) · 농가(SCR-30). `src/app/(tabs)/_layout.tsx`
- 탭 밖 화면은 루트 Stack에 둔다: 로그인, 가입 신청, 승인 대기, 소식 올리기, 출하 처리.
- 승인 전 생산자는 SCR-21(승인 대기)만 열린다(ia.md 6장, AC-01-3). 탭 그룹 진입 시 막는 처리는 DEV-3, 서버 검사는 DEV-4(N-06).

| SCR | 화면 | 경로 | 파일 | FEAT |
| --- | --- | --- | --- | --- |
| SCR-05 | 로그인 | `/login` | `src/app/login.tsx` | FEAT-01 |
| SCR-20 | 가입 신청 | `/apply` | `src/app/apply.tsx` | FEAT-01 |
| SCR-21 | 승인 대기 | `/pending` | `src/app/pending.tsx` | FEAT-01 |
| SCR-22 | 현황(홈) | `/` | `src/app/(tabs)/index.tsx` | FEAT-14 |
| SCR-23 | 상품 목록 | `/products` | `src/app/(tabs)/products/index.tsx` | FEAT-04 |
| SCR-24 | AI 상품 초안 | `/products/new` | `src/app/(tabs)/products/new.tsx` | FEAT-03 |
| SCR-25 | 상품 편집 | `/products/:id/edit` | `src/app/(tabs)/products/[id]/edit.tsx` | FEAT-04 |
| SCR-26 | 단계·가격·물량 | `/products/:id/stages` | `src/app/(tabs)/products/[id]/stages.tsx` | FEAT-05 |
| SCR-27 | 소식 올리기 | `/broadcast/new` | `src/app/broadcast/new.tsx` | FEAT-12, 15 |
| SCR-28 | 질문함 | `/questions` | `src/app/(tabs)/questions.tsx` | FEAT-13 |
| SCR-29 | 출하 처리 | `/ship` | `src/app/ship.tsx` | FEAT-17 |
| SCR-30 | 농가 프로필·링크 | `/farm` | `src/app/(tabs)/farm.tsx` | FEAT-02, 19 |

## 계약
- 공용 컴포넌트·토큰은 `@farmclub/ui`(packages/ui), 서버 호출은 `@farmclub/api`(packages/api)만 쓴다.
- 서버 주소는 `EXPO_PUBLIC_API_URL`(packages/api spec).
- 농가 탭에서 복사하는 링크는 서버의 `/s/farms/<id>`다(ADR 0006). 소비자 앱 주소를 직접 복사하지 않는다.
- I1 로그인은 테스트 계정 선택(`GET /api/auth/test-accounts`, `POST /api/auth/test-login`, ADR 0009). 승인된 생산자·승인 대기 생산자 계정이 시드에 있다. 카카오 리다이렉트 `/auth/kakao`는 I2.
- 출하 처리(SCR-29)는 주문별 ‘출하로 바꾸기’ + 송장 번호. 생산자는 배송 완료로 바꾸지 못한다(R-19). 자연어 입력은 I2.
- 쓰는 API는 screens.md 7.2.

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | 라우트는 `src/app/`, 탭 화면은 `(tabs)` 그룹(상품 탭은 Stack). 로그인·가입·대기·소식 올리기·출하 처리는 탭 밖 루트 Stack | ia.md 2장 경로와 4장 탭 구성을 함께 지킴 | — |
| 2026-10-07 | 웹 출력은 `web.output: "single"`(SPA). Vercel rewrite는 DEV-8 | 정적 호스팅, 동적 경로 | — |
| 2026-10-07 | Expo는 SDK마다 바뀌므로 docs.expo.dev의 버전별 문서를 확인하고, 패키지는 반드시 `npx expo install`로 추가한다 | create-expo-app이 만든 AGENTS.md 규칙을 루트 AGENTS.md 하나로 합치며 옮김 | — |
| 2026-10-07 | DEV-12의 화면은 `Placeholder`로 "SCR-xx 화면 이름 · FEAT-xx"만 보여준다. 승인 전 잠금은 아직 없음 | 뼈대 이슈, 기능은 DEV-3·DEV-4 | AC-01-3 |
| 2026-10-07 | SCR-27 레이블을 ‘소식 올리기’로, SCR-29는 상태 변경 + 송장(자연어 I2), 로그인은 테스트 계정 | P22 결정(SWPP-26) | AC-17-2, AC-17-4 |
