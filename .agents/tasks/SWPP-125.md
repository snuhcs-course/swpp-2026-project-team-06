## SWPP-125 pr-review 머지 절차에 배포 확인 방법 두 줄 추가

- 이슈: [SWPP-125](https://linear.app/sswp6/issue/SWPP-125) (관련: DEV-139, DEV-94)
- 브랜치: `nemodleo/swpp-125-pr-review-deploy-check`
- 기능·인수 조건: infra(에이전트 작업 규칙). 제품 동작 변경 없음.
- 상태: 진행 중

### 목표
머지 뒤 배포 확인을 "어떻게" 하는지 `pr-review` 4. 머지 직전 4번에 적는다.

### 범위 (수정 허용 경로)
- `.agents/skills/pr-review/SKILL.md`, `.agents/tasks.md`

### 비범위
- `AGENTS.md`(배포 확인 규칙은 이미 있음), `.github/workflows/**`(감지 결함은 DEV-139)

### 결정 사항
- 10/23 사용자(박현) 결정: 운영 확인을 curl·API로 하는 것은 강제가 아니라 권장으로 둔다.
- 10/23 쌓은 PR base 규칙은 AGENTS.md "브랜치·커밋·PR"과 pr-review 4단계 1번에 이미 있어 추가하지 않는다. 배포 확인 규칙도 AGENTS.md "Spec-Anchored 원칙"에 있어 공통 규칙은 고치지 않고, 확인 방법만 스킬에 둔다.

### 완료 조건
- [x] pr-review 4단계 4번에 두 줄 추가
- [ ] 사람 1명 승인 후 main 머지

### 기록
- 10/23 main에서 시작. DEV-94(8dc9236) 배포 확인 때 실행 목록 라벨과 실제 배포 커밋이 달랐던 일이 계기.

