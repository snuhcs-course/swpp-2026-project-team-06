## DEV-55 [I2-T23 follow-up] Configure Claude API access and validate live spec-to-code review

- 이슈: https://linear.app/sswp6/issue/DEV-55
- 브랜치: `nemodleo/dev-55-i2-t23-follow-up-configure-claude-api-access-and-validate`
- 기능·인수 조건: infra. DEV-55 완료 조건 2(보호 환경)의 승인 방식 변경. 실제 MISMATCH/PASS 증거(완료 조건 4~7)는 이 PR 범위가 아니다.
- 상태: 리뷰 중

### 목표
spec-code-review를 승인자 1명의 승인으로 실행하되, PR 작성자 본인도 자기 PR 실행을 승인할 수 있게 한다.

### 범위 (수정 허용 경로)
- `.github/spec-check/check.py`(`check_environment`), `.github/spec-check/test_check.py`, `.github/spec-check/README.md`, `.github/spec-check/spec.md`, `.github/spec-check/tasks.md`

### 비범위
- workflow 권한·트리거, 프롬프트, 수집·검증 로직, 저장소 설정·키(관리자가 따로 함), EVIDENCE.md의 genuine run 기록

### 결정 사항
- 10/18 사용자(박현) 결정: Prevent self-review 필수 확인을 뺀다(A안). Required reviewers는 계속 필수라 모델 호출 전 사람 승인 한 번은 남는다. 승인 없이 자동 실행(B안)은 하지 않는다.
- 10/18 설정 현황(키 값 제외): environment spec-check에 `SPEC_CHECK_MODEL=claude-sonnet-5-5`, secret `SPEC_CHECK_API_KEY` 등록(키 소유자 박현). 모델 선택은 DEV-55 코멘트로 Minsun Kim에게 확인 요청 중. `SPEC_CHECK_ENABLED`는 이 PR 머지 전까지 false.

### 작업
- [x] `check_environment`에서 prevent-self-review 확인 제거, 승인자 없음은 그대로 INCOMPLETE
- [x] 계약 테스트: 승인자 없음 → INCOMPLETE, 승인자 있음(본인 승인 금지 켬/끔) → 통과
- [x] README·spec 갱신

### 완료 조건
- [ ] 계약 테스트 통과(로컬·GitHub)
- [ ] 사람 1명 승인 후 main 머지

### 기록
- 10/18 main 0639fbf에서 시작.
- 10/18 PR #147 머지(c3c721d). 설정: 승인자 4명(nemodleo·jangjinuite·xozier·llovablanche), 본인 승인 금지 꺼짐, 관리자 우회 꺼짐, `SPEC_CHECK_ENABLED=true`. EVIDENCE.md에 키 값 없이 설정 기록. 시연 PR로 live 실행 확인 중.
- 10/18 PR #150에서 첫 live 실행(https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/39124913548): 시연 mismatch → MISMATCH(SC-001, DEMO-AC-01과 `>= 0` 인용), 시연 matched → PASS. 일반 검사는 60 KiB 초과로 INCOMPLETE(모델 호출 없음). 사람 판단(완료 조건 6)은 리뷰어 몫으로 남김.

