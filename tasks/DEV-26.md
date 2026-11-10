## DEV-26 easel-canvas 0.1.1로 고정 갱신 (후속)

- 이슈: [DEV-26](https://linear.app/sswp6/issue/DEV-26) (Done 상태였고, 이번은 버전 올리기 후속)
- 브랜치: `nemodleo/dev-26-easel-0-1-1`
- 기능·인수 조건: 해당 없음 (개발 도구)
- 상태: 리뷰 중

### 목표
로컬 디자인 캔버스 npm 패키지 `easel-canvas`의 고정 버전을 0.1.0에서 0.1.1로 올린다.

### 범위 (수정 허용 경로)
- `package.json` (`design` 스크립트)
- `.mcp.json` (easel 서버 args)
- `tasks/DEV-26.md` (이 파일)

### 비범위 (건드리지 않음)
- lockfile
- `docs/design/` 내용 (`board.json` 포함)
- `.github/workflows/**` (CI)
- `AGENTS.md` (버전 숫자를 적지 않아 수정 불필요)

### 결정 사항
- 11/10 0.1.1 변경점 (릴리스: https://github.com/nemodleo/easel/releases/tag/v0.1.1)
  - 첫 실행 시 캔버스 이름은 프로젝트 폴더 이름, 보드 이름은 `<title>`로 정해진다.
  - 토큰이 등록되지 않았으면 검사를 끈다.
  - AI 탭이 로그인 상태를 확인하고, 실패하면 안내를 보여 준다.
  - 코멘트 동시 쓰기에 잠금을 건다.

### 작업
- [x] `package.json` design 스크립트와 `.mcp.json` args를 `easel-canvas@0.1.1`로 수정
- [x] `npm run design -- --no-open --port 4340`으로 0.1.1 기동 확인 (200 응답, `docs/design/board.json` 변경 없음)

### 완료 조건
- [x] 고정 두 곳이 모두 0.1.1
- [x] 0.1.1로 캔버스 서버가 뜸
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 11/10 두 곳 수정, 서버 기동 확인. `easel-mcp`는 stdin으로 initialize를 보내 응답을 확인했다(응답의 serverInfo.version은 코드에 하드코딩된 0.1.0이고 설치된 패키지는 0.1.1). `claude mcp list`에서는 프로젝트 MCP 승인 대기로 나와 Claude 쪽 연결은 확인하지 못했다.
