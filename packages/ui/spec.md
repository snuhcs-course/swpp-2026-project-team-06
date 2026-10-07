# packages/ui spec

> 구현하는 기능: 공용(두 앱의 모든 SCR) · 지키는 규칙: N-01, N-02
> 레이블 원본: docs/spec/ia.md 4장 "레이블", 문구 원본: docs/spec/policy.md (여기에 다시 쓰지 않는다)

## 역할
소비자 앱·생산자 앱이 함께 쓰는 컴포넌트와 디자인 토큰. 패키지 이름은 `@farmclub/ui`.

## 구조
- `src/tokens.ts` — 글자 크기·누르는 영역·간격·색. N-02 하한(본문 16px 이상, 누르는 영역 48px 이상)을 상수로 둔다.
- `src/Button.tsx` — 기본 버튼. 높이·너비 최소 48px.
- `src/Placeholder.tsx` — 뼈대 화면용. "SCR-xx 화면 이름 · FEAT-xx"를 보여준다. 기능 화면이 생기면 쓰지 않는다.
- `src/index.ts` — 공개 export.

## 계약
- 앱은 `import { Button, Placeholder, tokens } from "@farmclub/ui"`로만 쓴다. 내부 파일 경로를 직접 import하지 않는다.
- 본문 글자는 `tokens.fontSize.body`(16) 이상, 누를 수 있는 요소는 `tokens.touchTarget.min`(48) 이상(N-02).
- 탭·버튼·상태 이름은 ia.md 4장 레이블을 쓴다(예: ‘예약하기’, ‘품절’, ‘받는 시기’). 쓰지 않는 말(구매하기, 매진 등)은 쓰지 않는다.
- `react`, `react-native`는 peerDependencies. 앱이 가진 버전을 쓴다.

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | 빌드 없이 TS 소스(`src/index.ts`)를 `main`으로 둔다 | Metro가 워크스페이스 TS를 바로 번들, 설정 최소 | — |
| 2026-10-07 | 나머지 수치(색·간격·제목 크기)는 화면 명세(P21)가 정하면 `tokens.ts`만 고친다 | N-02는 하한만 정함 | — |
