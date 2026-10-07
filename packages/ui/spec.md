# packages/ui spec

> 구현하는 기능: 공용(두 앱의 모든 SCR) · 지키는 규칙: N-01, N-02
> 레이블 원본: docs/spec/ia.md 4장 "레이블", 문구 원본: docs/spec/policy.md (여기에 다시 쓰지 않는다)

## 역할
소비자 앱·생산자 앱이 함께 쓰는 컴포넌트와 디자인 토큰. 패키지 이름은 `@farmclub/ui`.

## 구조
- `src/tokens.ts` — 글자 크기·누르는 영역·간격·색. 값의 원본은 `docs/design/README.md` 토큰 표다. N-02 하한(본문 16px 이상, 누르는 영역 48px 이상)을 지킨다.
- `src/Button.tsx` — 기본 버튼. 높이·너비 최소 48px.
- `src/Placeholder.tsx` — 뼈대 화면용. "SCR-xx 화면 이름 · FEAT-xx"를 보여준다. 기능 화면이 생기면 쓰지 않는다.
- `src/index.ts` — 공개 export.

## 계약
- 앱은 `import { Button, Placeholder, tokens } from "@farmclub/ui"`로만 쓴다. 내부 파일 경로를 직접 import하지 않는다.
- 글자 단계는 본문 17, 입력 16, 보조 15, 메타(날짜·칩·탭·‘n명 예약’·시각) 15(screens.md 3장, 디자인 토큰). 13은 쓰지 않는다. 누를 수 있는 요소는 `tokens.touchTarget.min`(48) 이상이고, 보이는 크기가 작으면 여백·hitSlop으로 넓힌다(N-02).
- 간격은 4 단위(4·8·12·16·20·24·32·40) 토큰만 쓴다. 썸네일은 104·64·40 세 가지, 사진이 없으면 자리 표시.
- 글꼴은 Pretendard 가변 웹폰트(한글 서브셋)를 첫 순위로, `color-scheme: light`, PC는 최대 폭 480 가운데 정렬, 위·아래는 안전 영역을 더한다.
- 부품 상태: 버튼 눌림·로딩·비활성, 입력 포커스·비활성·오류, 키보드 포커스 링, 팔로우 토글, 토스트(성공·공통 오류). 규격은 `docs/design/screens/ds.html`.
- 탭·버튼·상태 이름은 ia.md 4장 레이블을 쓴다(예: ‘예약하기’, ‘품절’, ‘받는 시기’). 쓰지 않는 말(구매하기, 매진 등)은 쓰지 않는다.
- `react`, `react-native`는 peerDependencies. 앱이 가진 버전을 쓴다.

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | 빌드 없이 TS 소스(`src/index.ts`)를 `main`으로 둔다 | Metro가 워크스페이스 TS를 바로 번들, 설정 최소 | — |
| 2026-10-07 | 나머지 수치(색·간격·제목 크기)는 화면 명세(P21)가 정하면 `tokens.ts`만 고친다 | N-02는 하한만 정함 | — |
| 2026-10-07 | 토큰을 확정 디자인(`docs/design/README.md`)에 맞춘다: 메타 15, 누르는 영역 48, 4 단위 간격, 썸네일 3종, Pretendard, 부품 상태 | SWPP-81(screens.md 1.1 결정 35, 디자인 평가) | — |
