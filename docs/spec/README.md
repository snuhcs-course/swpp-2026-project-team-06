# docs/spec — 스펙 문서 안내

farmclub 스펙 문서의 원본이다(한글). 위키(`docs/wiki/`)는 TA용 영문 요약이고, 원본을 바꾼 PR에서 함께 갱신한다. 에이전트 공통 규칙은 루트 `AGENTS.md`를 따른다.

## 문서 위치

| 문서 | 경로 | 담는 것 |
| --- | --- | --- |
| PRD | [prd.md](./prd.md) | 문제, 목표, 사용자, 시나리오, 기능 목록(P0~P2), 원칙, 비기능 요구사항, 미결 사항 |
| IA·사용자 흐름 | [ia.md](./ia.md) | 앱별 사이트맵, 화면 목록(SCR), 콘텐츠 구성, 내비게이션·레이블, 흐름, 예외 경로, 접근 권한 |
| 화면 명세 | [screens.md](./screens.md) | 화면별 목적·요소·데이터·입력·출력·버튼 동작·빈 상태·오류, I1 우선순위, API 계약(오류 형식, 페이지네이션, 멱등 키) |
| 기능 명세 | [functional/README.md](./functional/README.md) | 기능 파일 목록, 추적표, 열린 질문(FQ) |
| 규칙 전문 | [functional/rules.md](./functional/rules.md) | R-01~R-25(거래·환불·정산), M-01~M-17(소통·AI) |
| 기능별 명세 | `functional/FEAT-xx-*.md` | 사전·사후 조건, 정상·예외 흐름, 검증, 인수 조건(Given/When/Then) |
| 서비스 정책 | [policy.md](./policy.md) | 사용자에게 보일 정책·문구, 개인정보 요지, 법정 표시, 열린 질문(PQ) |
| 기술 스택 | [tech-design/stack.md](./tech-design/stack.md) | 스택, 레포 구조, FEAT ↔ 코드 폴더 대응표, 핵심 흐름 |
| 기술 설계 | [tech-design/README.md](./tech-design/README.md) | 데이터 모델, 주문 상태, 트래킹 플랜 초안. 결정 기록은 `tech-design/adr/` |
| 근거 | [evidence.md](./evidence.md) | 가설 판정과 근거 |

## 읽는 순서

기능 하나를 작업할 때:

1. [prd.md](./prd.md) — 범위와 원칙
2. 해당 `functional/FEAT-xx-*.md` — 동작과 인수 조건
3. [functional/rules.md](./functional/rules.md) — FEAT 파일이 가리키는 규칙
4. 화면이 걸리면 [ia.md](./ia.md)의 해당 SCR과 [screens.md](./screens.md)의 화면·API
5. 작업하는 코드 폴더의 `spec.md`와 `tasks.md`

## 문서끼리 다를 때

- 범위와 우선순위는 PRD, 규칙의 내용은 `rules.md`, 화면 구조는 IA, 화면 안 요소·동작과 API 계약은 `screens.md`, 사용자 문구는 `policy.md`가 정한다.
- 다른 점을 발견하면 추측해서 구현하지 않고, 같은 PR에서 문서를 고치거나 PR에 질문으로 남긴다.

## 두 층 스펙

| 층 | 무엇 | 어디 |
| --- | --- | --- |
| 무엇을 만드나 | 동작, 규칙, 인수 조건 | 이 폴더 (`docs/spec/`) |
| 어떻게 만드나 | 구현 결정(`spec.md`), 이슈별 작업 기록(`tasks.md`) | 기능을 구현하는 코드 폴더 |

코드 폴더의 `spec.md`는 FEAT·규칙 ID만 적고 내용을 다시 쓰지 않는다. `tasks.md`는 Linear 이슈별 섹션을 쌓고 머지 후에도 남긴다. FEAT와 코드 폴더의 대응표는 [기술 스택 4장](./tech-design/stack.md#4-feat--코드-폴더)에 둔다.

## ID

| 접두어 | 뜻 | 정의된 곳 |
| --- | --- | --- |
| FEAT-xx | 기능 | PRD 7.1, functional/ |
| R-xx, M-xx | 거래·소통 규칙 | functional/rules.md |
| N-xx | 비기능 요구사항 | PRD 7.3 |
| SCR-xx | 화면 | IA 2장, 화면 명세 5·6장 |
| AC-xx-n | 인수 조건 | FEAT 파일 |
| S-x, F-x | 시나리오, 사용자 흐름 | PRD 6장, IA 5장 |
| Q-xx, IA-Qx, FQ-xx, PQ-xx | 열린 질문 | 각 문서 끝 |

커밋·PR에는 Linear 키와 관련 ID를 적고, 테스트 이름에는 AC ID를 넣는다(예: `test_AC_09_1_last_item_concurrent_payment`).
