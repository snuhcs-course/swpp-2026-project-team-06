# apps/consumer tasks

이슈별 작업 기록. 새 작업은 맨 아래에 섹션을 추가하고, 머지 후에도 지우지 않는다.

## DEV-12 [I1] 구현 뼈대: apps·packages·server 폴더와 폴더별 spec.md

- 이슈: [DEV-12](https://linear.app/sswp6/issue/DEV-12) (GitHub #19)
- 브랜치: `nemodleo/dev-12-i1-구현-뼈대-appspackagesserver-폴더와-폴더별-specmd`
- 기능·인수 조건: 없음(뼈대). 화면 자리: SCR-01~05, SCR-10~17 / FEAT-01, 02, 06~13, 15, 19
- 상태: 진행 중

### 목표
DEV-3(프론트) 구현을 바로 시작할 수 있게, ia.md 2장 경로대로 화면 자리가 있는 빈 소비자 앱(Expo Router 웹 출력)을 만든다.

### 범위 (수정 허용 경로)
- `apps/consumer/**`

### 비범위 (건드리지 않음)
- 화면 기능·디자인, 카카오 로그인(`/auth/kakao`), 로그인 관문 (DEV-3·DEV-4)
- Vercel 배포·rewrite(DEV-8), CI(DEV-9)
- `apps/producer/**`, `packages/**`(각자 tasks.md)

### 결정 사항
- 10/07 라우트는 `src/app/`, 탭은 `(tabs)` 그룹(농가·메시지·주문은 탭별 Stack). 상세 경로표는 spec.md
- 10/07 create-expo-app이 만든 `.git`, `.claude`, `LICENSE`, `AGENTS.md`는 지운다. Expo 규칙 한 줄은 spec.md "구현 결정"으로 옮김
- 10/07 생성물에 `CLAUDE.md`(`@AGENTS.md` 한 줄)도 있어 함께 지움. AGENTS.md를 지우면 import가 깨지므로
- 10/07 create-expo-app은 빈 폴더에만 만들어서, spec.md·tasks.md를 잠시 옮겨 두고 생성한 뒤 되돌림
- 10/07 Expo SDK 57(expo ~57.0.27, expo-router ~57.0.25, react-native 0.86.3). package name은 `@farmclub/<앱>`, `typecheck` 스크립트 추가

### 작업
- [x] `spec.md` 작성
- [x] `npx create-expo-app@latest apps/consumer --template blank-typescript --no-install`, 생성물 정리
- [x] `npx expo install` expo-router 등, `main: expo-router/entry`, `App.tsx`·`index.ts` 삭제
- [x] `app.json`: name·slug `farmclub-consumer`, scheme, `experiments.typedRoutes`, `web.output: "single"`
- [x] `src/app/` 화면 13개 Placeholder, 하단 탭 4개(농가·메시지·주문·내 정보)
- [x] `npx tsc --noEmit`, `npx expo export -p web` 성공

### 완료 조건
- [x] Expo Router 웹 출력으로 실행되는 빈 앱(탭 4개 자리, 로그인 자리)
- [x] `spec.md`(구현할 FEAT·규칙, 구조, 계약)
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/07 spec.md·tasks.md 먼저 커밋
- 10/07 뼈대 완료: `npx tsc --noEmit`, `npx expo export -p web` 성공. `expo start --web`에서 `/`, `/farms/123`, `/checkout/1/pay`, `/orders/9/done` 화면과 탭 4개 확인, 콘솔 오류 없음

## DEV-3 [I1-P23] Implement frontend (prototype)

- 이슈: [DEV-3](https://linear.app/sswp6/issue/DEV-3)
- 상태: 시작 전 — 아래는 SWPP-26(P22 스펙 확정)에서 넘어온 할 일만 미리 적었다. 시작할 때 `spec` 스킬로 목표·범위·완료 조건을 채운다
- 기준 문서: `docs/spec/screens.md`(화면·API), Must 범위는 screens.md 4장

### SWPP-26에서 넘어온 할 일
- [ ] 하단 탭을 발견(SCR-01) · 소식(SCR-18) · 채팅(SCR-15) · 내 정보(SCR-17)로 바꾸기: `src/app/(tabs)/_layout.tsx`
- [ ] 라우트 옮기기(spec.md 경로표): `src/app/index.tsx`(랜딩) → `(tabs)/index.tsx`(홈·발견), `(tabs)/inbox/*` → `(tabs)/chats/*`, `(tabs)/orders/*` → `(tabs)/me/orders/*`, `(tabs)/me.tsx` → `(tabs)/me/index.tsx`, 새 `(tabs)/news.tsx`(SCR-18)
- [ ] Placeholder 제목·레이블을 ia.md 4장대로(소비자 화면에 ‘메시지’ 없음: 메시지함 → 채팅 목록, 농가 대화 → 농가 채팅)
- [ ] SCR-05를 테스트 계정 선택 화면으로(ADR 0009). 카카오 리다이렉트 `/auth/kakao` 라우트는 만들지 않음(I2)
- [ ] 로그인 관문: 팔로우·예약하기·채팅하기·좋아요, 소식·채팅·내 정보 탭 → SCR-05 → 원래 행동으로 복귀
- [ ] ‘틀렸어요’ 버튼은 만들지 않음(M-17, I2)
