# Spec-to-code check

## 기준과 범위

- 요구사항: [DEV-40](https://linear.app/sswp6/issue/DEV-40), 설계: [SWPP-90](https://linear.app/sswp6/issue/SWPP-90).
- 기존 `.github/pull_request_template.md`의 Spec ↔ Code 표와 사람 확인란을 사용한다. 제품 FEAT/AC를 새로 정의하지 않는다.
- 제품 AI 어댑터와 분리한 CI 전용 읽기·보고 클라이언트다. 제품 코드, 키, 기존 CI를 변경하지 않는다.

## 구현 결정

| 항목 | 결정 |
| --- | --- |
| 실행 | main 대상 pull_request. fork/봇 제외. 실제 모델 job은 보호된 spec-check 환경 승인 후 실행 |
| 활성화 | repository variable SPEC_CHECK_ENABLED=true일 때만 live job 실행. 기본은 SKIPPED이며 PASS를 뜻하지 않음 |
| 권한 | contents/pull-requests read. model job은 환경 보호 검증용 actions read 추가. 자동 코멘트·수정·승인·머지 없음 |
| 입력 | 고정한 base/head/merge-base, PR 본문 digest, 기존 표에서 참조한 스펙·구현·tasks, 실제 변경 파일·주변 코드 |
| 범위 | PR 표의 명시적 repo 경로. 빠진 변경·문맥·상충 기준은 INCOMPLETE. 필요하면 표의 기존 셀에 backtick 경로를 추가 |
| 호출 | Python 표준 라이브러리의 Claude Messages API. 전용 SPEC_CHECK_API_KEY와 명시적 SPEC_CHECK_MODEL. fallback 없음 |
| 결과 | PASS/MISMATCH/INCOMPLETE/SKIPPED. 근거 위치·인용·변경 파일 coverage 검증. 오류를 PASS로 바꾸지 않음 |
| 제한 | 입력 60 KiB, 출력 4096 tokens, 요청 60초, transient 오류 retry 1회, job 5분 |
| 보고 | Markdown job summary + JSON/Markdown artifact 7일. 보고서와 사람 판단을 PR에 남김 |
| 증거 | mock 기반 계약 검증과 genuine API 데모를 구분. 모델 접근·사람 검토가 없으면 완료 처리하지 않음 |

변경된 스펙의 이전 버전과 base 쪽 관련 변경도 읽는다. 기준 충돌은 사람이 해소한다. head SHA나 PR 본문이 바뀌면 기존 결과를 최신 증거로 쓰지 않는다.
