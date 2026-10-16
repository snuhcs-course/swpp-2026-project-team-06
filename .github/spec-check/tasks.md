# Spec-to-code check tasks

## DEV-40 [I2-T23] AI-assisted spec-to-code GitHub Actions check

- 이슈: https://linear.app/sswp6/issue/DEV-40
- 설계: https://linear.app/sswp6/issue/SWPP-90
- 브랜치: `violetsunshades/dev-40-i2-t23-add-an-ai-assisted-spec-to-code-github-actions-check`
- 기능·인수 조건: infra. DEV-40 AC: PR의 mismatch 보고, matched sample 통과, reviewer resolution 기록.
- 상태: 진행 중

### 목표
명시된 스펙과 PR 코드의 불일치를 AI가 근거와 함께 보고하고 사람이 해결하게 한다.

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

### 작업
- [x] 이슈·설계·기존 PR 템플릿/스펙 읽기, 범위 기록
- [x] 수집기/결과 검증/Claude 클라이언트와 workflow 구현
- [x] deterministic 계약 검증 및 실패 처리 확인
- [ ] AI 1차 리뷰 및 수정
- [ ] actual model mismatch/pass run과 사람 resolution 기록

### 완료 조건
- [ ] workflow PR 및 CI 결과
- [ ] genuine mismatch 보고와 matched PASS run URL
- [ ] 실제 사람 reviewer resolution
- [ ] 사람 1명 승인 후 main 머지

### 기록
- 2026-10-16 계획 작성. 실제 모델 접근·설계 승인 미확인. 확인 안 된 시간·토큰·승인은 기록하지 않는다.
- 2026-10-16 draft PR #107 생성. 로컬 계약 검증 26개 통과, actionlint v1.7.12의 workflow 구문 검사 통과(shellcheck 별도 도구는 미설치). 제품 workflow 및 코드 변경 없음.
