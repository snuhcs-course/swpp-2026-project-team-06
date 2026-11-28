# docs/collaboration spec

> 구현하는 기능: 없음(팀 안내 페이지) · 기준 규칙: `AGENTS.md` 전체
> 동작·규칙 원본은 `AGENTS.md`·`README.md`·`.github/CI.md`다. 여기와 페이지에 다시 쓰지 않는다.

## 역할
팀원용 협업 지도. 작업 순서와 사람·에이전트·자동의 몫을 적고, 규칙이 있는 절을 링크로 보여 준다. 두 판이고 영어판이 기본이다(11/27 오너 결정). main에 머지되면 GitHub Pages(설정의 legacy 빌드, main의 `/docs`)가 사용자 도메인 `docs.farmclub.kr`(`docs/CNAME`)로 올린다: 영어판 `https://docs.farmclub.kr/collaboration/`, 한국어판 `…/collaboration/ko/`. 옛 github.io 주소는 GitHub가 새 도메인으로 넘긴다.

## 구조
- `index.html` — 영어판, 기본 판(공개 주소 `/collaboration/`). 독자는 TA·평가자와 영어 `docs/wiki`를 읽는 사람까지. 규칙 문장의 원본은 이 페이지가 가리키는 한국어 문서(`AGENTS.md`, `.github/CI.md`)이므로, 영어판은 규칙을 영어로 풀어 쓰고 원문 절로 연결한다. 예외로 CI가 AGENTS.md와 글자 그대로 대조하는 `data-agents` 값(그리고 PR 본문에 그대로 쓰는 표지 `사람이 한 일:` 등)은 한국어 원문을 두고 바로 뒤 괄호에 영어 풀이를 붙인다. 줄 길이(본문 약 70~75자)와 줄바꿈 규칙만 영어에 맞춘다.
- `ko/index.html` — 한국어판(`/collaboration/ko/`). 구조·사실·링크·id·조판은 영어판과 같다.
- 두 판 공통: 빌드 없는 정적 HTML 한 파일씩. CSS는 안에, JS는 작게 안에(복사 버튼, 위 바의 현재 절 표시·제목 뒤 페이지 이름·다른 언어 링크에 지금 위치 싣기). JS가 없어도 모든 링크가 이동한다. 외부 요청은 글꼴 둘(jsDelivr의 Pretendard, Google Fonts의 IBM Plex Mono)뿐이고, 못 받으면 기기 글꼴(Apple SD Gothic Neo·Noto Sans KR·기기 고정폭)로 읽힌다. 절과 소절마다 id 하나, id는 바꾸지 않는다.
- 1200px 미만은 위 바(높이 48, 아래 가는 선): 페이지 이름(큰 제목이 지나간 뒤), `<details>` 차례, 언어 바꾸기 `EN | 한국어`. 1200px 이상은 위 바를 숨기고 화면 아래 가운데에 떠 있는 먹색 조작부(`.fc`) 하나(아래 22px + 안전 영역, 높이 44, 폭 320~480, 모서리 11, 토큰 `--fc-bg`·`--fc-fg`·`--fc-tint`·`--fc-shadow`, 어두운 테마는 종이색 면): `‹ ›` 이전·다음(절 순서, 작업 순서 안에서는 1~8단계 먼저), 지금 절·단계 라벨(맨 위에서는 페이지 이름, 누르면 목록), 언어 링크 둘, 아래 2px 진행선. 목록은 바와 같은 폭으로 8px 위에 열리고 작업 순서 아래에 여덟 단계를 어느 절에서든 펼쳐 보이며, 고르면·Esc·바깥 클릭으로 닫힌다. JS가 없으면 이전·다음 단추는 숨고 목록(`<details>`)과 언어 링크만 동작한다. 페이지 아래 여백 160px, 넓은 화면의 착지·고정 절 제목은 24px. 언어 링크는 실제 `<a>`(`hreflang`·`lang`)이고, 브라우저 언어로 옮기거나 선택을 저장하지 않는다(공유한 링크는 누구에게나 같은 판). `<link rel="alternate" hreflang>`에 `en`, `ko`, `x-default`(영어판). 다른 판을 가리키는 상대 링크(`ko/`, `../`, `./`)만 저장소 링크 형태의 예외다.
- 작업 순서 표의 행은 `step-1`~`step-8` id(두 판 같음)를 갖고, 행의 번호와 표 위 단계 줄, 본문의 "N단계"/"step N"이 그 행으로 가는 링크다. 모든 id는 `scroll-margin-top: 64px`로 바에 가리지 않는다.
- `tasks/` — 이 폴더 작업의 이슈 파일.

## 계약
- 페이지에 꼭 보여야 하는 AGENTS.md 값은 `data-agents="키"`를 단 요소로 쓴다. `scripts/ci/check-collaboration.mjs`가 CI `collaboration` job에서 매번 대조한다(PR·머지 큐는 막고, main push는 경고만).
  - 키마다 AGENTS.md 절과 받는 방식(text·set·count)은 `check-collaboration.mjs`의 `KEYS` 표 하나에 선언한다. 선언한 방식마다 페이지에 요소가 하나 이상 있어야 하고, 절을 못 찾거나 값을 못 뽑으면 실패한다.
  - text(기본): 요소의 글이 절에서 뽑은 값 중 하나와 같아야 하고, 뽑은 값은 모두 페이지에 있어야 한다(부분 문자열 비교 없음).
  - `data-check="set"`: 같은 키의 set 요소를 모은 이름 집합이 AGENTS.md에서 뽑은 집합과 같아야 한다.
  - `data-check="count"`: 숫자가 AGENTS.md에서 센 수와 같아야 한다. `<ol data-agents-list="키">`가 있으면 그 `<li>` 수도 같아야 한다.
  - HTML 주석 안은 보지 않고, hidden·`<template>` 안 요소, 빈 요소, 따옴표 없는 속성은 실패다. CSS로 숨긴 요소는 알아보지 못한다.
- 값 키: `branch`, `commit`, `pr-title`, `checks`, `high-risk`, `steps`, `skills`, `ai-log`, `spec-check`, `test-urls`, `stacking`.
- 두 판 모두 같은 값 검사와 링크 검사를 받는다. 대조(보고 키 `parity`, 대칭이라 어느 판도 예외가 아니다): 두 판의 id 집합(절·단계), 페이지 안 링크(`#…`, 바·단계 줄 포함) 집합, 저장소 링크 집합(`docs/collaboration/` 자기 링크 제외), `data-agents` 값(키·방식·글)과 목록 `<li>` 수가 같아야 한다. 한 판을 고치는 PR은 다른 판도 같이 고친다.
- 링크 검사(보고 키 `sections`): 바뀌지 않는 기록(`/pull/<n>`, `/issues/<n>`, `/actions/runs/<n>`, `/commit/<sha>`)은 형태만 보고, 그 밖의 저장소 링크는 `https://github.com/snuhcs-course/swpp-2026-project-team-06/(blob|tree|commits)/main/<경로>(#앵커)` 형태만 허용하고 파일과 제목 앵커가 있어야 한다. 페이지 안 `#앵커`는 id가 있어야 한다. 링크한 파일의 제목을 바꾸면 실패한다.
- 규칙을 바꾸는 PR은 같은 PR에서 페이지의 해당 요소를 고친다. 키를 늘리려면 `check-collaboration.mjs`의 `KEYS`에 한 줄 더하고 `test-check-collaboration.mjs`에 시나리오를 더한다.
- `docs/CNAME`(한 줄 `docs.farmclub.kr`)이 문서 사이트 전체의 사용자 도메인을 정한다. 두 판의 canonical·hreflang은 이 도메인의 절대 주소이고 `check-collaboration.mjs`가 `docs/` 아래 파일로 풀리는지, canonical이 그 판 자신인지 본다. 도메인을 바꾸면 `docs/CNAME`, 두 판 머리의 `<link>` 넷씩, 검사의 `SITE_URL`, `docs/wiki/_Sidebar.md` 링크를 같이 고친다.
- `docs/` 아래에 Jekyll 설정(`_config.yml`, `.nojekyll`)을 두지 않는다. 다른 페이지(랜딩 페이지)의 빌드가 바뀐다. 이 HTML은 front matter가 없어 Jekyll이 손대지 않고 그대로 내보낸다.

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 |
| --- | --- | --- | --- |
| 2026-11-23 | 원본은 정적 HTML 한 파일, 규칙은 링크로 가리키고 값만 `data-agents`로 표시 | 옛 페이지(저장소 밖, 10/07)가 낡은 원인이 옮겨 적기였다 | DEV-437 |
| 2026-11-23 | 어긋남 검사는 CI의 별도 job `collaboration`로 돌고 `ci-ok`가 모은다. PR·머지 큐는 막고 main push는 경고만 | 문서 전용 길에서도 매번 돌고 새 필수 체크가 필요 없다. 다른 job의 분류를 막지 않고, 문서 검사가 배포를 멈추지 않는다 | DEV-437 |
| 2026-11-23 | 절마다 규칙의 이유와 막는 실패를 먼저 쓰고, 근거는 저장소의 이슈 파일·ADR만 인용한다. 한계는 "알려진 한계" 절(#limits)에 모은다 | 규칙 나열만으로는 왜 지켜야 하는지가 안 보이고, 지어낸 근거는 신뢰를 잃는다 | DEV-437 |
| 2026-11-23 | 배포는 저장소 GitHub Pages(legacy, `/docs`). 워크플로를 새로 만들지 않는다 | 이미 켜져 있고, 고위험 경로를 늘리지 않는다 | DEV-437 |
| 2026-11-27 | 제안 v2 조판으로 다시 짰다: 12열 격자, 글꼴 Pretendard + IBM Plex Mono(jsDelivr 추가), 흐름을 표 하나(행 = 작업 순서 8단계, 열 = 사람·AI·자동·DEV-434 기록)로, 어미는 문서체(-다), 주황은 "승인" 표지에만 | PM 피드백("일잘러 느낌으로 명확하게, 담백하게", "AI 느낌 빼기"). 같은 흐름이 네 번 나왔고 글자의 절반이 13px였다. 어미는 페이지가 가리키는 AGENTS.md·CI.md와 맞췄다. 글꼴은 앱(`packages/ui`)과 같게 | DEV-437, 보드 `docs/design/proposals/DEV-437/redesign-v2*.html` |
| 2026-11-27 | 영어판을 두고, CI가 두 판을 같은 규칙으로 검사하고 id·링크·값을 대조한다 | 오너 요청(TA·영어 wiki 독자). 옮겨 적은 판은 낡기 쉬워(10/07 옛 페이지와 같은 원인) 한쪽만 고치면 CI가 막게 했다 | DEV-437 |
| 2026-11-27 | 영어판을 기본으로 `index.html`(`/collaboration/`)에, 한국어판을 `ko/index.html`(`/collaboration/ko/`)로 옮겼다. 대조는 대칭 | 오너 결정. 공개 주소를 여는 사람이 TA·평가자라 영어가 먼저. 규칙 문장의 원본은 여전히 한국어 AGENTS.md·CI.md라 영어판은 풀어 쓰고 연결한다 | DEV-437 |
| 2026-11-27 | 위 바(절 링크와 현재 절 표시, 언어 바꾸기 `EN \| 한국어`), 작업 순서 단계 id·단계 줄·단계 링크 | 오너 요청("원하는 단계로 쉽게 가고, KO/EN 전환 UI"). 현재 절 표시는 절이 화면보다 길어 IntersectionObserver 비율 문턱 대신 스크롤마다 한 번 계산한다. 언어 링크는 JS가 있으면 지금 절·단계 id를 실어 같은 자리로 간다 | DEV-437, 보드 `docs/design/proposals/DEV-437/nav-and-switch.html` |
| 2026-11-27 | 넓은 화면(1200px 이상)의 절 링크 여덟 줄 바를 빼고, 본문 오른쪽 위 작은 묶음(차례 · EN \| 한국어)으로 바꿨다. 좁은 화면 바는 그대로 | 오너 피드백 "모바일은 좋은데 데스크톱 위 바는 별로". 사이트 내비게이션처럼 보였다. 묶음이 표 글자를 덮지 않게 아래로 스크롤하는 동안 숨긴다 | DEV-437, 보드 `nav-and-switch.html` |
| 2026-11-27 | 넓은 화면의 오른쪽 위 묶음을 빼고 화면 아래 가운데 떠 있는 조작부로 바꿨다 | 오너 제안("Figma처럼 가운데"). 앵커가 화면 위로 착지하니 아래에 둬야 방금 간 제목을 가리지 않는다. 오른쪽 위 묶음은 표 오른쪽 끝 글자 위에 앉았다 | DEV-437, 보드 `nav-and-switch.html` |
| 2026-11-27 | 떠 있는 조작부를 먹색 면 두 부분(이전·다음과 지금 절 라벨 | 언어)과 단계가 보이는 목록, 진행선으로 다시 디자인했다 | 오너 피드백 "가운데 위치는 좋은데 UI를 개선". 흰 면 세 칸은 기본 표처럼 보였고 밑줄이 둘, 목록이 바보다 넓고 행마다 선이 있었다 | DEV-437, 보드 `nav-and-switch.html` "조작부 디자인" |
| 2026-11-27 | 다시 디자인한 조작부 승인. 목록의 작업 순서 여덟 단계는 어느 절에서든 펼쳐 둔다 | 오너가 캡처와 라이브 페이지로 보고 승인("좋은데? 마무리하고 PR 머지하자"). 어느 단계든 어디서나 두 번 누르면 간다 | DEV-437 |
| 2026-11-27 | 폴더·공개 경로를 `docs/guide/` → `docs/collaboration/`(`/collaboration/`, `/collaboration/ko/`)로, 검사 스크립트를 `check-collaboration.mjs`로, CI job을 `collaboration`으로 바꿨다 | 오너 요청: 주소가 페이지가 무엇인지 말해야 한다. `ci-ok`는 job 결과를 이름 없이 모으고 ruleset 필수 체크가 아니라 바꿔도 안전하다. 사용자 도메인은 따로 정하며, 페이지는 상대 링크만 써서 도메인이 바뀌어도 고칠 곳이 없다 | DEV-437 |
| 2026-11-27 | 문서 사이트를 GitHub Pages 사용자 도메인 `docs.farmclub.kr`로(`docs/CNAME`). canonical·hreflang을 이 주소로 | 오너 결정. DNS 레코드(Cloudflare `CNAME docs → snuhcs-course.github.io`, 프록시 끔)와 Pages의 Enforce HTTPS는 사람이 한다. DNS가 풀린 뒤에 머지한다. 옛 `farmclub-guide.vercel.app`은 이 주소로 넘긴다 | DEV-437 |
