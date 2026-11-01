# source_analysis tasks

## DEV-172 I3 평가 corpus·holdout·필드 채점 규칙 동결

- 이슈: [DEV-172](https://linear.app/sswp6/issue/DEV-172)
- 브랜치: `jinumeral/dev-172-i3-t10-freeze-source-analysis-evaluation-corpus-holdout-and`
- 기능·인수 조건: FEAT-03/04/07, AC-SRC-1/2/3/5/6/8
- 상태: 진행 중 (독립 holdout 확보 BLOCKED)

### 목표
프롬프트 개발 사례와 독립 평가를 분리하고 재현 가능한 필드 채점·중요 사실 감사를 고정한다.

### 범위 (수정 허용 경로)
- `server/app/source_analysis/{tasks.md,spec.md,corpus_score.py}`
- `server/tests/test_source_corpus.py`
- `docs/spec/validation/source-corpus-i3-v1.json`
- `docs/spec/validation/source-corpus-i3-v1.md`
- `docs/spec/{source-analysis.md,source-integration.md}`
- `docs/wiki/Source-Analysis.md`, `Makefile`

### 비범위
- 제품 추출/OCR/프롬프트 변경, 모델 호출, 새 의존성, 원문/개인정보/비공개 자료 커밋
- push·PR·다른 worktree 수정·운영 환경·배포·Linear 외부 메시지 (사용자 지시)

### 결정 사항
- 11/01 2차 리뷰: 모든 actual 후보(categories=[] 포함)에 supported·gold sourceSpanIds를 요구하고 evidenceSupport의 supported/total/rate를 전체·text/image/PDF 게이트별로 출력한다. 확인된 무근거는 FAIL, 누락 감사는 BLOCKED다. 분모0은 null과 이유를 보고하며 정의된 지표 실패 없이 판정 불가하면 BLOCKED다.
- 11/01 2차 리뷰 정규화: 범위 기호 -/~는 서로 보존하되 뒤 수량의 단위 공백·후행0은 동일하게 정리한다. 숫자 사이 쉼표 주변 공백은 보존하고 해당 숫자 조각은 정규화하지 않는다(1, 050g≠1,050g). 비공개 gold53개를 재검증하고 해시 변경 수·manifest SHA를 동기화한다. Makefile 무효 주석은 제거하고 subprocess cwd와 spec 표 날짜 순서를 고친다.
- 11/01 리뷰 수정은 사용자 지시대로 미커밋 v1에 반영하며 커밋·push·라이브 모델 호출·다른 worktree 수정은 하지 않는다. 정규화는 쉼표 숫자 그룹과 명시적 부호를 보존하고 비공개 gold 전체에서 normalized 해시를 재생성한다.
- 11/01 DEV-152(origin/main `docs/evaluation/i3-journeys/protocol.md`)에 맞춰 95% exact P/R 판정은 text·image(image+long_image)·PDF 3그룹으로 한다. image/long_image 개별 진단과 PDF origin별 집계를 병행하며 원본 crop과 image_to_pdf를 case별로 명시한다.
- 11/01 적용 페이지에 무근거 중요 사실이 도달했는지는 저장 추출 run만으로 확인할 수 없다. 별도 appliedPageAudit를 BLOCKED(적용/저장/렌더 증거 없음)로 보고하고 DEV-170 담당자의 격리 환경 검증을 요구한다. 오프라인 추출 PASS로 이 항목이나 readiness를 대체하지 않는다.
- 11/01 criticalAudit는 gold sourceSpans만 참조할 수 있다. gold 누락은 새 manifest 버전에서 보완하고 그 전에는 BLOCKED/확인된 무근거는 FAIL로 남긴다. null/비객체 감사 입력은 점수 없는 ValueError로 거절한다.
- 11/01 산출물 위치는 기존 source 평가·제품 스펙과의 연속성 때문에 `docs/spec/validation`, 오프라인 채점 구현은 소유 모듈인 `server/app/source_analysis`로 유지한다. `docs/evaluation/i3-*`의 여정 실행 프로토콜과 중복 복사하지 않고 DEV-152 계약을 참조한다.
- 11/01 환경·임시 DB·캐시·Git 권한 관련 실행 기록은 이 tasks.md에만 유지하고 평가 규칙 문서에서는 제거한다.
- 10/31 제공된 이슈 본문과 Linear 읽기 조회(In Progress)를 기준으로 한다. 기존 server/tasks.md의 타 이슈와 충돌하지 않게 모듈별 작업 기록을 만든다.
- 10/31 I2 real 12건 manifest SHA 일치 확인. 과거 holdout 4건도 개발 반복에 사용되어 I3 split은 development, 당시 split은 별도 보존한다.
- 10/31 vision 6건은 real 12건의 부분집합(이미지5+긴 이미지1)이다. 합성18건은 텍스트16+이미지1+PDF1이며 계약 전용2건도 별도 인벤토리에 보존한다.
- 10/31 비공개 원문·gold 전문은 복사하지 않는다. 필드/대상과 exact·normalized 값 해시, 근거 quote 해시·위치로 gold를 동결하고 로컬 예측만 비교한다. 원본 파일 해시와 안전한 모델 입력 해시를 구분한다.
- 10/31 독립 신규 자료의 안전성/승인이 확인되지 않아 새 자료를 추가하지 않는다. holdout IDs는 빈 집합으로 동결하고 BLOCKED 및 형식별 다음 확보 행동을 명시한다.
- 10/31 평가 규칙은 제품 동작을 바꾸지 않는다. exact/normalized 점수와 완전한 수동 중요 사실 감사를 분리하며 미실행/감사 누락은 PASS가 될 수 없다.
- 10/31 원문 gold53개 중42개만 저장 OCR span에 공백 차이만으로 연결됐다. 나머지11개는 위치 검수 BLOCKED로 보존한다. 중요 사실 감사는 후보별 categories를 명시하고 불완전한 감사에 이미 확인된 무근거 주장이 있으면 FAIL을 숨기지 않는다.

### 작업
- [x] 인벤토리·해시·gold·holdout 상태·개인정보 검토 동결 (미확인 상태는 BLOCKED)
- [x] 오프라인 결정적 채점 CLI 및 회귀 테스트90개 (11/01 2차 리뷰 수정 포함)
- [x] 한국어 spec/영문 wiki 갱신
- [x] ruff·format check·focused pytest 실행과 결과 기록, 현재 수정 경로9개 범위 감사 (Makefile diff 제거)
- [x] 수정 전 전체 pytest 통과: 리뷰어 `cd server && uv run pytest` → 513 passed / 0 failed (2026-11-01, sandbox 밖 격리 로컬 PostgreSQL). 이번 수정 후 재실행 예정.
- [ ] 이번 2차 리뷰 수정 후 전체 pytest 재실행 (리뷰어, sandbox 밖 격리 로컬 PostgreSQL)
- [ ] 작은 논리 단위 커밋 (11/01 사용자 지시로 이번 세션에서는 수행하지 않음)

### 완료 조건
- [x] 로컬 산출물과 신규 focused 테스트 검증
- [ ] 독립 holdout 확보 및 승인 (BLOCKED: 기존 사례 모두 개발 노출)
- [ ] 사람 리뷰 및 머지 (이번 요청 범위 밖)

### 기록
- 10/31 작업 시작. 사용자 요청으로 spec 첫 커밋만 로컬 생성하며 push/PR은 하지 않는다. Agent 시간/Tokens는 세션 종료 기록에 기재하되 계측 불가능한 수치는 추정해 확정하지 않는다.
- 10/31 spec 첫 커밋 시도 실패: `git add server/app/source_analysis/tasks.md` → `.git/worktrees/farmclub-source-eval/index.lock: Operation not permitted`. sandbox 내 Git 메타데이터 쓰기 차단으로 커밋 BLOCKED. 실제 커밋0개; 준비된 산출물 검증을 계속한다.
- 10/31 `uv sync --frozen` 성공(새 의존성 추가 없음). 기존 PostgreSQL이 없어 분리 컨테이너 `farmclub-dev172-db` / localhost:55472 / DB `farmclub_dev172_test`를 생성했다. 다른 worktree/기존 DB는 수정하지 않았다.
- 10/31 1차: `cd server && uv run ruff check .` 통과, `uv run pytest tests/test_source_corpus.py -q` 40 passed. 전체 `uv run ruff check . && uv run pytest`는 ruff 통과, pytest **462 passed / 32 failed**(85.46s). 기존 source worker의 PROCESSING_FAILED 연쇄 원인 확인 중; 전체 통과로 보고하지 않는다.
- 10/31 진단: 기존 실패1개를 worker.fail의 예외 형식만 출력하는 메모리 내 래퍼로 재현(제품/테스트 파일 변경 없음): `PermissionError [Errno 1] Operation not permitted (originated from sysctl() malloc 1/3)`. sandbox의 psutil 메모리 조회 차단이 대표 실패의 원인이다. 진단 테스트1 failed; 통과로 바꾸지 않는다. 다음 행동: 담당자가 sysctl 조회 가능한 로컬/CI에서 전체 묶음을 재실행한다. 테스트 약화/예외 무시는 하지 않았다.
- 10/31 최종: `cd server && uv run ruff check . && uv run pytest tests/test_source_corpus.py -q` → ruff 통과, **41 passed / 0 failed**(11.58s). `UV_CACHE_DIR=/private/tmp/farmclub-dev172-uv-cache`, `DATABASE_URL`은 분리 로컬55472의 `farmclub_dev172` 사용(pytest가 `_test` 추가). 전체 테스트는 위 실패 상태로 남긴다.
- 10/31 기존 비공개 source-v4 저장 응답30건을 메모리에서 재채점: TP34/FP23/FN19, exact P/R59.65%/64.15%. 새 실호출 측정이 아니며 감사 누락/근거11개 미연결로 최종 **BLOCKED**다. 원문·응답은 저장소에 복사하지 않았다. 합성 개인정보 사례의 safeInput 가림3개·가상 연락처 잔존0개를 내용 출력 없이 확인했다.
- 10/31 커밋 전 스캔: 감사 categories 누락 시 PASS 가능성과 불완전 감사의 알려진 unsupported 은폐를 고치고 회귀 테스트를 통과했다. 남은 CRITICAL/WARNING0건. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건(정규화는 도메인 채점 규칙, 선택적 감사/거절 입력은 명시된 현재 계약).
- 10/31 `git diff main...HEAD`에는 로컬 main이 오래되어 이번 작업과 무관한 기존625파일 차이가 있다. 사용자 지정 base `origin/main`(2ab0c2f)과 HEAD 차이0, 실제 수정/신규10경로는 위 범위와 일치한다. 다른 브랜치/refs는 갱신하지 않았다.
- 10/31 Agent 시간 / Tokens: 세션 전체 시간·토큰 계측값 제공 안 됨(임의 수치 미기재). 대표 프롬프트: “기존 개발 노출을 보존하고 독립 자료 없으면 BLOCKED, 원문 비공개·무실호출로 manifest/채점 동결.” 남은 작업: 독립12건 권한/가림/2인 gold 검수, 기존11구절 위치 확인, 제한 없는 환경 전체 pytest, Git 쓰기 권한 복구 후 커밋. 배포/PR/push/Linear 알림 없음.
- 10/31 검증 후 이번 작업에서 만든 임시 PostgreSQL 컨테이너/볼륨만 삭제했다. `.venv`/기존 lock 의존성은 유지한다. 미실행 커밋 분리안: `docs(source): AC-SRC-2/6 평가 범위 기록 (DEV-172)` → `docs(source): AC-SRC-2/3/6 개발 corpus와 평가 규칙 동결 (DEV-172)` → `feat(source): AC-SRC-1/2/3/5 오프라인 필드 채점과 회귀 검증 (DEV-172)`. Git 권한 복구 후 담당자가 현재 브랜치를 확인하고 실행해야 한다.
- 11/01 리뷰 WARNING1/2·INFO 반영: 숫자 그룹·부호 보존, PDF별 origin(crop2/image_to_pdf2), DEV-152 3그룹 판정과 개별 진단, appliedPageAudit BLOCKED, gold span 한계 문서화, 감사 입력 타입 검증, Makefile 주석 위치, 평가 문서의 환경 기록 제거. 범위는 기존10경로 그대로다.
- 11/01 private `.artifacts/source-real/cases.json`의 기존 SHA 일치 확인 후 real gold와 `.artifacts/source-synthetic-flash-comparison/report.json`의 저장 expected를 읽기 전용 대조했다. 모든53개 target/field/exact hash 일치, normalized hash53개 재생성, 변경0개(기존 gold는 이번 버그의 영향을 받지 않음). 원문/응답/값은 출력·복사하지 않았다. v1 manifest 새 SHA-256: `95a75ca765ccf66c559dc0fc24ed41b2a0c268d2a8aca7206bdec8e2fc41cd6d` (PDF origin 추가에 따른 변경). md·tests·wiki를 같은 값으로 갱신했다.
- 11/01 환경 준비: 시스템 python은 pydantic 미설치라 해시 재생성 import가 실패했고 기존 `server/.venv/bin/python`으로 성공했다. 기본 uv 캐시는 권한 거부로 format 실행 전 실패하여 `UV_CACHE_DIR=/private/tmp/farmclub-dev172-uv-cache`를 지정했다. 이번 세션 전용 PostgreSQL `farmclub-dev172-review-db`(localhost:55472, DB `farmclub_dev172_review`, pytest `_test`)를 생성해 다른 작업 DB와 분리했다. 기존 컨테이너/다른 worktree는 변경하지 않았다.
- 11/01 검증: 위 UV_CACHE_DIR와 DATABASE_URL을 지정하고 `cd server && uv run ruff check . && uv run pytest tests/test_source_corpus.py -q` → `All checks passed!`, **59 passed / 0 failed**, 8.93s, 종료0. `python3 -m json.tool docs/spec/validation/source-corpus-i3-v1.json > /dev/null` → 종료0. 전체 pytest는 사용자 지시대로 리뷰어가 sandbox 밖에서 재실행하며 이 세션에서는 실행하지 않았다.
- 11/01 남은 사람 작업: 독립 holdout 권한/개인정보·gold 합의, 기존11개 gold 위치 검수, DEV-170 적용/저장/렌더 감사, 전체 pytest 재실행. Agent 시간 / Tokens: 세션 계측값 제공 안 됨(임의 추정 미기재). 커밋·push·실호출·외부 메시지0회.
- 11/01 최종 범위 확인: `git diff main...HEAD`는 기존625경로 차이, `git diff origin/main...HEAD`는0경로이며 실제 미커밋/신규10경로 모두 허용 범위 안이다. `git diff HEAD --check` 통과, manifest/md/tests/wiki SHA pin 일치. 이번 세션 전용 임시 PostgreSQL 컨테이너는 검증 후 종료·자동 삭제했다.

- 11/01 2차 리뷰 시작: 리뷰어가 이번 수정 전 `cd server && uv run pytest`를 sandbox 밖 격리 로컬 PostgreSQL에서 실행해 **513 passed / 0 failed**를 확인했다. 이전 sandbox 실패는 과거 기록이며 현재 전체 테스트 BLOCKED 상태가 아니다. 이번 변경 후 전체 묶음 재실행 예정; 이 세션은 요청된 ruff·format check·focused pytest·json.tool을 실행한다.
- 11/01 2차 리뷰 반영: 모든 actual 후보 근거율(전체/3그룹), 일반 무근거 FAIL·감사 누락 BLOCKED, 분모0 N/A 이유·판정 불가 BLOCKED, 범위 기호 보존/단위 공백 정규화·숫자 쉼표 공백 보존 회귀 검증. md 감사/정규화와 영문 wiki 결과 문구를 갱신하고 subprocess cwd를 고정했다. spec 결정 표는 날짜 오름차순, Makefile 주석 삭제로 해당 diff 전체 제거.
- 11/01 2차 리뷰 해시 검증: 비공개 real 원본 SHA 일치 확인 후 저장 real/synthetic gold53개의 target/field/exact hash 일치. normalized 해시53개 재생성, **변경0개**. 현재 manifest SHA-256은 **`95a75ca765ccf66c559dc0fc24ed41b2a0c268d2a8aca7206bdec8e2fc41cd6d`**로 유지하며 md/CLI 예시/tests/wiki pin 일치. 비공개 값은 출력·복사하지 않았다.
- 11/01 2차 리뷰 실행: 전용 PostgreSQL `farmclub-dev172-review2-db`(localhost:55472, DB `farmclub_dev172_review2`, pytest `_test`)와 `UV_CACHE_DIR=/private/tmp/farmclub-dev172-uv-cache`, `DATABASE_URL=postgresql+psycopg://farmclub:farmclub@localhost:55472/farmclub_dev172_review2`를 사용했다. `cd server && uv run ruff check . && uv run ruff format --check app/source_analysis/corpus_score.py tests/test_source_corpus.py && uv run pytest tests/test_source_corpus.py -q` → **All checks passed! / 2 files already formatted / 90 passed, 0 failed (18.02s), 종료0**. `python3 -m json.tool docs/spec/validation/source-corpus-i3-v1.json > /dev/null` → 종료0. 수정 후 전체 pytest는 아직 실행하지 않았으며 리뷰어 재실행 예정이다.
- 11/01 2차 리뷰 최종 감사: `git diff main...HEAD`는 기존625경로, `git diff origin/main...HEAD`는0경로, 실제 미커밋/신규9경로는 허용 범위 안이다. `git diff HEAD --check` 통과. 이번 테스트 전용 컨테이너는 검증 후 종료·자동 삭제하며 기존 DB/다른 worktree는 수정하지 않는다. Agent 시간 / Tokens는 세션 계측값 미제공. 커밋·push·라이브 모델 호출·외부 메시지0회.

### 커밋 전 3차 스캔 후속(INFO, v1 커밋 뒤 처리)
- normalize 단위 정규식 뒤 경계·유니코드 숫자 처리(진단용 normalized만 영향, 바꾸면 해시 재생성 → v2).
- CLI 입력 오류/다이제스트 불일치 종료 코드를 채점 FAIL(1)과 구분하고 OSError도 traceback 없이 처리.
- v1 FieldKey 20개를 manifest 상수로 고정하고 테스트로 schemas.FieldKey와 대조.
- DEV-152 '부재·충돌 시 빈칸/표시' 감사 기록 필드 또는 DEV-170 범위 명시, p50/p95는 DEV-170 몫으로 명시.
- 10/31 재채점 수치는 11/01 규칙 변경 전 채점기 기준임을 표시, 범위의 Makefile 제거.
- 11/01 전체 pytest(격리 로컬 Postgres, sandbox 밖) 2차 수정 후 544 passed / 0 failed.
- 11/01 결정(DEV-172 소유자): I3 holdout 후보로 새로 수집한 공개 자료(원문·이미지·web_print PDF), 출처 URL, 가림본, DRAFT 라벨, 검토표는 레포에 올리지 않고 로컬 비공개 폴더에만 보관한다(레포는 GitHub·Wiki로 공개 동기화되고 농가 페이지 일부는 복제 금지를 명시). v2 잠금 때도 레포에는 후보 ID·형식·해시·집계 결과만 남긴다. 현재 상태: 후보 12건 중 텍스트3·이미지3·긴 이미지3 라벨 검토 대기, PDF(web_print)3 중 2건 인쇄 완료·1건 확인 문구 불일치로 재확인 필요, 모든 라벨 DRAFT·holdout 미잠금.
