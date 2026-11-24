# docs/guide spec

> 구현하는 기능: 없음(팀 안내 페이지) · 기준 규칙: `AGENTS.md` 전체
> 동작·규칙 원본은 `AGENTS.md`·`README.md`·`.github/CI.md`다. 여기와 페이지에 다시 쓰지 않는다.

## 역할
팀원용 협업 지도(`index.html`) 한 장. 이슈 하나가 운영에 닿기까지의 흐름과, 규칙이 있는 절을 링크로 보여 준다. main에 머지되면 GitHub Pages(설정의 legacy 빌드, main의 `/docs`)가 `https://snuhcs-course.github.io/swpp-2026-project-team-06/guide/`로 올린다.

## 구조
- `index.html` — 빌드 없는 정적 HTML 한 파일. CSS는 안에, JS는 복사 버튼만, 외부 요청은 Google Fonts만. 절마다 `<section id>` 하나.
- `tasks/` — 이 폴더 작업의 이슈 파일.

## 계약
- 페이지에 꼭 보여야 하는 AGENTS.md 값은 `data-agents="키"`를 단 요소로 쓴다. `scripts/ci/check-guide.mjs`가 CI `guide` job에서 매번 대조한다(PR·머지 큐는 막고, main push는 경고만).
  - 키마다 AGENTS.md 절과 받는 방식(text·set·count)은 `check-guide.mjs`의 `KEYS` 표 하나에 선언한다. 선언한 방식마다 페이지에 요소가 하나 이상 있어야 하고, 절을 못 찾거나 값을 못 뽑으면 실패한다.
  - text(기본): 요소의 글이 절에서 뽑은 값 중 하나와 같아야 하고, 뽑은 값은 모두 페이지에 있어야 한다(부분 문자열 비교 없음).
  - `data-check="set"`: 같은 키의 set 요소를 모은 이름 집합이 AGENTS.md에서 뽑은 집합과 같아야 한다.
  - `data-check="count"`: 숫자가 AGENTS.md에서 센 수와 같아야 한다. `<ol data-agents-list="키">`가 있으면 그 `<li>` 수도 같아야 한다.
  - HTML 주석 안은 보지 않고, hidden·`<template>` 안 요소, 빈 요소, 따옴표 없는 속성은 실패다. CSS로 숨긴 요소는 알아보지 못한다.
- 값 키: `branch`, `commit`, `pr-title`, `checks`, `high-risk`, `steps`, `skills`, `ai-log`, `spec-check`, `test-urls`, `stacking`.
- 링크 검사(보고 키 `sections`): 바뀌지 않는 기록(`/pull/<n>`, `/issues/<n>`, `/actions/runs/<n>`, `/commit/<sha>`)은 형태만 보고, 그 밖의 저장소 링크는 `https://github.com/snuhcs-course/swpp-2026-project-team-06/(blob|tree|commits)/main/<경로>(#앵커)` 형태만 허용하고 파일과 제목 앵커가 있어야 한다. 페이지 안 `#앵커`는 id가 있어야 한다. 링크한 파일의 제목을 바꾸면 실패한다.
- 규칙을 바꾸는 PR은 같은 PR에서 페이지의 해당 요소를 고친다. 키를 늘리려면 `check-guide.mjs`의 `KEYS`에 한 줄 더하고 `test-check-guide.mjs`에 시나리오를 더한다.
- `docs/` 아래에 Jekyll 설정(`_config.yml`, `.nojekyll`)을 두지 않는다. 다른 페이지(랜딩 페이지)의 빌드가 바뀐다. 이 HTML은 front matter가 없어 Jekyll이 손대지 않고 그대로 내보낸다.

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 |
| --- | --- | --- | --- |
| 2026-11-23 | 원본은 정적 HTML 한 파일, 규칙은 링크로 가리키고 값만 `data-agents`로 표시 | 옛 페이지(저장소 밖, 10/07)가 낡은 원인이 옮겨 적기였다 | DEV-437 |
| 2026-11-23 | 어긋남 검사는 CI의 별도 job `guide`로 돌고 `ci-ok`가 모은다. PR·머지 큐는 막고 main push는 경고만 | 문서 전용 길에서도 매번 돌고 새 필수 체크가 필요 없다. 다른 job의 분류를 막지 않고, 문서 검사가 배포를 멈추지 않는다 | DEV-437 |
| 2026-11-23 | 절마다 규칙의 이유와 막는 실패를 먼저 쓰고, 근거는 저장소의 이슈 파일·ADR만 인용한다. 한계는 "알려진 한계" 절(#limits)에 모은다 | 규칙 나열만으로는 왜 지켜야 하는지가 안 보이고, 지어낸 근거는 신뢰를 잃는다 | DEV-437 |
| 2026-11-23 | 배포는 저장소 GitHub Pages(legacy, `/docs`). 워크플로를 새로 만들지 않는다 | 이미 켜져 있고, 고위험 경로를 늘리지 않는다 | DEV-437 |
