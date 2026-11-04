## DEV-92 기본 정보 저장 중 즉시 첨부 경합

- 이슈: https://linear.app/sswp6/issue/DEV-92
- 브랜치: `jinumeral/dev-92-bug-source-upload-can-race-basic-info-blur-save-and-return`
- 기준: FEAT-03, AC-SRC-1/5/11, M-11/13, docs/spec/source-editor.md
- 상태: 진행 중

### 목표
사용자 수동 입력을 우선 보존하면서 기본 정보 blur 저장과 새 파일/텍스트 업로드의 버전 경합을 제거한다. DEV-90 최종 운영 증빙/발표자료를 수정 배포 후 촬영한다.

### 범위
- `apps/producer/src/lib/{SourceWorkspace,SourceAttachments}.tsx`, `apps/producer/{spec,tasks}.md`
- `scripts/e2e/source-workspace-ui.spec.ts`
- `docs/spec/{README,source-editor,source-integration}.md`, `docs/wiki/Source-Analysis.md`
- `server/{tasks,README}.md`, `docs/spec/validation/source-production-2026-10-19.json`: DEV-90 최종 배포/기록 정합성만
- ignored `.artifacts/dev90/**`, 사용자 승인 Railway/Vercel 배포와 기존 Drive PPTX/영상, Linear DEV-90/92

### 결정 사항
- 10/19 사용자 후속 지시: 손으로 쓴 값의 우선순위를 유지한다. 기본 정보 flush를 첨부 컴포넌트에 주입해 파일/새 텍스트의 버전 조회 전에 저장 완료를 기다린다. 버전 검사를 제거하거나 다른 편집자의 입력을 덮어쓰지 않는다. 실패 시 파일/입력은 보존하고 명시적으로 재시도한다.
- 화면·레이블·모양은 변경하지 않는다(Figma N/A). 유료 모델 재시도/자동 업로드 재시도는 추가하지 않는다.
- DEV-90 당시 13장 상한은 이후 사용자가 만든 슬롯/팀원 추가 장을 삭제한다는 뜻이 아니다. 최신 공유 장 수를 유지하고 우리 작업은 새 장을 추가하지 않는다.

### 작업
- [x] 저장 완료 대기 연결 및 실패/수동 입력 보존
- [x] 지연 PUT을 넣은 파일/텍스트 회귀, 모바일3폭, 기존 관련 묶음
- [ ] spec/wiki/Linear 및 DEV-90 배포 증빙 마무리
- [ ] CI/AI 리뷰, main 머지와 배포 후 재녹화·원본 발표자료 갱신

### 기록
- 10/19 main2ed8b28(API/worker 배포 성공, source367 pytest/API7/브라우저45 통과2건너뜀)에서 시작. 기존 운영 UI도 새 상품부터 private save/reload/apply 성공했으나 즉시 업로드 경합은 별도 재현되므로 수정 후 최종 기록으로 교체한다. Agent 시간/Tokens 미측정.

- 10/19 검증: typecheck4 workspace/mock15/관련 Playwright24(신규7 포함) 및 소비자·생산자 web export 통과. SourceBasicInfo 기존 충돌 보호와 직접 입력 우선순위는 그대로 유지한다. 최종 운영/자료 완료 상태는 Linear DEV-90/92에서 후속 갱신한다.
- 10/19 수정 전 코드를 일시 복원한 동일 지연 PUT 검사1건은 예상대로 실패(저장 완료 전 source uploaded). finally에서 수정 코드를 바이트 동일하게 복원했으며, 수정본 전체24 통과 결과와 대조했다. 커밋/브랜치 스캔 지적0, 레거시 호환 후보0.

