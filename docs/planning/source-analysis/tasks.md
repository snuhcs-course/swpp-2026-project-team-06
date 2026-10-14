# DEV-53 명세·백엔드 구현 계획

- 이슈: [DEV-53](https://linear.app/sswp6/issue/DEV-53) · [GitHub #102](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/102)
- 브랜치: `jinumeral/dev-53-dev-specify-bulk-source-analysis-and-backend-implementation`
- 기준: origin/main 9d6b42e. DEV-52 작업 폴더/미커밋 디자인은 변경하지 않는다.
- 상태: 문서 작업 진행 중. 백엔드 구현 미착수. Linear 쓰기 도구가 없어 상태는 Backlog로 남아 있다.
- 관련: FEAT-03/04/07 · M-10~13/M-18 · AC-SRC-1~8

## 목표
확정한 일괄 자료 분석 명세를 독립 브랜치에 커밋하고, Mock 우선으로 검증 가능한 백엔드 구현 계획을 확정한다.

## 수정 허용 경로
- docs/spec/source-analysis.md
- docs/spec/tech-design/source-analysis-backend.md
- docs/spec/README.md
- docs/wiki/Source-Analysis.md
- docs/planning/source-analysis/**

## 비범위
앱·서버 코드, API 호출, 키/환경 설정, 실제 업로드/게시/배포/머지, DEV-52 디자인 변경. 이번 요청은 로컬 명세 브랜치·커밋 및 계획이며 push/PR은 수행하지 않는다.

## 결정 사항
- 2026-10-14: 초기 모델 GPT-6.1 Sol, 품질·속도·비용은 추후 실제 자료로 평가한다. 선택적 AI 이미지 생성은 고려 중.
- 2026-10-14: 초기 구현/자동 테스트는 명시적 Mock 모드. 실제 API는 서버 측 별도 모드로 준비하며 실패 시 Mock으로 조용히 바꾸지 않는다.
- 2026-10-14: 제품 명세는 디자인 문서에서 독립시키고 원본과 영문 요약만 옮긴다. 템플릿 에셋·실행 파일·디자인 이력은 이 브랜치에 넣지 않는다.

## 작업
- [ ] 제품 명세·영문 요약·문서 안내 분리 및 첫 커밋
- [ ] 현재 서버 구조를 근거로 백엔드 계획 작성 및 두 번째 커밋
- [ ] 문서 링크·범위·불일치·공백 검사

## 기록
- 2026-10-14: 사용자 요청에 따라 GitHub #102 생성 후 Linear 동기화된 DEV-53의 브랜치명을 사용. API 키 조회·전송·호출 없음. Agent 시간 / Tokens: 미측정.
