# Spec-to-code check tasks

## DEV-40 [I2-T23] Disabled-by-default spec-to-code checker infrastructure

- 이슈: https://linear.app/sswp6/issue/DEV-40
- 설계: https://linear.app/sswp6/issue/SWPP-90
- 브랜치: `violetsunshades/dev-40-i2-t23-add-an-ai-assisted-spec-to-code-github-actions-check`
- 기능·인수 조건: infra. 사용자 승인 분리 후 DEV-40은 비활성 기본값의 구현·계약 검증·문서·사람 승인/머지를 완료한다. 실제 모델 증거는 DEV-55.
- 상태: 리뷰 중 (사람 승인·머지 대기)

### 목표
명시된 스펙과 PR 코드의 불일치를 보고할 기반을 비활성 기본값으로 제공한다. API 논의는 다른 개발과 core 머지를 막지 않게 후속 이슈로 진행한다.

### 범위 (수정 허용 경로)
- `.github/spec-check/**` — 수집기·모델 클라이언트·검증·프롬프트·계약 검증·격리된 데모·설명
- `.github/workflows/spec-check.yml` — 별도 workflow
- `.github/spec.md`, `.github/tasks.md` — 이 CI 작업의 결정과 이슈 기록만 추가
- `AGENTS.md` — 제품 AI 규칙에 CI 전용 클라이언트 범위를 명시하는 한 줄

### 비범위
- 앱·서버·제품 스펙·기존 CI/wiki-sync·의존성 파일
- repository settings, secrets, billing, 자동 머지/사람 승인 대행

### 결정 사항
- 2026-10-16 기존 PR #106은 merged이며 과거 tasks 상태는 수정하지 않는다. DEV-9/DEV-25/SWPP-89 모두 Linear Done 확인.
- 2026-10-16 root .github의 기존 기록을 보존하고 전용 하위 폴더에서 구현한다.
- 2026-10-16 spec-check 환경/키는 없음. 현재 GitHub 계정은 maintain 권한이며 admin은 아님. 임의 키 탐색·과금 활성화를 하지 않는다.
- 2026-10-16 보호 환경 승인자는 실행할 checker/프롬프트/workflow의 정확한 commit을 확인한다. 키는 live 호출 단계에만 전달한다.
- 2026-10-16 제품 AI 규칙의 CI 예외는 이 PR의 명시적 review point로 기록한다.
- 2026-10-16 모델 job에 환경 설정 확인용 actions: read만 추가한다. required reviewers와 prevent-self-review가 없으면 호출을 중단한다.
- 2026-10-16 비용 없는 계약 검증은 DEV-40/SWPP-90의 실패 처리·증거 요구사항에 포함한다. mock 결과를 genuine 모델 결과로 사용하지 않는다.
- 2026-10-16 사용자 결정: live runs pending. repository variable SPEC_CHECK_ENABLED=true인 경우만 live job을 실행한다. 기본 SKIPPED를 모델 PASS로 해석하지 않는다.
- 2026-10-16 사용자 승인 scope split: live API 설정·genuine mismatch/PASS·실제 모델 finding의 사람 판단을 [DEV-55](https://linear.app/sswp6/issue/DEV-55)로 이전한다. DEV-55가 core 완료 후 진행되며 DEV-40의 머지를 막지 않는다. 원래 요구사항은 후속 이슈에 보존한다.
- 2026-10-16 기존 feature branch가 checker 파일 없이 생성되었어도 실행할 수 있도록 workflow 실행 코드는 GitHub의 고정 test-merge SHA에서 읽는다. 검토 대상 파일은 계속 captured PR head/base에서 읽고 runner SHA를 보고서 metadata에 별도로 기록한다.

### 작업
- [x] 이슈·설계·기존 PR 템플릿/스펙 읽기, 범위 기록
- [x] 수집기/결과 검증/Claude 클라이언트와 workflow 구현
- [x] deterministic 계약 검증 및 실패 처리 확인
- [x] AI 1차 리뷰 및 수정 (작성자 Codex 검토, PR 본문에 결과 기록; 독립 사람 검토 아님)
- [x] actual model mismatch/pass run과 finding resolution을 DEV-55로 이전 (실행 완료를 뜻하지 않음)

### 완료 조건
- [x] workflow PR 및 credential-free CI 결과
- [x] live job 기본 비활성 및 기존 CI 유지
- [x] API 준비·실제 모델 증거는 독립 후속 DEV-55에 기록
- [ ] 사람 1명 승인 후 main 머지

### 기록
- 2026-10-16 계획 작성. 실제 모델 접근·설계 승인 미확인. 확인 안 된 시간·토큰·승인은 기록하지 않는다.
- 2026-10-16 draft PR #107 생성. 로컬 계약 검증 26개 통과, actionlint v1.7.12의 workflow 구문 검사 통과(shellcheck 별도 도구는 미설치). 제품 workflow 및 코드 변경 없음.
- 2026-10-16 작성자 AI 검토에서 hidden artifact 기본 제외를 발견하여 두 report 파일만 명시적으로 허용했다. 삭제 파일의 인용 revision도 보고 metadata에 보존한다.
- 2026-10-16 GitHub checker-tests 및 기존 CI jobs 통과. 키/모델 없음은 INCOMPLETE로 보고되고 artifact 3개를 보존한 것을 확인했다. genuine mismatch/PASS·사람 판단은 미완료. 상세 run 링크는 EVIDENCE.md.
- 2026-10-16 core merge와 live commissioning을 분리했다. 코드/활성화 변수/키는 변경하지 않았다. 이 PR의 사람 리뷰는 여전히 필요하다.
