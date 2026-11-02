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

## DEV-187 I3 최종 페이지 문장 gold·stage-2 scorer

- 이슈: [DEV-187](https://linear.app/sswp6/issue/DEV-187) (읽기 조회: In Progress)
- 브랜치: `jinumeral/dev-187-final-text-scorer`, base `origin/main` 131e036
- 기능·인수 조건: FEAT-03/04/07 · AC-SRC-1/2/3/5/6/8, AC-03-2
- 상태: 구현 검증 완료. 샌드박스 밖 전체 pytest 통과(기록 참고)

### 목표
DEV-186의 두 단계 초안 중 최종 페이지 문장을 독립적으로 채점한다. 기존 verbatim scorer·제품 실행 경로는 변경하지 않는다.

### 범위 (수정 허용 경로)
- `server/app/source_analysis/{final_score.py,spec.md,tasks.md}`
- `server/tests/test_final_score.py`
- `docs/spec/validation/source-final-{gold-format.md,gold.schema.json,gold-i3-dev-synthetic.json,dev-manifest.json,holdout-i3-lock.json}`
- `docs/spec/source-analysis.md`, `docs/wiki/Source-Analysis.md`


### 비범위
- push·PR·외부 메시지·다른 worktree·운영 환경·실호출·새 의존성
- 공개 개발12건 및 holdout 원문/gold 복사·생성·본문 출력 (round 2에서 지정 gold 두 파일과 lock의 로컬 검증만 허용)
- DEV-186 프롬프트/제품 코드, DEV-172 manifest·scorer 변경

### 결정 사항
- 11/01 사용자 제공 이슈와 Linear 읽기 조회가 작업 지시다. 기존 tasks의 DEV-172 진행 표시는 이력이며 사용자가 분리한 현 worktree에서 신규 DEV-187 범위만 수정한다. spec 스킬의 push/PR 절차는 사용자 금지 지시를 따른다.
- 11/01 gold는 schemaVersion=1/split/sources 봉투로 묶고 source마다 id/format/product/sentences/forbidden을 둔다. JSON schema와 Pydantic 검증으로 같은 계약을 적용한다. holdout은 로컬 전용이며 출력은 모든 split에서 ID·형식·해시·카운트만 허용한다.
- 11/01 SECTION_MODULES의 텍스트 모듈만 사용하고 사용자 확정 표에 따라 name→intro, historicalSales→farm을 평가 전용으로 보완한다. 제품 schemas.py는 수정하지 않는다.
- 11/01 문장당 사실은 1~3개 verbatim mustContain 조각(단어에 한정하지 않음), whitespace 무시해 gold 문장 내 존재 검증. 사실 recall은 같은 section 전체에서 모든 조각의 정규화 부분문자열 일치; 다른 section 하나에서만 완성되면 misplacement. 중복은 사실별 1회다.
- 11/01 가격/전화/email 및 forbidden의 식별 문구를 탐지한다. forbidden.text에는 검토자가 식별 가능한 최소 구절을 적고, 알려진 라벨 접두어를 제거한 구절로도 비교한다. 정규식과 한계를 문서화한다.
- 11/01 unsupported는 안전 원문에서 추출한 숫자/단위 토큰·고정 품종 사전(호출자가 추가 가능)·인증 단어의 집합 대조다. 의미/부정/상품 연결은 판정하지 못하므로 사람 감사가 필요하다.
- 11/01 precision proxy는 문장별 gold 토큰 세트 또는 안전 원문 부분문자열 또는 문장 SHA에 묶인 로컬 사람 supportJudgments로 인정한다. 문장 분리는 개행/문장부호 기준이며 실패 run의 잔여 출력도 안전성·precision 감사하되 recall은 모두 miss다.
- 11/01 실패/누락/빈 결과는 source·gold 사실 분모에 유지한다. critical gate는 critical miss/금지/unsupported/실패가 있으면 FAIL, 자료 없는 집계는 N/A다. 일반 recall·문장 품질/독립 인수 기준과 구분한다.
- 11/01 합성20건에는 계약용2건도 빈 gold로 포함한다(오류가 기대되는 extraction 사례, 최종 문장 없음). 혼합상품은 A 하나를 선택, 충돌은 자료 A/B 조건을 보존, 과거 판매는 금액만 제거한다. 공개12건은 PENDING_PRIVATE다. → 정정: 이후 규칙9로 06·09가 빈 gold가 되어 contract는 5건이고, 공개12건은 `LOCAL_PRIVATE`(SHA 고정)로 바뀌었다.

- 11/01 round 2 사용자 결정: final 전용 정규화에서 한/두/세/네 개·상자·박스 뒤 조사/어미를 허용하고 숫자 천 단위 쉼표를 제거한다. 양쪽 token/text 및 unsupported에 같은 함수를 적용하며 frozen stage-1 normalize는 유지한다. NUMBER_RE의 단위 뒤 영문 경계를 검사한다. Gold는 verbatim과 contains를 모두 만족해야 한다.
- 11/01 round 2 규칙9~12: 판매점 운영 문구·건강 효능을 platform/health 금지로 추가하고 taste/size는 taste에 배치, 판매가 칸의 기간도 제외한다. 단어 목록은 final_score 모듈 상수 하나로 두며 DEV-186 text_safety.py와 머지 전까지 동기화한다. 합성20건만 재라벨링하고 해시를 갱신한다.
- 11/01 round 2 입력: 로컬 run 봉투의 gold 항목으로 private list gold를 로드하며 where 생략 허용, format은 source 봉투에서 제공한다. 개발/holdout 고정 파일 SHA를 검사하고 holdout은 로컬 lock SHA도 대조한다. 검증만 실행하며 private 텍스트는 출력/복사/채점하지 않는다. repo는 public12건 LOCAL_PRIVATE 해시와 holdout IDs/formats/해시/140문장/253사실 lock만 보관한다.
- 11/01 round 2 보고서: gold 문장0개는 caseType=contract, 나머지는 extraction으로 표시하고 byCaseType을 별도 집계한다. 전체 분모·실패 게이트는 유지한다. 추가로 운영 문구만 있는06/09도 contract로 집계한다. MONEY_RE의 제2원칙 오탐과 마침표 뒤 한글의 문장분리 한계는 문서에 명시한다.

- 11/01 round 2 격리 회귀가 과거 source-visual-2026-10-16.json의 split=holdout4건을 탐지했다. 개발 노출이 확인된 사례이므로 현재 split=development, historicalSplit=holdout으로 이력 보존하며 수치/원천/결과는 바꾸지 않는다. 허용 범위를 해당 메타데이터 파일로 확장한다. → **되돌림(Claude 리뷰)**: 과거 검증 기록은 고쳐 쓰지 않는다. source-visual은 수정하지 않았고, 격리 테스트는 `source-final-*.json`만 검사한다.

### 작업
- [x] gold 계약·schema·로컬 입력 envelope·보안 보고서 구현
- [x] 합성20건 gold·공개12건 대기 manifest
- [x] 단위·CLI·redaction·합성 일관성 회귀 테스트
- [x] 한국어 spec·영문 wiki
- [x] 지정 ruff/focused/full pytest(샌드박스 밖)
- [ ] diff 범위 감사·커밋 전 스캔·로컬 커밋 시도

### 완료 조건
- [x] 지정 테스트 실제 실행·결과 기록
- [ ] 산출물과 제한·사람 후속 작업 보고 (holdout/공개12건 독립 작업)

### 기록
- 11/01 AGENTS.md·spec 스킬·제품/작업 spec·DEV-187 Linear 이슈를 읽었다. 외부 상태 변경·메시지는 하지 않았다. DEV-186과 공유하는 제품 코드 변경 없음. Agent 시간/Tokens는 계측값 제공 안 됨.
- 11/01 추가 결정: 안전 원문과 출력의 수치 단위 비교는 kg/g/brix 외 mg/μg/ml/l/cm/mm·날짜/시간·수량/%도 추적한다. 대표 전화15/16/18 번호도 개인정보 탐지에 포함한다. 자료 없는 critical N/A는 CLI 종료1로 PASS와 구분한다.
- 11/01 합성 gold: 20 source / 19 sentences / 26 facts (critical18) / forbidden11. `한 상자입니다`는 frozen 정규화의 한글 조사 경계 때문에 standalone token `한 상자`와 달라, 페이지 구성 표시를 `감귤 5kg 한 상자.`로 작성했다. normalizer·기존 테스트는 바꾸지 않았다. 초기 안내/합계 assertion의27은 집계 실수로26으로 정정했다.
- 11/01 초기 검증: 기본 uv 캐시 쓰기 제한 → `UV_CACHE_DIR=/private/tmp/farmclub-dev187-uv-cache` 사용. 새 의존성 없음. ruff 첫 실행의 긴 줄은 새 파일에만 format 적용해 수정했다. 첫 focused는147 passed/1 failed(합성 count 문장 정규화), 수정 후 재실행 중이다.
- 11/01 두 번째 focused는147 passed/1 failed(총계 assertion27→실제26 정정 전 실행본). 이후 모든4형식 집계·alias·noncritical gate·빈 gold·대표 전화·추가 단위 테스트를 보강했다. 최종 `cd server && uv run ruff check . && uv run pytest tests/test_final_score.py tests/test_source_corpus.py` → ruff `All checks passed!`, **157 passed / 0 failed (31.21s)**. `uv run ruff format app/source_analysis/final_score.py tests/test_final_score.py` →2 files left unchanged. 환경: 위 UV_CACHE_DIR, 사용자 지정 DATABASE_URL의 dev187/55484(pytest가 `_test` 추가).
- 11/01 `scan-before-commit` 적용: scorer·테스트·새 gold/schema/manifest 전문과 문서 diff 확인, 호출부 검색, 입력/출력 가림·분모·모듈 매핑·금지/unsupported 대조 점검. 남은 CRITICAL/WARNING0건. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건. 기본값/선택 outputPath와 두 입출력 봉투는 사용자 요청 현재 계약이며 옛 형식 호환이 아니다.
- 11/01 `git diff main...HEAD`는 오래된 로컬 main 대비 기존652파일 차이. 지정 base `origin/main`/HEAD는131e036으로 차이0이며, 실제 신규/수정10경로는 DEV-187 허용 범위 안이다. `git diff HEAD --check` 통과. Makefile의 기존 `test-server`가 모든 pytest를 수집하므로 새 테스트 묶음/타깃은 만들지 않았다.
- 11/01 전체 `cd server && uv run pytest` 실행 중(611 collected). 이 결과 확인 전 작업 완료 체크를 하지 않는다. 모델 호출·새 의존성·push·PR·다른 worktree 수정 없음.
- 11/01 gold 문구 점검 결정: 10-historical은 금액 외에 원문의 `현재 가격이 아닙니다` 유보 표현도 그대로 보존해야 한다. 기존2번째 사실의3번째 토큰을 그 유보 표현으로 잡아 문장1개/사실2개를 유지하고 gold/manifest 해시를 함께 갱신한다. 전체 pytest 진행 중 이 gold 전용 보완은 완료 후 해당 합성 일관성 테스트를 재실행한다.
- 11/01 전체 `cd server && uv run pytest` → **579 passed / 32 failed (291.64s)**, 종료1. 실패는 기존 source_analysis/editor/gemini_ocr/integration/recovery/visual_quality 흐름이다. 해당 제품/테스트는 수정하지 않았다. `psutil.Process().children(recursive=True)`와 기존 `prepare('감귤'.encode(), 'text/plain')`를 직접 호출해 둘 다 **PermissionError [Errno 1] Operation not permitted (originated from sysctl() malloc 1/3)**를 재현했다. 전처리의 프로세스 자식 조회가 sandbox에서 막히는 근거이며 전체 통과로 보고하지 않는다. 제품/테스트 우회·약화 없음. 사람은 sysctl 프로세스 조회가 허용된 로컬/CI에서 전체 묶음을 재실행해야 한다.
- 11/01 최종 gold 보완 후 동일 환경에서 `cd server && uv run ruff check . && uv run pytest tests/test_final_score.py tests/test_source_corpus.py` 재실행 → **All checks passed! / 157 passed, 0 failed (103.62s), 종료0**. 합성20건 정규 JSON 해시와 schema/manifest 일치 포함. 전체 pytest의32개 실패는 위 기록대로 미해결이며 사람 재실행 전 전체 완료로 처리하지 않는다.
- 11/01 최종 스캔: 과거 판매의 유보 표현 누락은 복원했고 남은 CRITICAL/WARNING0건. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건. `git diff HEAD --check` 통과. 로컬 커밋 예정: `feat(source): AC-SRC-2/3/6 최종 문장 gold와 채점기 추가 (DEV-187)`.
- 11/01 남은 사람 작업: 공개 개발12건의 private final gold 작성, holdout3인 독립 검토·합의·페이지 검증·해시 잠금, DEV-170/T11 실제 stage-2·문장 품질 감사, sandbox 밖 전체 pytest. 문장/품종 사전과 regex의 한계, gold0건/계약 사례의 빈 run critical FAIL 정책은 형식 문서에서 확인한다. 모델 성능/holdout PASS/배포를 주장하지 않는다. Agent 시간 / Tokens: 계측값 제공 안 됨(임의 수치 미기재). push·PR·배포·외부 메시지·유료/라이브 모델 호출0회, 새 의존성0개.
- 11/01 로컬 커밋 시도: 직전 `git branch --show-current`로 DEV-187 브랜치 확인. `git add <위 10경로> && git commit -m 'feat(source): AC-SRC-2/3/6 최종 문장 gold와 채점기 추가 (DEV-187)'`는 git add에서 `.git/worktrees/farmclub-final-scorer/index.lock: Operation not permitted`로 종료128. commit 단계는 실행되지 않았고 커밋0개, 변경10개는 모두 미커밋 상태로 남긴다. 사용자 지시대로 권한 우회·push·PR은 하지 않는다.

- 11/01 round 2 시작: round 1 미커밋 변경 위에서 진행. 사용자가 sandbox 밖 전체611 passed를 확인했다. 이번 수정 후 지정 focused/full 테스트를 재실행하며 live call/push/PR/의존성 추가 금지를 유지한다.
- 11/01 round 2 구현: count 조사/어미 양방향 정규화·천 단위 쉼표 제거·단위 뒤 영문 경계·gold contains 검증 및 회귀 추가. platform/health 상수 목록·안전성/precision 연동, caseType/byCaseType 별도 집계, 로컬 list gold·SHA/lock 검사·where 선택·덮어쓰기 보호를 구현했다. DEV-186 제품 코드는 수정하지 않았다.
- 11/01 round 2 합성20건을 규칙9~12와 대조:02 자연 문구 복원,06/09 운영 안내를 platform 금지로 이동,20 배송일을 platform 금지로 추가. 현재17문장/23사실/forbidden14, extraction15/contract5. gold 파일·source 정규 JSON 해시 및 schema 재생성. 공개12건 LOCAL_PRIVATE에는 지정 private 파일 SHA만 기록하고 holdout lock에는 지정 metadata만 기록했다.
- 11/01 round 2 로컬 validator(`cd server && uv run python -`에서 load_local_gold 및 Gold.model_validate, 본문/입력/오류 context 출력 금지): 두 파일 SHA와 holdout 로컬 lock SHA 일치. holdout12 source/140 sentence/253 fact에서 오류4개(미등록 forbidden.kind2, 정규화 후 토큰 불일치2). public development12/42/63에서 오류50개(notes 추가12, fact.where 추가35, 빈 product2, 미등록 forbidden.kind1). 엄격 검증을 유지하여 둘 다 채점을 거절한다. 본문 복사/수정/holdout 튜닝/채점 없음. 추가 입력 계약 여부를 사용자에게 비동기 질문했으며 응답 전 허용 범위를 넓히지 않는다. → 정정: 공개 개발 gold의 실제 원인은 sentence가 아닌 forbidden 항목의 `where`와 source `notes`였다.
- 11/01 round 2 첫 지정 focused: ruff 통과,252 passed/1 failed(28.23s). 새 격리 테스트가 과거 개발 노출4건의 split=holdout 메타데이터를 탐지했다. (이 정정은 이후 되돌렸다. 위 결정 사항 참고.) 재실행 `cd server && uv run ruff check . && uv run pytest tests/test_final_score.py tests/test_source_corpus.py` → All checks passed! / **253 passed,0 failed(56.16s)**. 테스트 후 출력 가림 assertion 한 곳을 강화했으며 전체 pytest가 이를 포함해 실행 중이다.
- 11/01 round 2 검증 환경: UV_CACHE_DIR=/private/tmp/farmclub-dev187-uv-cache, 격리 로컬DB localhost:55484/farmclub_dev187(pytest _test). `uv run ruff check . && uv run ruff format --check app/source_analysis/final_score.py tests/test_final_score.py` → All checks passed! /2 files already formatted. 전체 `uv run pytest`의 로그는 /private/tmp/farmclub-dev187-round2-pytest.log이며 결과 확인 전 완료 체크하지 않는다.
- 11/01 round 2 scan-before-commit: scorer/테스트 전문·gold/schema/manifest/lock·문서 변경 확인, 호출부·입력/출력 redaction·해시·분모·경로 감사. 허용11경로/범위 밖0. `git diff HEAD --check` 통과, origin/main...HEAD 차이0; 오래된 local main...HEAD의652경로는 이번 미커밋 변경이 아니다. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건. 두 종류 봉투·where 선택·평가 alias는 사용자 요청 현재 계약이며 작업 중간 구조 호환이 아니다.
- 11/01 round 2 전체 `cd server && uv run pytest` → **675 passed/32 failed(141.77s), 종료1**,707 collected. 실패는 round 1과 같은 기존 source_analysis/editor/gemini_ocr/integration/recovery/visual_quality32건이며 final_score/corpus 테스트는 전부 통과했다. 추가로 `uv run python -`의 psutil.Process().children(recursive=True), `uv run python -c`의 기존 prepare('감귤'.encode(), 'text/plain')에서 모두 PermissionError [Errno 1] Operation not permitted (originated from sysctl() malloc 1/3)을 재현했다. 제품 코드/테스트 우회·약화 없이 sandbox 밖 재실행이 필요하다. 사용자 확인 round 1 sandbox 밖611 passed는 기존 기준이며 이번707건 통과를 대신하지 않는다.
- 11/01 round 2 최종 제한: 로컬 private gold는 두 SHA/holdout lock 일치만 확인됐고 엄격 schema/contains 검증 오류4/50으로 로드/채점 불가였다(아래 기록에서 해소). private gold 내용 확인을 통한 scorer 튜닝은 하지 않는다. 문서의 MONEY_RE 제2원칙 오탐·한글 직전 마침표 분리 한계·빈 gold 전체 gate FAIL, DEV-186 금지어 목록 동기화를 유지한다.
- 11/01 round 2 커밋 예정(전체 미커밋11경로 한 커밋): `feat(source): add AC-SRC-2/3/6 final-text scorer (DEV-187)`. live call/push/PR/새 의존성/비공개 본문 복사0. Agent 시간 / Tokens: 계측값 제공 안 됨.
- 11/01 round 2 커밋 시도: 직전 `git branch --show-current` → jinumeral/dev-187-final-text-scorer 확인. 명시한11경로 `git add ... && git commit -m ...`는 git add에서 공용 worktree index.lock 생성 권한 오류(Operation not permitted), 종료128. commit 단계 미실행/커밋0개이며 변경11경로를 미커밋으로 남긴다. 권한 우회·push·PR 없음. scan 결과 남은 코드 CRITICAL/WARNING0건; private 입력 검증 실패와 전체32실패는 위에 명시한 미해결 제한이다.
- 11/01 Claude 리뷰 반영: (1) 과거 `source-visual-2026-10-16.json` 수정을 되돌리고 격리 테스트 범위를 `source-final-*.json`으로 좁혔다. (2) 당도 단위(`브릭스/Brix/°Bx`)를 앞뒤 글자와 상관없이 `brix`로 맞췄다(holdout 토큰 불일치2의 원인은 채점기 정규화였다). (3) 다른 종류에 맞지 않는 판매처 안내용 forbidden kind `other`를 추가했다. (4) 공개 개발 gold는 notes·forbidden.where를 별도 로컬 파일로 옮기고 빈 product를 `(상품명 없음)`으로 채워 SHA를 `3ed46597…`로 다시 고정했다. holdout 파일은 바꾸지 않아 lock(`5a906044…`)이 유지된다. 로컬 검증 결과 두 파일 모두 **오류0**. (5) 금지어 목록과 금액 regex를 DEV-186 `text_safety_lists.json`·`MONEY`와 같게 맞추고, 띄어쓰기만 다른 단어는 한 번만 센다. 머지 뒤 import로 합친다. (6) 번호 목록 `1.`은 문장으로 나누지 않는다. (7) private list gold에 `format` 키가 있으면 거절한다.
- 11/01 Claude 리뷰 2차 반영: gold 검증이 채점기와 같아지도록 (1) 정답 문장에 건강·운영 금지어가 있거나 (2) 같은 source의 금지 구절이 정답 문장 안에 있으면 거절한다. 로컬 private gold의 형식은 레포 holdout lock·dev manifest의 `{id, format}`과 대조해 다르면 거절한다. 줄 머리 번호 목록(`1.`)은 숫자 토큰에서 빼고, `1500-2000g`·`1600-1800m` 같은 범위는 대표번호로 보지 않는다. 효능 목록은 오탐을 줄이려 문맥 있는 표현(`소화를 돕`, `피부 미용` 등)으로 좁히고, 금액 식은 `원` 뒤 산·주·물·예·료·래·두·형·리·칙을 제외한다(`1 원산지`, `원주`, `제2원칙`). DEV-186도 같은 목록·식으로 맞춘다. 로컬 holdout·공개 개발 gold는 새 검증에서도 오류0이다.
- 11/01 Claude 리뷰 3차 반영: 대표번호 범위 예외(`1500-2000g`)를 `1[568]xx` 분기에만 두어 휴대전화·지역번호 탐지를 되살렸다(`010-1234-5678과` 등 회귀 테스트). `한 개월`·`한 개인`은 숫자로 바꾸지 않는다. 보고서 덮어쓰기 보호에 레포 holdout lock·dev manifest를 더했다. 형식 문서에 새 gold 검증 2가지와 금액 식의 놓침 방향 한계를, spec.md에 gold 검증 결정을 적었다.
- 11/01 검증(샌드박스 밖, `DATABASE_URL=…/farmclub_dev187`): `cd server && uv run ruff check .` → All checks passed. `uv run pytest tests/test_final_score.py` → 177 passed. `uv run pytest` → **721 passed**. 로컬 holdout·공개 개발 gold는 `load_local_gold`로 로드 성공(holdout 12 source/140문장, 공개 개발 12/42).
- 11/01 Claude 리뷰 4차 반영: 대표번호 범위 예외는 한글 단위가 공백 없이 붙을 때만 적용한다(`1588-1234 원하시는`·`1588-1234 개인`은 연락처로 탐지). 탐지를 넓혀 050x 안심번호, 하이픈 앞뒤 공백·en dash·괄호 지역번호도 잡는다. `--gold`는 holdout split을 거절해 holdout은 SHA·lock·형식이 고정된 runs.json `gold` 배열로만 채점한다. 금지어·금지 구절은 출력 문구 하나씩 비교해 문구 경계를 넘는 가짜 위반을 막는다. 합성 06/09의 금지 구절이 문장 전체인 점은 알려진 한계로 남긴다(바꿔 쓴 운영 문구는 platform 단어 목록·사람 검토로 확인).
- 11/01 Claude 리뷰 5차 반영: 가격·전화·email·unsupported 토큰도 출력 문구 하나씩 검사한다(문구 경계를 넘는 `5`+`원하시는` 가짜 금액 방지). 전화 탐지에 080과 대표번호의 en dash·공백 하이픈을 더했다. `--gold` 봉투 source의 format이 gold와 다르면 거절한다. 형식 문서에 `score()`가 holdout 진입점이 아님(holdout은 CLI runs.json `gold` 경로로만), 050x·080, 숫자 뒤 마침표+공백 분리 한계를 적었다.
- 11/01 검증(5차 반영 뒤, 샌드박스 밖, `DATABASE_URL=…/farmclub_dev187`): `cd server && uv run ruff check .` → All checks passed. `uv run ruff format --check app/source_analysis/final_score.py tests/test_final_score.py` → already formatted. `uv run pytest tests/test_final_score.py` → **188 passed**. `uv run pytest` → **732 passed**. 로컬 holdout·공개 개발 gold `load_local_gold` 로드 성공.

## DEV-186 Two-stage product draft · 상세 문구 정리

- 이슈: [DEV-186](https://linear.app/sswp6/issue/DEV-186)
- 브랜치: `jinumeral/dev-186-two-stage-refine-draft`
- 기능·인수 조건: FEAT-03/04/07 · AC-SRC-1/2/3/5/6/7/10/11
- 상태: 2026-11-01 owner 배송 정책 반영, 검증 일부 미완료(전체 pytest 927 passed/32 failed·Chromium 미실행, 로컬 커밋 권한 차단). 이전 트리 검증: 커밋 전 검증 완료(샌드박스 밖) — ruff 통과, pytest **743 passed**, typecheck 통과, test:mock **46 passed**, Playwright **35 passed**. UI 검증 상세는 producer 기록 참조.

### 목표
원문 후보·근거를 보존하면서 대상별 2차 문구 정리로 금액·효능·운영 문구를 상세에서 제외한다.

### 범위 (수정 허용 경로)
- `server/app/ai/{source_analysis,source_refine}.py`, `server/app/source_analysis/**`
- `server/migrations/versions/0023_source_refinement.py`, `server/tests/test_source_refine.py`
- `apps/producer/src/lib/{NewProductComposer,PageCanvas,SourceDetailsEditor,SourceWorkspace,SourceExclusions}.tsx`, `apps/producer/tasks.md`
- `packages/api/src/{sourceAnalysis,sourceTextSafety}.ts`
- `scripts/mock-tsconfig.json`, `scripts/{mock-server,test-spec12,test-capacity,test-navigation,test-storefront,test-ai-feedback}.mjs`
- `scripts/e2e/{new-product-composer,source-review-regressions}.spec.ts`
- `docs/spec/{source-analysis,source-integration,ia}.md`, `docs/wiki/Source-Analysis.md`
- `.github/workflows/{ci,deploy-vercel}.yml`
- `server/tests/test_final_score.py`, `docs/spec/validation/{source-final-gold-i3-dev-synthetic.json,source-final-dev-manifest.json,source-final-gold-format.md}`
- `apps/producer/src/lib/sourceExclusionReasons.ts`

### 비범위
- Stage-1 추출 프롬프트 변경(명시적 mock fixture 추가만 허용), 의존성 추가, stage-1 corpus 변경(holdout lock·LOCAL_GOLD_SHA256은 11/01 v1.1 재잠금으로 예외), 운영 접근·실호출·push·PR. 로컬 커밋은 이번 사용자 지시로 허용.

### 결정 사항
- 2026-11-01 owner 변경: R-19에 따라 판매자가 출하하므로 택배사·포장/완충·농장 직배송·수확 직후 포장/발송·도서산간 배송 가능 여부는 delivery에 보존한다. 기간(period), 금액(price), 공통 정책(platform)은 제외한다. 기간은 ② 받는 시기, 배송비는 ② 판매·가격에서 생산자가 정한다(R-20).
- 2026-11-01 정제 출력의 platform/period는 거절 대신 diagnostics warning으로 기록한다. 금액/효능 hard reject·근거 검증은 유지한다. 판단 없는 fallback은 period도 자동 채움하지 않는다. 공유 JSON과 prompt v4로 reuse를 무효화한다. scorer 금지 검사는 money/health/platform/gold-forbidden 그대로 유지한다. 합성06 배송 사실만 복원하고09 문의·20 배송일은 금지로 유지하며 합성 해시만 재생성한다.
- 2026-11-01 모달은 문구 추측 없이 reason별로 그룹화한다(price에 반품 배송비 포함). Figma와 Chromium 실행은 사람 후속으로 남긴다.
- 전처리·추출이 모두 성공한 뒤 대상별 REFINE Item을 큐에 넣고 기존 lease/비용 예약/정산 경로를 사용한다. REFINE 단독 재시도도 지원하며 불확실 전송은 자동 재호출하지 않는다.
- Item.refinement에 후보 ID·정리 모듈·excluded·프롬프트 버전·안전 목록 SHA256을 저장한다. 현재 후보·버전·해시가 모두 일치해야 재사용하고 불일치 시 다음 분석에서 다시 정리한다. `source-refine-v3`는 건강 효능 후보 전체 인용을 금지한다.
- 유효한 정리에서 누락·거절한 필드는 되살리지 않는다. 취소/삭제/버전 변경으로 오래된 비활성 정리는 대상 키를 생략해 원문 fallback을 허용하고 실제 현재 후보 REFINE 대기만 None이다. 원문 fallback도 금액/효능/플랫폼 후보를 걸러내고 usable 대상별 단일/충돌을 공통 unassigned보다 우선한다.
- 조회 때 정리 문구를 현재 금액/효능 detector로 재검사하고 price/health 제외 사유로 보낸다. 내부 modules는 editor 계산에만 사용하며 review 응답에 노출하지 않는다.
- 생산자 수정·확정·제외는 재분석으로 덮어쓰지 않는다. REFINED 저장은 저장된 문구·ID 및 현재 근거와 대조한다. editor는 활성·비제외 필드만, 비편집 save_drafts는 비활성 포함 모든 CONFIRMED 필드를 검사한다. historicalSales 확정 금지; 가격 없는 이력은 REFINED farmStory로 허용.
- 성공 REFINE의 error는 null; 거절은 diagnostics/excluded에 기록한다. post-call SOURCE_CHANGED/PRIVACY_CHANGED는 usage/request_id를 보존한다. 실패 안내는 anchor 파일명과 분리한다.
- detector 단일 원천은 UTF-8 `text_safety_lists.json`; TS 직접 상대 import와 mock rootDir 정렬로 심링크를 제거했다. 금액/효능 저장 차단, 수치/단위·개인정보·대상 검증 유지. JSON 단독 변경도 apps CI와 Vercel 배포를 실행한다(integration은 server/**로 이미 포함).
- 11/01 이번 리뷰의 위 결정과 workflow 범위 확장을 코드 수정 전에 기록했다. 서버 migration0023은 앱보다 먼저/동시에 적용하며 구버전 API 호환 UI는 producer 기록을 따른다. 사용자 지시대로 spec push·PR·알림을 생략한다.

### 작업
- [ ] 서버 구현·회귀 및 전체 검증 최종 확인 (아래 실제 실행 결과 기준)
- [ ] 사람 UI 회귀·Figma 후속 확인 (producer 기록)

### 완료 조건
- [ ] 관련 서버·앱 테스트가 모두 통과한 현재 트리 확인
- [ ] 사람 리뷰 후 별도 PR·머지 (이번 세션 범위 밖)

### 기록
- 11/01 이전 회차 이력 요약: 서버 신규 검증 48→109→176→190개. sandbox pytest 결과 560/32 실패→621/32→688/32→702/32(734개). 실패 ID는 같은 기존32개였고 psutil/sysctl 권한 오류를 재현했다. 실제 전처리 보호·기존 테스트는 완화하지 않았다. 이전 migration upgrade/current는0023, 단일 head 확인. 커밋 시도는 index.lock 권한 거부로 실패했으며 미커밋 유지.
- 11/01 최신 사람 제공 sandbox 밖 결과(이번 수정 전): `cd server && uv run ruff check . && uv run pytest` → ruff 통과, **734 passed / 0 failed**. 기존 sandbox 미완료 기록을 현재 외부 실패로 취급하지 않는다.
- 11/01 이번 리뷰 회귀: 취소 후 추출/자료 삭제2경우, 프롬프트/안전 해시/누락 해시3경우의 fallback→재분석, 조회 금액/효능2경우, 프롬프트 전체 health 제외, UTF-8/파일 SHA 검증. API internal modules 비노출과 안전 필드 보존도 단언한다. 기존 REFINE pending·건강 후보 영양소 복원 금지·shared-only 테스트 유지.
- 11/01 추가 회귀의 최초 실행은 업로드 fixture가 오래된 batchVersion을 사용해2실패/197통과였으며 최신 batch 조회를 추가해2/2 통과했다. 모델·운영 호출은 없다.
- 11/01 이번 수정 후 최종 검증(기존 의존성, `<로컬 DB>`와 `<로컬 캐시>`):
  - `cd server && uv run ruff check . && uv run pytest` → ruff **0 errors**, pytest **711 passed / 32 failed**(743개,129.70초). `test_source_refine.py` **199개 모두 통과**(기존190 + 신규9). 실패 node ID를 실행 전 pytest cache와 대조해 **동일32개 / 신규0개 / 해소0개**를 확인했다. 기존 sandbox 전처리 실패 집합이며 이번 실행의 전체 통과로 기록하지 않는다. 기존 테스트/생산 보호를 완화하지 않았다.
  - 사용자 제공 수정 전 sandbox 밖 **734 passed / 0 failed**와 이번 sandbox 결과를 구분한다. 현재 트리의 전체 pytest743개는 sandbox 밖 재실행이 필요하다. UI/mock 최종 결과는 producer 기록 참조.
  - `git diff --check` 통과. `git diff main...HEAD`652경로는 세션 전 local main 차이이고 `git diff origin/main...HEAD`0건. 미커밋/신규38경로를 위 범위와 대조해 범위 이탈0개. HEAD/ref/index 변경·커밋·실호출·push·PR·새 의존성 없음.
- 11/01 작업 기록 정리: DEV-186의 과거 반복 로그는 이 절로 요약했고 UI 상세는 producer 기록에만 남긴다. 환경은 `<로컬 DB>`·`<로컬 캐시>`로 표기한다. 대표 프롬프트: pre-commit 지적12개 수정과 각 코드 회귀 요청. Agent 시간 / Tokens: 계측 미제공.

### 의도한 커밋 (실행하지 않음)
1. `docs(source): AC-SRC-1/2/3/11 정리 계약과 배포 순서 기록 (DEV-186)` — docs/spec 3개·영문 wiki·server spec/tasks·producer tasks.
2. `feat(source): AC-SRC-2/3/5/10/11 안전한 대상별 정리와 fallback (DEV-186)` — 서버 코드·JSON·migration0023·test_source_refine.py.
3. `feat(producer): AC-SRC-3/5/11 제외 안내와 구버전 API 호환 (DEV-186)` — producer UI·api·workflow·mock harness·Playwright 회귀.
- 11/01 Claude 리뷰 반영(커밋 전 마지막): 정리 결과의 `version`·`safetyListsHash`는 항상 기록되는 필수 키라 `[]`로 읽고, 커밋된 적 없는 해시 없는 형태를 받아주던 테스트 매개변수를 지웠다. `process()`의 버전 중복 검사를 지웠다(`check_inputs`가 검사). 문구에 실제로 반영된 중복·금액 없는 과거 판매 후보는 '뺀 문구' 안내에서 뺀다. DEV-172 절에 잘못 들어간 기록 수정은 되돌렸다.
- 11/01 최종 검증(샌드박스 밖, `<로컬 DB>`): `cd server && uv run ruff check .` → All checks passed. `uv run pytest` → **742 passed**. `npm run typecheck` → 통과. `npm run test:mock` → **46 passed / 0 failed**. Playwright `new-product-composer`·`new-product-two-step`·`source-detail-design`·`source-review-regressions`·`source-editor`·`source-workspace-ui` → **35 passed**. Codex가 브라우저 없이 쓴 회귀 spec은 가짜 API 응답(`serveReview`)과 편집 탭 열기를 고쳐 통과시켰다(앱 코드 문제 아님).
- 11/01 Claude 리뷰 반영(최종 스캔): 배포 전에 저장된 자동 값(UNREVIEWED·EXTRACTED/REFINED)에 금액·효능·운영 문구가 있으면 다시 계산해 자동 채움하지 않는다(`test_AC_SRC_3_legacy_saved_autofill_with_money_is_recomputed`). runs 응답에서 내부 `refinement`를 뺐다(review의 excluded·refinementVersion만 공개). '뺀 문구' 숨김 조건을 `historical`과 `historicalSales` 필드 둘 다로 맞췄다. CI apps 필터에 `text_safety_cases.json`을 더했다. editor.py·service.py 포맷을 정리했다. 재검증: ruff 통과, pytest **743 passed**, Playwright 6개 spec **35 passed**.
- 11/01 main(#342, DEV-187) 병합: 문서 끝 절 충돌은 두 절을 모두 남겼다. 채점기 `final_score.py`가 금액 식과 건강·운영 금지어를 `text_safety_lists.json`(`text_safety.MONEY`·`SAFETY_LISTS`)에서 직접 읽도록 합쳐 원천을 하나로 만들었다(`test_AC_SRC_6_scorer_reads_the_shared_product_safety_lists`). 위 기록 중 sandbox 안 결과(711 passed/32 failed, Playwright 0 passed/8 failed)와 `origin/main...HEAD 0건`은 당시 기록이며, 최종 결과는 아래 병합 뒤 검증이다.


### 2026-11-01 owner 배송 정책 변경 후속 기록
- R-19의 판매자 출하를 근거로 prompt v4·mock·공유 detector·fallback·warning·producer 사유별 모달·문서·합성 gold를 정렬했다. 포장/완충/직배송/택배사/수확 직후 포장·발송/도서산간 가능 여부는 delivery에 보존한다. 합성06은 배송 사실을 복원하고09 문의·20 배송일은 계속 금지한다. 합성18문장/24사실, extraction16/contract4. holdout lock·LOCAL_GOLD_SHA256·LOCAL_PRIVATE manifest 항목·final_score.py는 HEAD와 바이트/값 동일함을 확인했다. 기간 별도 scorer count는 추가하지 않았다(기존 금지 검사 유지).
- 최초 `cd server && uv run ruff check . && uv run pytest` → ruff 통과, **920 passed / 33 failed**(953개,152.81초). v3 prompt pin 신규 실패1개를 v4로 갱신했다. 다른32개는 기존 source 전처리 실패 집합이다. 대표 실패를 파일 수정 없는 worker.fail 진단 wrapper로 재현: **1 failed**, `PermissionError [Errno 1] Operation not permitted (originated from sysctl() malloc 1/3)`; `prepare`의 psutil 자식 프로세스 조회에서 발생한다. 보호 로직/테스트는 완화하지 않았다.
- 공유 기간 detector의 출고 요일 패턴이 '출고 수량'이나 '수확 당일 포장해 출고'를 막지 않도록 경계를 제한하고 양쪽 언어 공용 사례를 추가했다. 모달 mock은 반품 배송비를 price에 묶고 period/platform/health의 정확한 안내와 그룹을 검증한다.
- 최종 검증 결과는 아래에 이어 기록한다. `UV_CACHE_DIR=/private/tmp/farmclub-dev186-uv-cache`, 사용자 지정 격리 `DATABASE_URL` 사용(pytest는 `_test`). 실호출·push·PR·새 의존성0회. Playwright는 사용자 지시대로 Chromium 미실행이며 현재 UI 완료 체크를 하지 않는다. Figma v6는 디자인 담당자/owner 후속 작업이다.
- `scan-before-commit` 점검: 수정/신규26경로 범위 이탈0, 호출부/사유 union/JSON Python·TS 소비자 대조. 추가 이슈 없음. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건. `git diff main...HEAD`671경로는 기존 local main 기준 차이, `origin/main...HEAD`41경로는 기존 DEV-186 변경이며 관련 범위와 대조했다. 이번 수정은 HEAD 기준26경로다.
- 작업 브랜치 확인 뒤 `git add` 실패: `.git/worktrees/farmclub-refine-draft/index.lock: Operation not permitted`. 로컬 커밋0개, staging/HEAD 변경 없음. sandbox 우회·다른 worktree 변경 없이 미커밋 결과를 남긴다.
- 의도한 커밋: (docs) `docs(source): R-19 배송 방법 보존과 AC-SRC-3/11 안내 정리 (DEV-186)` — 제품 spec/wiki·gold 형식 문서·서버 spec/tasks·producer tasks. (server) `fix(source): AC-SRC-2/3 배송 보존과 기간 제외 진단 (DEV-186)` — 서버·공유 JSON·pytest·합성 gold/manifest. (producer+api) `fix(producer): AC-SRC-3/11 기간 사유와 공통 정책 안내 (DEV-186)` — producer/helper·api·mock·Playwright.
- Agent 시간 / Tokens: 계측 미제공(추정 미기재). 대표 프롬프트: R-19에 따라 배송 방법과 기간·금액·공통 정책을 전 영역에서 분리하고 실호출 없이 검증. 남은 검증은 sandbox 밖 전체 pytest와 Chromium, owner의 로컬 gold 재잠금이다.

- 2026-11-01 최종 트리 검증: 지정 DB/UV_CACHE_DIR에서 `cd server && uv run ruff check . && uv run pytest` → **ruff All checks passed**, **927 passed / 32 failed**(959개,155.13초, 종료1). 로그 `/private/tmp/dev186-final-pytest.log`. 1차 실패 집합과 대조해 신규0개, prompt v3 pin1개 해소, 기존 전처리32개 유지. `test_source_refine.py`와 `test_final_score.py` 실패0(택배 보존·period 제외/경고/fallback·합성 자기 채점 포함). 전체 통과/완료로 표시하지 않는다.
- 2026-11-01 최종 `npm run typecheck` → **5 workspace 통과 / 0 실패**, `npm run test:mock` → **47 passed / 0 failed / 0 skipped**(28.42초, 로그 `/private/tmp/dev186-final-mock.log`). Playwright 두 spec TypeScript 검사 종료0, Chromium 본문 미실행. 상세 명령은 producer 기록. `git diff --check` 통과. 추가 코드 변경 없이 검증 결과만 기록했다.
- 최종 남은 일: owner/리뷰어가 sandbox 밖에서 전체 pytest와 두 Playwright spec을 실행하고 디자인 담당자가 Figma 문구를 맞춘다. (정정: holdout은 같은 날 v1.1로 재잠금했다.) 모델의 platform/period 누락은 hard reject 대신 warning이므로 실제 출력 품질은 별도 확인이 필요하다. 커밋 권한이 있는 환경에서 위 세 커밋을 생성한다.
- 11/01 배송 정책 변경 반영 뒤 Claude 확인: holdout 잠금 기록을 v1.1(146문장·261사실, 배송 방식 사실 복원)로 갱신했다(`source-final-holdout-i3-lock.json`, `LOCAL_GOLD_SHA256`). `test_AC_SRC_5_11_stale_refinement_restores_verbatim_fallback[delete_source]`가 전체 실행에서 가끔 실패한 원인은 두 자료에 같은 문장이 있어 처리 순서에 따라 후보 소유 자료가 바뀌는 것이었다(앱 버그 아님). 테스트가 정리 입력 후보를 가진 자료를 지우도록 고쳤다. 검증: typecheck 통과, test:mock **47 passed**, Playwright 6개 spec **35 passed**, 로컬 holdout v1.1·공개 개발 gold 로드 성공.
- 11/01 최종 스캔 반영: 기간 정규식이 보관·후숙 기간("실온 5~7일 보관", "수확 후 3~5일 후숙")까지 잡던 회귀를 고쳐, 숫자 기간 뒤에 도착·발송·출고·배송·수령이 오거나 "주문 후 N일"일 때만 기간으로 본다. 공유 사례에 보관 기간 음성 사례 4개를 더했다. holdout 재잠금 여부를 적은 문서끼리의 모순을 v1.1 재잠금 완료로 맞췄다.
- 11/01 최종 검증(배송 정책·기간 규칙 반영 뒤, 샌드박스 밖): `cd server && uv run ruff check .` → All checks passed. `uv run pytest` 2회 연속 → **964 passed / 964 passed**. `npm run typecheck` 통과. `npm run test:mock` **47 passed**. Playwright 6개 spec **35 passed**. `stale_refinement…[delete_source]`는 남은 후보가 이전 분석의 정리 입력과 같으면 그 정리가 다시 쓰이는 정상 동작을 허용하고, 낡은 이번 정리가 쓰이지 않는지만 확인하도록 고쳤다.

## DEV-170 [I3-T11] AI product-draft quality evaluation per format

- 이슈: [DEV-170](https://linear.app/sswp6/issue/DEV-170)
- 브랜치: `jinumeral/dev-170-i3-t11-quality-eval`
- 기능·인수 조건: FEAT-03/04/07 · AC-SRC-2/3/5/6, M-11/13/18
- 상태: 리뷰 보완 구현 완료·환경 검증 미완료 (지정 pytest 525통과/6실패, Playwright 시작 권한 차단; 평가 FAIL·사람 감사 미완료)

### 목표
고정된 final-text gold로 실제 stage-2 정리/검증 결과를 형식별 평가한다. mock은 실행 경로 검증이며 품질 결과가 아니다.

### 범위 (수정 허용 경로)
- `server/app/source_analysis/{final_eval.py,budget.py,worker.py,refinement.py,spec.md,tasks.md}`
- `server/app/ai/{source_analysis.py,source_refine.py,source_ocr.py}` (개발 결과 기반 프롬프트·인증 오류 코드)
- `server/tests/{test_final_eval.py,test_final_score.py,test_source_analysis.py,test_source_refine.py}`, `Makefile`
- `apps/producer/src/lib/SourceWorkspace.tsx`, `scripts/e2e/source-review-regressions.spec.ts`
- `docs/spec/source-analysis.md` (인증 오류 안내 계약)
- `docs/spec/validation/source-final-eval-i3-2026-11-01.{md,json}`
- `docs/wiki/Source-Analysis.md`

### 비범위
- 유료/실모델 호출·키 탐색·holdout 실행/튜닝·private 자료 저장소 복사·새 의존성·push·PR·운영 접근.

### 결정 사항
- 11/01 사용자 제공 이슈/완료 조건을 원천으로 삼고 기존 브랜치에서 작업한다. spec 스킬의 push/PR 절차는 사용자 지시로 생략한다.
- 11/01 in-process runner는 제품 parser/OCR·extract·worker.validate_candidates·refine·refinement.validate를 사용하고 검증 모듈을 로컬 저장한다. 공개 페이지/상품은 쓰지 않으며 적용 페이지 안전성은 사람 검증 전 BLOCKED다.
- 11/01 보고서에는 scorer의 가림 계약을 유지한다. 원문·후보·문장·worksheet는 저장소 밖 새 전용 출력 폴더에만 저장한다. holdout marker는 호출 시작 전 독점 생성하고 실패해도 유지한다.
- 11/01 비용은 budget.py의 예약 상한/Spend 정산을 재사용하고 run별 추가 한도를 매 호출 전 검사한다. 불명확 비용은 예약액으로 유지하며 재시도하지 않는다.
- 11/01 감사 CSV는 문장 index/hash를 검증해 supportJudgments로 되돌린다. 중요 문장 외 전체 문장도 감사 가능하며 누락/충돌은 source별 별도 감사 표에 기록한다.

- 11/01 R2 후속: 개발32건의 누락/오배치/금지/EMPTY 원인을 private 폴더에만 기록한다. gold·scorer·holdout·검증 보호는 변경하지 않는다. 두 단계 프롬프트만 개선하고 버전을 올린다. OCR 누락이 주원인이 아니면 OCR 프롬프트는 유지한다.
- 11/01 R2 후속: runner 실패는 고정 allowlist errorCode만 metadata에 기록하고 401/403은 PROVIDER_AUTH로 구분해 첫 발생 시 중단한다. 이후 자료는 NOT_RUN으로 분모에 유지한다. 비용 한도에는 미정산 예약을 유지하되 costUsd는 정산액만, reservedUsd/settledUsd/unsettledReservedUsd를 분리한다.
- 11/01 R2 후속: 대상 이름 없는 runner 입력의 혼합 상품 한계와 gold/안전 계약 충돌은 원인에 명시한다. gold의 product/문장은 모델 입력으로 사용하지 않는다. 실측은 사람이 실행한다.
- 11/01 최종 튜닝2/2: R3 unsupported4개는 월 범위의 표현 변경과 scorer의 부호/범위 토큰 비교 차이다. scorer/gold는 동결하고 개별 문장·토큰·근거는 private 분석에만 쓴다. 두 프롬프트는 숫자·단위·범위 구분자를 원문 그대로 복사하며 기존 식별 라벨·계절·절별 배치를 유지한다.
- 11/01 최종 튜닝2/2: 범위에 refinement.py를 추가한다. stage-1은 단위 포함 숫자를 검증하고 stage-2는 후보 value가 아닌 인용 quote만 숫자 근거로 사용하여 이전 후보의 단위 변조도 차단한다. 문의 채널은 platform 제외를 프롬프트에서 명확히 하고 기존 서버 platform/period warning 계약은 유지한다. 합성 회귀만 추가하며 추가 실측은 하지 않는다.

- 11/01 최종 보고: owner 제공 R4·holdout v1.1 최초1회 결과와 metadata/score/critical-audit 집계만 기록한다. 판정 FAIL, 평가 결과·scorer·gold는 동결한다. DEV-182/T23은 오류 유형 기반 일반 수정으로 계획하며 20페이지 초과 PDF는 첫20페이지 분석+나머지 생략 안내(owner 2026-11-01 결정)로 기록한다. 추가1회 T23 재측정은 부분 오염이며 최초 결과를 대체하지 않는다. 이후 holdout12건은 개발32→44건에 편입하고 독립 측정에는 동일3인 검토의 새 holdout v2가 필요하다. owner가 지적한 편향 위험은 인정되었으나 해소되지 않았다.

- 11/01 리뷰 보완: holdout mock 금지·강제 재실행 사유/누적 시도 번호 기록, 예상 밖 source 오류의 고정 SOURCE_FAILED 및 중단 시 finally metadata 보존을 검증한다. 숫자 format count만 no_text 예외로 허용하고 실제 문자열 차단은 유지한다. PROVIDER_AUTH 생산자/REFINE 안내와 E2E를 추가하며 재시도/불확실성 정책은 변경하지 않는다. 문서의 세션성 주장·로컬 경로·DB 이름·중복 커밋 계획을 정리하고 월 범위 회귀는 일반 합성 문자열로 교체한다.
- 11/01 Figma: 인증 오류 문구 동기화는 후속 작업으로 기록한다. 향후 PR의 `Figma:` 줄에 명시한다. 사용자 지시로 외부 변경·PR 생성은 하지 않는다.

### 작업
- [x] runner·봉투·비용/holdout 가드·집계·감사 worksheet 및 리뷰 보완 회귀 검증 (final_eval 전체 통과)
- [x] 개발 실패 분석·프롬프트 개선·quote 기반 숫자/단위 검증·합성 회귀 검증 (합성 회귀 통과)
- [x] 합성20·공개개발12 mock 전체 경로 실행 (기존 실행 기록)
- [x] owner 개발 R4·holdout 최초1회 집계 보고서·영문 wiki 작성
- [ ] PROVIDER_AUTH 생산자 안내·REFINE fallback 문구·Playwright 검증
- [ ] 관련 pytest·typecheck·test:mock 통과
- [ ] Figma v6 인증 오류 안내 문구 동기화 (후속 작업)

### 완료 조건
- [ ] mock 전체 경로·관련 테스트 통과
- [x] owner 개발 실측 → 버전 동결 → holdout 최초1회 완료
- [ ] 사람 critical/전체 문장·원본·누락/충돌·적용 페이지 감사
- [ ] 형식별 P/R ≥95%, 적용 페이지 unsupported critical 0, accepted evidence 100%, 누락/충돌 blank/flag 검증

### 기록
- 11/01 초기 runner/mock: 합성20 EVALUATED1/EMPTY19·40호출·$0, 공개개발12 EMPTY12·24호출·$0. 입력 snapshot과 감사 산출물은 저장소 밖에만 보존한다. final_score 관련 묶음은 213 passed / 0 failed였다.
- 11/01 R2→R3→R4: facts 57/87→71/87→72/87, critical 23/42→35/42→35/42, 오배치12→4→7, 금지2→1→0, unsupported0→4→0. R3의4개는 scorer의 범위 토큰 차이이며 원점수·gold·scorer를 유지했다.
- 11/01 `source-v7-fact-coverage` / `source-refine-v5-fact-routing`은 개발 중간 버전이며 배포된 호환 대상이 아니다. 최종 `source-v8-exact-numbers` / `source-refine-v6-exact-numbers`는 인용의 숫자·단위·범위 표기를 보존한다.
- 11/01 초기 테스트 실패는 신규 fixture 경로/필수 historical 누락 및 prompt 버전 varchar(30) 초과를 고쳐 해결했다. assertion이나 parser 보호를 약화하지 않았다. 이후 지정 묶음은 493 passed / 0 failed였다.
- 11/01 owner 최종 실측: 개발R4 32건 fact72/87·critical35/42·proxy65/67·정산$0.113482, holdout v1.1 최초1회12건 fact59/261·critical29/109·proxy60/63·정산$0.156935. 두 split 금지/unsupported0이나 형식별≥95% 목표 미달로 FAIL이다. critical-audit 개발30/holdout45행은 모두 미검토다.
- 11/01 owner sandbox 밖 전체 pytest: 1045 passed / 1 failed (보고서 no_text guard). test_core 실패 원인은 로컬 `.env`뿐이며 해당 파일 없이 통과했다. 이 기록은 이전 sandbox 실패와 구분하며 수정 후 실제 결과를 아래에 남긴다.
- 11/01 리뷰 보완 검증 진행: 개인정보 guard는 numeric text 집계를 허용하고 7개 text-ish 키의 문자열·문자열/객체 리스트·중첩 payload 차단을 검증한다. 월 범위 합성 회귀를 일반 문자열로 바꿨다. source/service의 PROVIDER_AUTH와 PROVIDER_REJECTED는 같은 수동 재시도 경로다. 자동 재시도는 retry_after가 있는 경우뿐이고 불확실 비용 확인은 REQUEST_UNCERTAIN만 요구한다. 평가 runner만 인증 실패 후 추가 지출을 막기 위해 전체 중단한다.

- 11/01 최종 지정 명령: `cd server && uv run ruff check . && uv run pytest tests/test_final_eval.py tests/test_final_score.py tests/test_source_refine.py tests/test_source_analysis.py --tb=short` → **Ruff 통과; 525 passed / 6 failed (71.96s)**. final_eval·final_score·source_refine 전체와 개인정보 guard 통과. 기존 worker6건은 PREPARE 실패이며 독립 합성 prepare의 `PermissionError(errno 1, sysctl)`로 sandbox 제약을 확인했다. 새 fixture의 필수 photo_requests 누락2건은 스키마에 맞춰 고쳐 통과했고 assertion은 유지했다. 로컬 `.env`는 임시 분리 후 복원했다.
- 11/01 앱 검증: `npm run typecheck && npm run test:mock` → **typecheck 통과; 47 passed / 0 failed**. `npm run test:e2e -- scripts/e2e/source-review-regressions.spec.ts` → **0 passed / 8 failed**, Chromium bootstrap_check_in / MachPortRendezvousServer 권한 오류1100으로 화면 assertion 미실행. 관련 테스트 전체 완료 체크는 하지 않는다.
- 11/01 최종 경로/정보 감사: HEAD 대비 변경20경로는 허용 범위 안이다. `git diff main...HEAD`는 기존 local main 대비672개 파일 이력이고 `git diff origin/main...HEAD`는0개다. 비공개 문장/holdout 패턴으로 추가 라인을 검사해 신규 일치0건이며 `git diff --check` 통과. 미커밋 변경을 보존했다.

### 남은 일
- sandbox 밖에서 지정 pytest와 source-review Playwright를 재검증한다. 사람 감사와 적용 페이지 검증, ≥95% 품질 목표는 미충족이다. DEV-182/T23 후속 수정·부분 오염 재측정 계획은 보고서에 보존한다. 이번 작업에서 live 호출·holdout 재실행은 하지 않는다.
- Figma 문구 동기화와 사람 리뷰/머지/배포 확인은 후속 단계다. 미커밋 변경을 유지하며 커밋·push·PR은 생성하지 않는다.

## DEV-182 [I3-T23] 추출 실패 유형 일반 수정

- 이슈: [DEV-182](https://linear.app/sswp6/issue/DEV-182)
- 브랜치: `jinumeral/dev-182-i3-t23-extraction-fixes` (base origin/main 51e5e95)
- 기능·인수 조건: FEAT-03/04/07 · AC-SRC-2/3/5/6/8/10/11
- 상태: 리뷰 수정·합성 회귀 확인, 전체 검증 미완료 (sandbox PREPARE17건·Chromium 실행 차단)

### 목표
T11 집계 오류 유형만 바탕으로 일부 후보 거절·긴 PDF·긴 텍스트·빈 결과를 일반 제품 규칙으로 고친다. 월 범위 scorer 오류는 측정 수정으로 분리한다.

### 범위 (수정 허용 경로)
- `server/app/source_analysis/{worker,preprocess,refinement,final_eval,final_score,synthetic,service}.py`, `server/app/source_analysis/{spec,tasks}.md`
- `server/app/ai/source_analysis.py`, `server/tests/{test_final_eval,test_final_score,test_source_refine,test_source_analysis,test_source_integration}.py`, `server/tests/fixtures/source-analysis/cases.json`
- `apps/producer/src/lib/{SourceWorkspace,NewProductComposer}.tsx`, `packages/api/src/sourceAnalysis.ts`, `scripts/e2e/source-review-regressions.spec.ts`
- `docs/spec/source-analysis.md`, `docs/wiki/Source-Analysis.md`, `docs/spec/validation/source-final-{gold-i3-dev-synthetic.json,dev-manifest.json,eval-i3-2026-11-01.md}`

### 비범위
- holdout private 경로/원문/gold 접근·모방·재실행, live/유료 호출, 새 의존성, push·PR·운영 변경.

### 결정 사항
- 11/02 사용자 제공 owner 결정·완료 조건을 적용한다. Linear는 이미 In Progress다. 사용자 지시대로 push/PR 절차를 생략한다.
- 11/02 리뷰 정정: 일부 거절은 main 계약대로 EXTRACT PARTIAL/CANDIDATES_REJECTED + acceptedCount/rejectedCount를 유지한다. refine은 모든 PREPARE/EXTRACT가 SUCCEEDED 또는 검증 거절로 acceptedCount>0인 EXTRACT PARTIAL일 때만 허용한다. Run 상태 계산·명시적 retry·후보 집합 변경 시 정리 outdated/동일 집합 성공 재사용 규칙은 유지하며 실패/불확실 호출은 자동 재생하지 않는다.
- 11/02 PDF는 첫20쪽만 파싱한 뒤 batch60쪽 제한을 적용한다. PREPARE 진단과 API에 pagesAnalysed/pagesSkipped를 보존하고 두 생산자 화면에 안내한다.
- 11/02 stage-1 텍스트는 span 경계를 보존해 최대4000자 묶음으로 처리한다. 시각 OCR 전체페이지 경로는 유지한다. stage-2는 원문 순서의 결정적 prefix(최대40후보/직렬 JSON16000자)를 사용하고 생략 수를 기록한다. 전체 후보 ID로 stale 보호를 유지한다.
- 11/02 EMPTY는 입력 없음/후보 없음/대상 일치 없음/정리에서 전부 제외의 고정 진단 코드로 구분한다. scorer는 실제 범위 표현을 단일 토큰으로 정규화하며 범위와 단일 끝점의 상호 지원은 금지한다.
- 11/02 합성 사례3건과 gold/manifest만 확장한다. 기존 private 항목·잠금 값은 변경하지 않는다. Playwright는 사용자가 실행하며 Figma 문구 동기화는 owner/디자인 담당자 후속이다.

- 11/02 자체 점검 보완: 같은 응답 안의 완전히 같은 후보(근거 포함)는 store_candidates에서 한 번만 저장한다. 다중 chunk의 전체 후보 수집·draft 보존을 DB 회귀로 확인한다. runner도 refine 상한으로 생략한 후보를 unused로 기록해 제품과 맞춘다.
- 11/02 리뷰 후속: run API는 파일의 모든 EXTRACT가 성공·빈 후보일 때만 emptyReason을 한 항목에 공개한다(청크별 진단은 비공개 유지). UI는 error가 있으면 emptyReason 안내를 생략하고 NO_CANDIDATES를 명시 매핑한다. 긴 text의 일부 빈 chunk/전체 빈 chunk를 pytest와 두 화면 stubbed Playwright로 검증한다.
- 11/02 리뷰 후속: scorer는 범위를 하나의 토큰으로 유지해 원문 범위의 단일 끝점을 지원하지 않는다. 하이픈/물결/각 끝점 단위·'에서 … 사이' 등 실제 범위 표현을 정규화하며 양방향 회귀를 추가한다. refine 입력 전체가 상한 때문에 빠지면 REFINE_INPUT_LIMIT로 기록·안내한다. text_chunks import·필수 pages 접근을 정리하고 정의 해시 설명은 제품 spec 한 곳으로 모은다.

- 11/02 추가 리뷰 결정: 에서/부터는 양 끝점의 단위가 같고 까지/사이로 닫히는 표현만 범위로 묶으며 그 외 수치는 분리한다. 기호 범위(-/~/–) 처리는 유지한다. REFINE의 후보 없음은 사유를 만들지 않고 NO_TARGET_CANDIDATES/ALL_TEXTS_FILTERED/REFINE_INPUT_LIMIT만 정리 사유로 공개한다. PARTIAL 거절 안내는 기존 오류 caption 한 줄에 개수·원문 확인 안내를 합친다. 평가 text chunk 추정은 UTF-8 디코딩 후 문자 수를 사용한다. 평가 source 전체의 NO_SAFE_TEXT/NO_CANDIDATES 진단은 유지하고 stage-2 빈 사유와 분리한다.
- 11/02 PREPROCESS_VERSION 변경은 유지하며, 이전에 준비된 자료는 다음 분석 실행에서 다시 준비한다.
- 11/02 이번 후속 범위는 기존 허용 경로의 scorer/refinement/final_eval·세 pytest 파일·두 생산자 화면·Playwright·제품 spec/wiki·구현 spec/tasks로 한정한다. 사용자 제공 리뷰와 기존 이슈 기록을 지시서로 사용하며 커밋·push·PR·live 호출·holdout 접근은 하지 않는다.

### 작업
- [ ] 수정1–5 및 합성 회귀/개발 사례·gold·해시
- [ ] 제품 spec·wiki·구현 결정·측정 수정 보고서
- [ ] 지정 Ruff/pytest/typecheck/test:mock 실행 결과 기록
- [ ] stubbed Playwright 회귀 작성 (실행은 사람)

### 완료 조건
- [ ] 관련 테스트 묶음 및 사람 Playwright 확인
- [ ] 사람이 개발 live 재측정 (이번 세션에서는 실행하지 않음)

### 기록
- 11/02 작업 시작. holdout에는 접근하지 않으며 외부 통지/PR은 생성하지 않는다.

- 11/02 신규 합성: `21-long-text` 8,703자(최소3 chunk), `22-pdf-25-pages` 25쪽 중20분석/5생략, `23-partial-validation` 유효2+잘못된 인용1. 제품 mock은 명시적 합성 SHA/문구만 인식하며 실제 모델 실패를 대신하지 않는다. 기존32개 manifest 항목·기존20개 gold source 객체의 값 동일성을 확인했다. 신규3건에는 원천 정의 canonical SHA를 잠그고 실행 전 OCR safeInput 해시를 만들지 않는다.
- 11/02 지정 전체 명령: `cd server && uv run ruff check . && uv run pytest tests/test_final_eval.py tests/test_final_score.py tests/test_source_refine.py tests/test_source_analysis.py tests/test_source_integration.py` (지정 DATABASE_URL, `SOURCE_ANALYSIS_PROVIDER=mock`, `UV_CACHE_DIR=/private/tmp/farmclub-dev182-uv-cache`) → **Ruff 통과; 580 passed / 16 failed (88.88s)**. 로그 `/private/tmp/dev182-final-pytest.log`. 14개는 기존 PREPARE 경로(source_analysis6/source_integration8)이며 독립 합성 `prepare(b'Synthetic text', 'text/plain')`에서 `PermissionError [Errno 1] Operation not permitted (originated from sysctl() malloc 1/3)`를 재현했다. parser 보호·기존 assertion은 유지한다.
- 11/02 나머지2개 신규 DB 회귀는 편집 저장을 거치지 않고 draft 저장을 호출한 테스트 준비 오류였다. 실제 UI와 동일한 PUT editor 저장을 추가했다. 수정 후 `cd server && uv run ruff check . && uv run pytest tests/test_final_eval.py tests/test_final_score.py tests/test_source_refine.py tests/test_source_analysis.py::test_AC_SRC_8_pdf_first_twenty_pages_metadata_and_reproducible_material tests/test_source_analysis.py::test_AC_SRC_8_batch_pdf_cap_after_per_pdf_cap --tb=short` → **Ruff 통과; 541 passed / 0 failed (77.35s)**. 로그 `/private/tmp/dev182-regressions.log`. 수정1–5 회귀, 금액/근거 검증, 실패·불확실 호출 재생 금지, chunk 병합/중복 제거/실제 draft, 25쪽 PDF와 batch60쪽 경계를 포함한다. 전체 묶음 통과로 표시하지 않는다.
- 11/02 `npm run typecheck && npm run test:mock` 최종 → **5 workspace typecheck 통과; mock47 passed / 0 failed / 0 skipped (27.11s)**, 로그 `/private/tmp/dev182-final-mock.log`. `node_modules/.bin/tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --esModuleInterop --skipLibCheck --types node scripts/e2e/source-review-regressions.spec.ts` → 종료0. Playwright 브라우저 본문은 실행하지 않았다(사용자 지시). 사람 실행: `npm run test:e2e -- scripts/e2e/source-review-regressions.spec.ts`.
- 11/02 scan-before-commit 자체 점검: HEAD 대비24경로·신규 파일0, 허용 범위 이탈0. 함수 호출부·API 필드·두 화면·runner/제품 입력 제한과 근거 검증을 대조했고 추가 문제 없음. `git diff --check` 통과. `git diff main...HEAD`680경로는 오래된 local main 대비 기존 이력이며 `origin/main...HEAD`0경로/HEAD=origin/main=51e5e95다. 이번24경로는 `git diff HEAD`로 대조했다.
- 11/02 레거시 호환 점검: 후보2건 — 지적0건 / 커밋된 구조2건 (`SourceRun` optional 카운트 기본값: d4efd6d, 기존 manifest32건의 `safeInputSha256`/새 정의 해시 선택 검증: 99c9707). 새 필드의 미제공은 기존 커밋된 API/manifest 형태이며 임시 구조용 별칭·변환은 없다.
- 11/02 의도한 커밋(실제 커밋·push·PR 없음): `docs(source): AC-SRC-2/3/5/8 일반 실패 복구 계약 정리 (DEV-182)` (제품 spec/wiki·구현 spec/tasks·측정 수정 보고), `fix(source): AC-SRC-2/3/5/8 추출 거절과 긴 입력 및 범위 채점 수정 (DEV-182)` (서버·pytest·합성 fixture/gold/manifest), `fix(producer): AC-SRC-5/8 PDF 생략과 빈 결과 안내 (DEV-182)` (두 화면·API 타입·stubbed Playwright).
- 11/02 Agent 시간 / Tokens: 계측 미제공(추정 미기재). 대표 프롬프트: holdout 집계 오류 유형만 바탕으로 일반 제품 규칙을 고치고 새 합성 자료로 회귀 검증. 실제 source-holdout private 접근0, live/유료 호출0, 새 의존성0. 후속: owner가 sandbox 밖 지정 전체 pytest와 Playwright 실행, 개발 live 명령 실행; owner/디자인 담당자가 Figma v6 안내 문구 동기화. 해당 확인 전 완료 체크를 하지 않는다.

- 11/02 사용자 리뷰 반영: EXTRACT PARTIAL/CANDIDATES_REJECTED와 기존 Run 상태 계산을 복원했다. refine enqueue에서만 acceptedCount/rejectedCount>0인 부분 거절을 허용한다. 두 main recovery 회귀는 원본 assertion 그대로다. 새 DB 회귀에서 PARTIAL→refine, 명시적 retry 후 동일 후보 집합 성공 정리 재사용/달라진 후보 집합의 기존 정리 outdated 및 새 REFINE 큐를 확인했다. 실패/불확실 요청 자동 재생 금지는 유지한다.
- 11/02 리뷰 a/b: run_view가 파일별 모든 EXTRACT 성공·빈 후보일 때만 사유를 한 번 공개한다. 일부 빈 chunk에는 emptyReason을 공개하지 않고 내부 진단은 유지한다. UI의 NO_CANDIDATES 명시 매핑·error와 빈 안내 중복 제거·PARTIAL 거절 개수 안내를 두 화면 stubbed Playwright에 추가했다. 중간 chunk에 실제로 사실이 없는 긴 합성 text 및 전체 빈 경우를 DB API로 검증했다.
- 11/02 리뷰 c/d/e: scorer 범위→끝점 확장을 제거해 3-5kg 원문의5kg 출력은 미지원이고, 실제 범위의 표기 차이는 정규화한다. 양방향 단일 끝점 거절·score/precision 회귀를 추가했다. 첫 후보부터 입력 상한에 걸리면 REFINE_INPUT_LIMIT로 worker/runner/API/UI에 기록한다. text_chunks top-level import·필수 chunk["pages"] 접근을 반영했다. 입력 정의 해시 설명은 제품 spec 한 곳만 유지하고 다른 문서는 링크한다.
- 11/02 최신 지정 명령: `cd server && uv run ruff check . && uv run pytest tests/test_source_recovery.py tests/test_final_eval.py tests/test_final_score.py tests/test_source_refine.py tests/test_source_analysis.py tests/test_source_integration.py --tb=short` (로컬 dev182 DATABASE_URL, SOURCE_ANALYSIS_PROVIDER=mock, 기존 UV_CACHE_DIR) → **Ruff 통과; 627 passed / 17 failed (97.78s)**, 로그 `/private/tmp/dev182-review-pytest-final.log`. source_recovery3(원래 두 PARTIAL 회귀 포함)/source_analysis6/source_integration8은 PREPARE가 실패해 EXTRACT에 도달하지 못했다. 독립 합성 prepare 호출도 `PermissionError [Errno 1] Operation not permitted (originated from sysctl() malloc 1/3)`로 실패했다. sandbox 밖 실행은 현재 도구 권한상 불가하며 사람이 원래 명령을 재실행해야 한다. 기존 테스트·parser 제한을 완화하지 않았다.
- 11/02 긴 text fixture를 실제 무사실 중간 chunk로 강화한 뒤 `cd server && uv run ruff check . && uv run pytest tests/test_source_refine.py::test_AC_SRC_5_8_long_text_empty_chunks_notice_is_per_file --tb=short` → **Ruff 통과; 2 passed / 0 failed (1.66s)**, 로그 `/private/tmp/dev182-review-empty-chunks.log`.
- 11/02 `npm run typecheck && npm run test:mock` → **5 workspace typecheck 통과; 47 passed / 0 failed / 0 skipped (28.07s)**, 로그 `/private/tmp/dev182-review-mock.log`. `node_modules/.bin/tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --esModuleInterop --skipLibCheck --types node scripts/e2e/source-review-regressions.spec.ts` → 종료0. `npm run test:e2e -- scripts/e2e/source-review-regressions.spec.ts --grep DEV-182 --max-failures=1` → **0 passed / 1 failed / 5 did not run**, Chromium MachPort 권한1100으로 launch 실패(화면 assertion 미실행), 로그 `/private/tmp/dev182-review-playwright.log`.
- 11/02 scan-before-commit 재점검: 미커밋24경로·새 파일0, 허용 범위 이탈0, git diff --check 통과. 현재 HEAD=origin/main이며 `git diff main...HEAD`의680경로는 오래된 local main 대비 기존 이력이다. 이번 작업은 git diff HEAD와 대조했다. 레거시 호환 점검: 후보2건 — 지적0건 / 커밋된 구조2건 (SourceRun의 새 카운트 미제공 응답:34d7719, 기존 manifest safeInputSha256:99c9707). 추가 코드 지적 없음; 환경 차단으로 전체 검증 미완료다.
- 11/02 갱신한 의도 커밋(실제 커밋·push·PR 없음): `fix(source): AC-SRC-2/3/5/8 PARTIAL 재시도와 긴 입력 처리 보존 (DEV-182)` (worker/refinement/runner/전처리·합성/pytest), `fix(eval): AC-SRC-3 범위와 단일 끝점의 근거 구분 (DEV-182)` (final_score·scorer 회귀), `fix(producer): AC-SRC-5/8 파일별 빈 결과와 입력 한도 안내 (DEV-182)` (run API·두 화면·TS API·stubbed Playwright), `docs(source): AC-SRC-2/3/5/8 리뷰 계약과 검증 기록 갱신 (DEV-182)` (제품 spec/wiki·구현 spec/tasks·eval 기록·개발 gold/manifest). 기존 미커밋 변경을 보존했고 이번 세션도 holdout 접근·live 호출0이다. owner의 sandbox 밖 pytest/Playwright 및 owner·디자인 담당자의 Figma 문구 동기화 전에는 완료 체크를 하지 않는다.

- 11/02 후속 리뷰 시작 기준: 기존 변경은 844a1bc·5e5aaf6·4356138에 커밋되어 있으며 사용자 제공 sandbox 밖 전체 pytest **1124 passed**, source-review-regressions **14/14 passed**는 이 기존 커밋의 결과다. 이번 후속 변경의 검증과 구분한다.
- 11/02 후속 구현: 에서/부터의 동일 단위+범위 종결 검사, 기호 범위 유지, unsupported_tokens 설명 수정. 후보 없는 REFINE은 사유 없이 성공하고 파일 EXTRACT 안내만 남긴다. NO_SAFE_TEXT/NO_CANDIDATES와 실제 REFINE을 함께 포함한 run API·두 화면 fixture 회귀를 추가했다. 두 생산자 화면의 거절 caption은 개수·원문 확인 한 줄로 합치고 UI ALL_CANDIDATES_REJECTED 매핑만 제거했다(서버 유지). 평가 추정은 디코딩 문자 수를 사용하고 source 전체 빈 진단은 stage2와 분리해 보존한다.
- 11/02 검증 중 로컬 DB가 꺼져 첫 pytest는 **580 setup errors**(Connection refused)였다. `make db`로 로컬 PostgreSQL을 시작했다. 첫 DB 실행은 **578 passed / 2 failed (67.60s)**: 새 NO_SAFE_TEXT fixture가 빈 span을 참조했고, 평가 source 전체 NO_CANDIDATES 진단이 stage2와 함께 사라졌다. 빈 응답 fixture와 source 진단 보존을 수정했으며 기존 assertion은 유지·강화했다. 중간 Ruff E501 1건도 줄바꿈으로 수정했다.
- 11/02 최종 `cd server && uv run ruff check . && uv run pytest tests/test_final_score.py tests/test_source_refine.py tests/test_final_eval.py --tb=short` → **Ruff 통과; 580 passed / 0 failed (66.89s)**. 환경: 로컬 farmclub_dev182 DB(테스트는 _test), SOURCE_ANALYSIS_PROVIDER=mock, UV_CACHE_DIR=/private/tmp/farmclub-dev182-uv-cache. 로그 `/private/tmp/dev182-followup-pytest-final.log`.
- 11/02 `npm run typecheck && npm run test:mock` → **5 workspace typecheck 통과; 47 passed / 0 failed / 0 skipped (26.53s)**, 로그 `/private/tmp/dev182-followup-mock.log`. `node_modules/.bin/tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --esModuleInterop --skipLibCheck --types node scripts/e2e/source-review-regressions.spec.ts` → 종료0.
- 11/02 `npm run test:e2e -- scripts/e2e/source-review-regressions.spec.ts --grep DEV-182 --max-failures=1` → **0 passed / 1 failed / 5 did not run**. Chromium MachPort 권한 오류1100으로 launch 실패하여 화면 assertion은 실행되지 않았다. 로그 `/private/tmp/dev182-followup-playwright.log`. 이번 후속 브라우저 검증과 Figma 문구 동기화는 owner/디자인 담당자 후속이며 완료 체크는 하지 않는다.
- 11/02 최종 diff 점검: HEAD 대비13경로·신규 파일0, 기존 허용 범위 이탈0, git diff --check 통과. origin/main...HEAD의 기존24경로도 이 이슈 범위와 일치한다. main...HEAD의680경로는 오래된 local main 대비 상속 이력으로 이번13경로와 구분했다. PREPROCESS_VERSION 추가 변경 없음. 커밋·push·PR·live 호출·holdout 자료 접근0.
- 11/02 의도 커밋(이번 세션 실제 커밋 없음): `fix(eval): AC-SRC-2/3/5 범위 판별과 문자 수 추정 수정 (DEV-182)`, `fix(source): AC-SRC-5/8 빈 결과 중복과 거절 안내 정리 (DEV-182)`, `docs(source): AC-SRC-2/3/5/8 후속 계약과 검증 기록 갱신 (DEV-182)`. Agent 시간 / Tokens: 계측 미제공. 대표 프롬프트: 조사와 범위를 구분하고 실제 REFINE 포함 회귀로 중복 안내를 막되 테스트·holdout 제한을 유지한다.
- 11/02 owner sandbox 밖 검증(후속 수정 포함): 전체 pytest 1140 passed / 1 failed(`test_AC_SRC_5_11_stale_refinement_restores_verbatim_fallback[delete_source]`, 단독 재실행 3/3 통과, 동시 실행 중 타이밍 문제로 판단), Playwright `source-review-regressions` 14/14 통과, typecheck 통과. 전부 거절된 FAILED 항목은 개수 없는 기존 문구를 유지하고 PARTIAL에만 개수를 보인다. 상태: 리뷰 수정과 sandbox 밖 검증 완료.

## DEV-182 단일 상품 농가 공통 후보 정리 후속 (2026-11-02)

- 기준 커밋: `73358eb`; 사용자 제공 development 관찰·owner 결정을 지시서로 사용한다.
- 기능·인수 조건: FEAT-03/04/07 · AC-SRC-1/2/3/5/8/11.
- 상태: 진행 중.

### 목표
단일 상품의 stage-1 대상 배치 변동으로 농가 이야기가 최종 문구에서 사라지는 문제를 해결한다.

### 범위 (수정 허용 경로)
- `server/app/source_analysis/{refinement,final_eval,editor,service}.py`, `server/app/ai/source_refine.py`
- `server/tests/{test_source_refine,test_final_eval}.py`
- `docs/spec/source-analysis.md`, `docs/wiki/Source-Analysis.md`, `server/app/source_analysis/{spec,tasks}.md`

### 비범위
- holdout 데이터 접근·수정·실행, live 호출, 커밋·push·PR 생성, 기존 테스트 약화, scorer/gold/manifest 변경.

### 결정 사항
- 11/02 상품 대상이 정확히 하나일 때 null 대상 후보도 정리 입력에 포함하고, 다중 상품은 기존 격리를 유지한다. null은 어떤 fieldKey도 가질 수 있으므로 공통 근거는 farmStory/historicalSales → farmStory, farmUpdates → farmUpdates만 허용한다. 품종·무게 등 상품 필드와 다른 상품의 근거를 보호한다.
- 11/02 worker·평가·진단·원문 fallback에서 대상 선택 함수를 공유한다. 전체 공통 후보도 원문순 cap·생략 unused·입력 ID/내용 해시·전후 최신성/개인정보 검사에 포함한다. 정리 prompt 버전도 갱신한다.
- 11/02 REFINED 저장 검증에도 같은 공통 근거/모듈 규칙을 적용한다. 정상 정리의 제외 후보는 fallback으로 복원하지 않으며, 실패·outdated일 때만 안전한 공통 원문 제안을 허용한다.
- 11/02 기존 `13-common-farm` 합성 사례와 고정 gold/manifest를 재사용한다. wiki는 맨 끝에 영문 문단 하나만 추가하고 이 tasks 파일도 append-only로 유지한다.

### 작업
- [ ] 제품·평가·fallback·저장 경로 및 합성 회귀 수정.
- [ ] 지정 Ruff/pytest/typecheck와 development mock 평가 실행·결과 기록.
- [ ] 제품 spec·구현 spec·wiki 갱신 및 diff 범위 확인.

### 기록
- 11/02 시작: 작업 트리 깨끗함, 현재 브랜치 `jinumeral/dev-182-i3-t23-extraction-fixes`, HEAD `73358eb` 확인. 외부 이슈 조회·통지 없이 사용자 지시를 적용한다.
- 11/02 범위 추가: `server/app/ai/source_analysis.py`의 mock 전용 allowlist에 기존 `13-common-farm` 텍스트 SHA/고정 출력을 추가한다. 기존 mock은 해당 사례를 EMPTY로 처리하므로 실제 mock 평가를 위해 필요하다. stage-1 prompt와 gold/manifest는 변경하지 않는다.
- 11/02 구현: 단일 상품의 전체 null 후보를 입력에 포함하고 공통 인용은 농가 모듈로 제한했다. product/eval/fallback/save의 선택·검증 규칙을 공유하며 원래 ID/targetId를 보존한다. 전체 입력 payload 해시로 같은 ID의 내용 수정 및 cap 생략 공통 후보의 수정도 outdated로 처리한다. stage-1 prompt는 유지, stage-2는 v7-farm-common으로 갱신했다.
- 11/02 1차 지정 실행: `cd server && uv run ruff check . && uv run pytest tests/test_source_refine.py tests/test_final_eval.py tests/test_final_score.py` → Ruff 통과, **601 passed / 1 failed (66.90s)**. 실패는 단일 상품에서도 공통 후보를 입력에서 제외하던 이전 계약의 테스트였다. 이를 새 계약의 전체 원문순 입력3건 + 공통 상품명 최종 제외 + 실제 인용 ID 검증으로 강화했다. 수정 후 두 focused 평가 회귀는 **2 passed / 0 failed (1.06s)**였다.
- 11/02 `npm run typecheck` → **5 workspace 통과 / 종료0**. TS 코드는 변경하지 않았다.
- 11/02 별도 development mock 평가: `cd server && uv run python - <<'PY' ... PY`로 기존 `13-common-farm`을 dataset/load_gold → evaluate_source(mock) → final_score.score 경로에서 실행했다. 전체 합성 gold 파일 SHA와 해당 source canonical SHA를 기존 manifest와 검증했다. **EVALUATED, null farmStory 포함, 2 mock calls, $0, emptyReason=null, factRecall=1/1, 금지0, unsupported0**. 산출물: `/private/tmp/dev182-common-farm-mock-69nxek_a`. gold를 모델 입력에 쓰지 않았고 fixture/gold/manifest/scorer 수정0이다.
- 11/02 범위/문서 감사: 미커밋12경로 모두 위 허용 범위 안이다. tasks는 73358eb의 전체 바이트를 prefix로 보존했고 wiki는 기존 전체를 유지하며 영문 문단 하나만 덧붙였다. `git diff main...HEAD`680경로와 `origin/main...HEAD`24경로는 상속된 이력이며 이번 변경은 `git diff HEAD`12경로로 대조했다.
- 11/02 최종 지정 실행: `cd server && uv run ruff check . && uv run pytest tests/test_source_refine.py tests/test_final_eval.py tests/test_final_score.py` → **Ruff 통과; 602 passed / 0 failed (64.38s)**. 환경은 로컬 `farmclub_dev182`(pytest `_test`), `SOURCE_ANALYSIS_PROVIDER=mock`, `UV_CACHE_DIR=/private/tmp/farmclub-dev182-uv-cache`다. 기존580건과 새 AC ID 회귀22건을 포함하며 테스트를 삭제하거나 안전 assertion을 약화하지 않았다.
- [x] 이번 단일 상품 공통 후보 후속 구현·원문순 cap·내용 최신성·저장/fallback·empty_reason·mock 평가·문서4개·지정 Ruff/pytest/typecheck 검증 완료.
- 11/02 의도한 커밋(실행하지 않음): `fix(source): AC-SRC-1/2/3/5 단일 상품 농가 공통 후보 정리 반영 (DEV-182)`, `docs(source): AC-SRC-1/2/3/5/8 공통 후보 결정과 검증 기록 (DEV-182)`.
- 11/02 Agent 시간 / Tokens: 계측 미제공(추정 미기재). 대표 프롬프트: development에서 발견한 단일 상품 null 농가 이야기 누락을 공통 제품 함수로 고치고 상품 전용 필드·기존 테스트를 보호한다. HEAD=73358eb 유지, 커밋·push·PR·live 호출·holdout 데이터 접근0. 이번 후속 변경은 미커밋으로 보존한다.
- 11/02 합성 gold 정합: DEV-182에서 추가한 21–23의 `mustContain`이 문장 전체(예: "감귤 7kg입니다")여서, 기존 20건의 핵심 토큰 규칙(예: ["감귤","5kg"])과 달랐다. 어미가 빠진 같은 사실 "감귤 7kg"을 놓침으로 셌다. 기존 규칙에 맞춰 ["감귤","7kg"], ["서늘한 곳"], ["바람을 막는 울타리"]로 고치고 manifest 해시를 갱신했다. 측정 기준 정합이며 모델·프롬프트 변경은 아니다. 저장한 T23 개발 실측 2회를 호출 없이 재채점(--rescore)했다.
- 11/02 owner 개발셋 실측(openrouter gemini-3-flash-preview, 35건): T23a(v6 정리) 사실 73/93·중요 37/45·오배치 9/93·$0.185, T23b(v7 농가 공통) 사실 80/93·중요 36/45·오배치 4/93. 두 회 모두 금지·unsupported 0. 기존 32건 기준 R4 72/87·35/42 → T23b 74/87·33/42. T23b의 03-expected-brix는 2단계 호출 REQUEST_UNCERTAIN(일시 실패, 자동 재시도 없음)으로 0/2이다. farm-orafield는 v7에서 3/3으로 회복했다. 실행마다 1회씩만 측정했으므로 회차 간 차이 일부는 모델 변동일 수 있다.

## DEV-182 T23 재실행 집계와 holdout v1.1 개발 편입 (2026-11-02)

- 이슈: [DEV-182](https://linear.app/sswp6/issue/DEV-182)
- 브랜치: `jinumeral/dev-182-i3-t23-extraction-fixes`, 시작 HEAD `87f5357`
- 기능·인수 조건: FEAT-03/04/07 · AC-SRC-2/3/5/6
- 상태: 진행 중. 사용자 제공 owner 승인 계획을 이번 작업 지시서로 적용한다.

### 목표
owner가 완료한 T23 부분 오염 재실행을 집계만 보고하고, 소진된 holdout v1.1의12건을 개발용으로 보존·편입한다. 최초 결과와 FAIL 판정을 유지한다.

### 범위 (수정 허용 경로)
- `server/app/source_analysis/{final_eval,final_score}.py`, `server/tests/{test_final_eval,test_final_score}.py`
- `server/app/source_analysis/{spec,tasks}.md`, `docs/spec/source-analysis.md`, `docs/wiki/Source-Analysis.md`
- `docs/spec/validation/source-final-{eval-i3-2026-11-01.md,eval-i3-2026-11-01.json,dev-manifest.json,gold-format.md}`
- 저장소 밖 `../source-dev-i3-private/safe/`, 신규 `../source-dev-i3-private/final-gold-dev-public-v2.json`, 신규 mock 출력 폴더.

### 비범위
- 커밋·push·PR·외부 통지·live/유료 호출, 기존 private gold/holdout 파일 삭제·변경, 테스트 약화, private 본문·gold 저장소 반입.

### 결정 사항
- 11/02 최초 holdout 측정만 비오염 기준으로 보존한다(기존 간접 오염 주의도 유지). 재실행은 “T23 holdout rerun — partially contaminated; does not replace the first run”으로 별도 기록하며 판정 FAIL이다.
- 11/02 owner 승인으로 holdout v1.1은 오늘 개발용으로 폐기되어 private 폴더를 읽을 수 있다. safe 입력은 원래 ID/확장자로 복사하고 원본을 보존한다. 개발 gold v2는 기존 private top-level source-list 규약을 유지하며 format 주입 후 split=development의 final_score.Gold로 검증한다. ID 충돌은 거절한다.
- 11/02 manifest의 모든 LOCAL_PRIVATE goldSha256과 scorer 개발 고정 SHA를 병합 v2 파일 바이트 해시로 맞춘다. 공개개발24+합성23=47건이다(기존32→44에 DEV-182 합성3 추가). 역사 holdout lock은 guard의 정확한 스키마/정책 고정을 보존하므로 변경하지 않는다.
- 11/02 guard는 새 manifest에 한해 잠긴12개 ID/format과 metadata 필드만 허용하며 나머지 JSON의 holdout payload 차단을 유지한다. 향후 독립 측정은 튜닝하지 않는 사람들이 동일3인 검토 절차로 만든 holdout v2가 필요하다.
- 11/02 gold-format 문서의 현재 개발 gold 경로도 v2로 맞춘다. wiki/tasks는 기존 바이트를 유지하고 끝에만 추가한다. 검증은 지정 Ruff/pytest·diff 및 development public estimate/full mock만 수행한다.

### 작업
- [ ] 재실행·두 개발 실측/합성 gold 정합 집계 보고서 추가.
- [ ] private 입력12건 복사·gold 병합/검증·manifest/runner/guard 정합.
- [ ] mock estimate24건·신규 출력 폴더 full run 로딩/채점 확인.
- [ ] 지정 Ruff/pytest·diff 검사 및 결과 기록.

### 기록
- 11/02 시작: 작업 트리 깨끗함. metadata에서 stage1 `source-v8-exact-numbers`, stage2 `source-refine-v7-farm-common`, 시도2와 owner 재실행 사유 확인. private score/metadata에서 집계만 추출한다. 신규 실모델 호출은 하지 않는다.
- 11/02 해시 인코딩 확인: 기존12건 safeInputSha256은 corpus의 canonical-json-utf8 구조화 입력 해시이며 현재 safe 파일 바이트 SHA가 아니다. 기존 값은 보존한다. 새로 편입한12건은 복사한 safe 파일 바이트 SHA로 검증하므로 `safeInputEncoding=file-bytes`를 명시하여 두 해시 계약을 혼동하지 않게 한다. 이는 입력 변경이 아니며 guard의 신규 metadata 키도 정확히 고정한다.
- 11/02 구현 결과: safe 입력12건을 동일 ID/확장자로 개발 private 폴더에 복사했고 원본은 보존했다. 기존 개발12+폐기12의 ID 충돌0, 병합 gold24건은 development Gold 검증을 통과했다. v2 파일 SHA는 `16c239045030411306cf07e8b04e9bf35c98d74acda0f861ccc69e48f1b27fb5`이며 runner·scorer 고정 SHA·LOCAL_PRIVATE24건 goldSha256이 일치한다. 합성23건은 변경하지 않았다.
- 11/02 보고 결과: private score/metadata에서 형식별/전체 facts·critical·misplacement·금지 종류·unsupported·proxy·상태·오류·정산·호출 집계만 추출했다. 재실행74/261·32/109·오배치26/261·금지2·unsupported0·proxy82/91·93호출·$0.190412, 최초59/261과 분리해 보존했다. 개발 T23a73/93·T23b80/93와 합성21–23 gold 정합 기록을 요약했다. FAIL과 최초 측정의 기존 간접 오염 주의를 유지한다.
- 11/02 지정 최종 검증: `cd server && uv run ruff check . && uv run pytest tests/test_final_eval.py tests/test_final_score.py` → **Ruff 통과; 327 passed / 0 failed (30.05s)**. 환경: `UV_CACHE_DIR=/private/tmp/farmclub-dev182-uv-cache`, `APP_ENV=local`, `SOURCE_STORAGE=local`, `SOURCE_ANALYSIS_PROVIDER=mock`, 로컬 `farmclub_dev182`(pytest `_test`). 앞선 동일 묶음도327 passed / 0 failed(36.17s)였다. 신규3개 회귀는 public/all v2 로딩·변조 거절2개와 집계/최초 결과 보존1개다. 기존 guard의 문자열 payload 차단·역사 lock 고정 assertion을 유지했다.
- 11/02 mock estimate: `cd server && uv run python -m app.source_analysis.final_eval --split development --subset public --provider mock --estimate-only --out ../../source-dev-i3-private/dev182-retired-public-estimate` → **sources24 / estimatedExtractionCalls63 / estimatedRefinementCalls24 / estimatedOcrCalls236**, 종료0. OCR 호출 추정치는 계획용이며 실제 mock은 로컬 OCR만 사용한다.
- 11/02 mock full: 같은 명령에서 `--estimate-only`를 빼고 `--out ../../source-dev-i3-private/dev182-retired-public-mock-20261102`를 사용했다. 최초 사전 검사는 이 worktree의 OCR_NOT_CONFIGURED로 종료2(출력 폴더 생성 전)였다. 기존 sibling worktree의 오프라인 RapidOCR 모델3개 파일 해시를 검증하고 환경 변수 SOURCE_OCR_MODEL_DIR·SOURCE_OCR_MODEL_SHA256만 연결해 실행했다(설치/다운로드 없음). **종료0; loaded24 / scored24 / EMPTY24 / FAILED0 / mock calls87 / 정산$0 / score facts0/324**. 새 private 폴더에 inputs/runs/metadata/score/report를 생성해 실제 로딩·채점 경로를 확인했다. mock은 품질 측정이 아니다.
- 11/02 보존/정보 감사: 기존 JSON 최상위19필드 값 동일, report MD·wiki·tasks 기존 바이트 prefix 보존, 합성23건 값 동일, 기존 개발12건 canonical 해시 보존, 신규12건 복사 바이트/해시 일치, 역사 holdout lock 바이트 동일, 기존 private gold2개 SHA 동일, 병합 gold는 원래 두 source 리스트의 순서 유지 연결임을 확인했다. 신규 추가 라인에서 길이20자 이상 private gold 문장/statement 일치0건이다. 저장소 신규 파일0·수정12경로 모두 이번 범위 안이다.
- 11/02 diff 범위: `git diff main...HEAD`680경로와 `origin/main...HEAD`26경로는 상속된 이력이다. 이번 변경은 `git diff HEAD`12경로로 tasks와 대조했다. `git diff --check` 통과. HEAD=87f5357 유지, 커밋·push·PR·live 호출0이다.
- [x] 이번 재실행 보고·개발 편입·문서·mock 로딩/채점·지정 테스트 검증 완료. 모델 품질 FAIL과 미래 독립 holdout v2 필요성은 그대로다.
- 11/02 의도한 커밋(실행하지 않음): `docs(source): AC-SRC-2/3/6 T23 부분 오염 재실행과 폐기 기록 (DEV-182)`, `chore(eval): AC-SRC-2/6 폐기 holdout 개발 편입과 v2 gold 연결 (DEV-182)`.
- 11/02 Agent 시간 / Tokens: 계측 미제공(추정 미기재). 대표 프롬프트: owner 승인된 재실행 집계만 공개하고 폐기 holdout을 원본 보존·private v2 gold·mock 검증으로 개발 편입한다.
- 11/02 재현성 주의: 개발 public gold가 v2(`16c23904…`)로 바뀌어 `final_score`는 v2 SHA와 24건 ID 집합만 받는다. v1(`3ed46597…`)을 가리키는 과거 개발 run(R1–R4, T23a/T23b)은 `--rescore`로 다시 채점할 수 없으며, 기록 수치는 당시 저장된 score.json 기준이다. 보고서 비교 절에 재실행의 형식별 하락(image·long_image facts/critical, 오배치10→26)을 명시했다.
## DEV-189 OCR 모델 GitHub Release 미러

### 왜
- 11/02 #347 머지 후 Railway source worker 빌드가 2회 실패했다. `provision_ocr`가 ModelScope의 모델 3개를 받는데 세 URL 모두 HTTP 500이었다. 운영 worker는 이전 이미지로 계속 동작했다.

### 범위
- `server/app/source_analysis/provision_ocr.py`, `server/tests/test_provision_ocr.py`, `server/README.md`, 이 폴더의 `spec.md`·`tasks.md`.

### 결정 사항
- 해시가 같은 원본 3개를 공개 GitHub Release `ocr-models-v3.10.0`에 올렸다. LICENSE(Apache-2.0)와 출처를 적은 NOTICE를 함께 올렸다. Hugging Face에는 해시가 같은 사본이 없었다.
- `ocr-manifest.json`은 바꾸지 않는다. worker 시작 검사가 manifest 해시(`SOURCE_OCR_MODEL_SHA256`)를 운영 변수와 대조하므로, 미러 주소는 설치 코드에만 둔다.
- 설치 순서는 미러 → manifest의 ModelScope URL이다. 받은 파일은 sha256이 manifest와 같아야 하며, 모든 주소가 실패하면 빌드가 실패한다. manifest URL의 ModelScope 접두사 허용 검사는 유지한다.

### 기록
- 11/02 ModelScope가 500인 상태에서 실제 설치: 미러에서 3개를 받았고 출력 해시 `9f64ef4f…`가 README와 운영 변수 값과 같다. `tests/test_provision_ocr.py` 8 passed(미러 우선·500/읽는 중 끊김/연결 리셋/해시 불일치 시 폴백·전부 실패·비신뢰 URL·manifest 해시 고정), ruff 통과.

## DEV-190 PDF·이미지 페이지별 OCR 복구와 긴 OCR 추출 분할

- 이슈: [DEV-190](https://linear.app/sswp6/issue/DEV-190)
- 브랜치: `jinumeral/dev-190-ocr-page-resilience` (origin/main ec2bf06 기반)
- 기능·인수 조건: FEAT-03/04/07 · AC-SRC-2/3/5/6/8/10/11
- 상태: 진행 중 (Playwright·live 개발셋 검증은 사람이 수행)

### 목표
사진만 있는 빈 쪽과 개별 OCR 호출 실패가 나머지 쪽의 추출을 막지 않도록 하고, 긴 OCR 전사도 원문 span 경계의4000자 묶음으로 추출한다.

### 범위 (수정 허용 경로)
- `server/app/source_analysis/{worker,preprocess,service,refinement,final_eval}.py`
- `server/tests/{test_source_analysis,test_source_refine,test_source_recovery,test_source_gemini_ocr,test_final_eval}.py`
- `apps/producer/src/lib/{SourceWorkspace,NewProductComposer}.tsx`, `packages/api/src/sourceAnalysis.ts`
- `scripts/e2e/source-review-regressions.spec.ts`
- `docs/spec/source-analysis.md`, `docs/wiki/Source-Analysis.md`(끝에 영어 한 문단만 추가)
- `server/app/source_analysis/spec.md`, 이 `tasks.md`의 DEV-190 신규 끝 섹션만.

### 비범위
- 커밋·push·PR·외부 통지·live/유료 호출, 새 의존성, private 원문 반입, gold/채점 기준/모델 프롬프트 변경.

### 결정 사항
- 11/02 OpenRouter 이미지/PDF는 파일별 EXTRACT 항목 하나에 페이지 목록을 저장한다. 실제 OCR 요청은 한 쪽의 한 crop씩, stage-1 요청은 한 쪽의 span 묶음씩 보내므로 요청당 최대4쪽 계약을 유지한다. 전체 빈 문서 판단·PARTIAL 재시도 범위·파일당 안내를 같은 항목에서 일관되게 처리한다.
- 11/02 빈 쪽은 spans=[]·pagesEmpty 진단, 실패한 쪽은 그 쪽의 부분 전사도 버리고 pagesFailed 진단에 번호/고정 오류 코드를 기록한다. 모든 쪽에 유효 전사가 없으면 기존 실패 코드(전부 빈 쪽은 OCR_UNCERTAIN)로 실패한다. auth/예산/취소/lease/자료·가림 변경은 전파한다.
- 11/02 OCR 실패가 있어도 나머지 쪽을 추출한다. accepted 후보가 있는 PARTIAL은 REFINE 가능하며, 재시도는 새 Run에서 파일 전체를 다시 읽는다. 불확실 OCR도 retry acknowledgment가 필요하고 자동 재호출하지 않는다. 예약/정산 래퍼는 그대로 쓴다.
- 11/02 제품·평가 runner가 페이지별 text_chunks 그룹 함수를 공유한다. span ID/쪽 번호를 유지하고 각 그룹에 대해 검증한 후보를 병합·중복 제거한다. 평가 metadata는 빈/실패 쪽의 개수만 공개한다.
- 11/02 UI는 pagesFailed>0인 파일에 안내 한 줄을 표시하며 해당 OCR 오류와 빈 결과 안내를 중복 표시하지 않는다. 빈 쪽 건너뜀은 별도 경고하지 않는다. Figma 변경은 이 세션에서 하지 않으며 후속 담당자 확인이 필요하다.

- 11/02 초기 합성 회귀에서 동일 항목의 여러 stage-1 요청이 같은 Spend 키(`item:attempt:extract`)를 사용함을 확인했다. 코드보다 먼저 결정 추가: 요청별 stage 이름을 `extract-쪽번호-묶음순번`으로 유일하게 하여 기존 reserve/settle 원장 계약으로 모든 분할 호출을 기록한다.
- 11/02 검증 경계 결정: 페이지 오류와 별개로 다른 쪽에서 나온 후보까지 전부 근거 검증에 거절되면 기존 CANDIDATES_REJECTED/FAILED 규칙을 유지한다. hard failure에서도 이미 센 빈/실패 쪽 진단은 유지하며, 아직 읽지 않은 쪽은 로컬 span을 OCR 근거로 남기지 않는다.
- 11/02 평가 정합 결정: stage-1 한 묶음의 후보가 모두 거절되어도 다른 묶음의 유효 후보는 제품과 동일하게 보존한다. 모든 묶음 처리 후 accepted가 하나도 없고 거절만 있으면 CANDIDATES_REJECTED로 실패한다.

### 작업 / 완료 조건
- [ ] 빈 쪽/실패 쪽 격리, hard failure 전파, 비용/명시적 retry/REFINE 검증.
- [ ] 제품·평가 OCR4000자 분할과 쪽 근거·중복 제거 회귀.
- [ ] 두 생산자 화면 파일별 안내와 stubbed Playwright 추가 (실행: 사람).
- [ ] 제품 spec·구현 spec·wiki 영어 한 문단 갱신.
- [ ] 지정 Ruff/pytest/typecheck/mock 실행 결과와 PREPARE sandbox 실패 별도 기록.
- [ ] 사람이 Playwright 및 live 개발셋을 실행하여 결과 확인 (이 세션에서는 실행 금지).

### 기록
- 11/02 시작: 작업 트리 깨끗함, 브랜치 확인. AGENTS.md·spec 스킬·제품/폴더 스펙·Linear DEV-190 읽음. 사용자 지시에 따라 커밋·push·PR·live 호출 없이 진행한다.
- 11/02 구현: 파일 단위 OCR 항목·빈/실패 쪽 진단·4000자 그룹·요청별 Spend stage·그룹별 근거 검증/병합·accepted PARTIAL refine을 연결했다. service.retry의 새 Run/전체 pages 재시도와 REQUEST_UNCERTAIN 비용 확인은 기존 함수를 유지하고 합성 DB 회귀로 확인했다. 공개 API/평가 metadata는 쪽 개수만 추가했다. UI 두 화면은 같은 sourceNotices를 사용하며 중복 오류를 숨긴다.
- 11/02 최종 서버 명령: `DATABASE_URL=postgresql+psycopg://farmclub:farmclub@127.0.0.1:55484/farmclub_dev190 UV_CACHE_DIR=/private/tmp/farmclub-dev190-uv-cache uv run --directory server ruff check .` → **통과**. 같은 환경의 `uv run --directory server pytest tests/test_source_analysis.py tests/test_source_refine.py tests/test_source_recovery.py tests/test_source_gemini_ocr.py tests/test_final_eval.py` → **440 passed / 16 failed (74.91s)**. 첫 실행은 436 passed / 16 failed (80.59s), 이후 새 경계 회귀4건을 추가했다. pytest는 `farmclub_dev190_test`만 사용한다.
- 11/02 PREPARE 환경 실패(별도): 기존 source_analysis6건·source_recovery3건·source_gemini_ocr7건이 PREPARE 실패/누락 Page 이후 assertion에서 실패했다. 별도 합성 텍스트의 `preprocess.prepare(...)` 실행으로 psutil의 `Process.children(recursive=True)` → `sysctl()` PermissionError(`[Errno 1] Operation not permitted (originated from sysctl() malloc 1/3)`)를 직접 재현했다. 준비/cleanup의 동일 sandbox 제한이며 제품·기존 테스트를 우회/약화하지 않았다. 제한 없는 환경의 지정 묶음 재실행 전까지 전체 테스트 완료로 표시하지 않는다.
- 11/02 프런트 명령: `npm run typecheck && npm run test:mock` → **typecheck 모든 workspace 통과; mock 47 passed / 0 failed (28.40s)**. 두 화면 stubbed Playwright를 추가했지만 사용자 지시에 따라 실행하지 않았다. Figma v6 문구 동기화도 후속 담당자 확인이 필요하다.
- 11/02 감사: `git diff --check` 통과. tasks/wiki 기존 HEAD 바이트 prefix 보존 및 wiki 신규 영어 한 문단만 추가 확인. 기존 두 테스트 파일의 모든 함수 AST 동일(삭제·assert 약화 없음). `git diff main...HEAD`681경로는 로컬 main과 상속된 차이이며 `origin/main...HEAD`0경로·HEAD=ec2bf06이다. 이번 미커밋 `git diff HEAD`14경로는 DEV-190 허용 범위 안이다. 의존성/모델 프롬프트/gold 변경0, private 입력 반입0, 커밋·push·PR·live 호출0.
- 11/02 의도한 커밋(실행하지 않음): `docs(source): AC-SRC-2/5/8 OCR 페이지 복구 규칙과 작업 기록 (DEV-190)`; `fix(source): AC-SRC-2/5/10 OCR 페이지 복구와 긴 전사 분할 (DEV-190)`; `fix(producer): AC-SRC-5/8 부분 OCR 안내와 화면 회귀 추가 (DEV-190)`.
- 11/02 Agent 시간 / Tokens: 계측 미제공(추정 미기재). 대표 프롬프트: private 원문·모델 프롬프트 변경 없이 페이지별 OCR 실패를 격리하고 긴 전사를 분할하며 합성 DB 회귀와 기존 테스트로 검증한다. 남은 검증: sandbox 밖 pytest, 사람의 두 화면 Playwright·아래 개발셋 live·Figma 동기화. 체크박스와 이슈 상태는 진행 중으로 유지한다.

사람 실행용 개발셋 명령 (이 세션에서 실행하지 않음; 기존 OpenRouter 키와 초기화된 로컬 DB 사용):

```sh
cd server
APP_ENV=local \
DATABASE_URL='postgresql+psycopg://farmclub:farmclub@127.0.0.1:55484/farmclub_dev190' \
SOURCE_OCR_MODEL_DIR='<offline-model-directory>' \
SOURCE_OCR_MODEL_SHA256='<manifest-sha256>' \
uv run python -m app.source_analysis.final_eval \
  --split development --subset all \
  --provider openrouter --model google/gemini-3-flash-preview \
  --max-usd 3 --out ../../source-dev-i3-private/dev190-live-dev --yes
```
- 11/02 신규 회귀만 별도 확인: 같은 DB/cache 환경의 `uv run --directory server pytest tests/test_source_gemini_ocr.py tests/test_final_eval.py -k 'pdf_photo_only or pdf_page_failure or partial_ocr_retry or long_ocr_chunks or eval_shares or failed_page_discards' -q` → **17 passed / 0 failed / 107 deselected (5.17s)**. 최종 Ruff 재실행과 diff whitespace 검사도 통과했다. 이 결과는 전체 묶음의 PREPARE 환경 실패16건이나 미실행 Playwright를 대체하지 않는다.

### 11/02 후속 리뷰 결정·범위 (append-only)
- 사용자 검증 보고: sandbox 밖 full pytest 1191 passed, stubbed text source를 보존한 fixture 수정 뒤 Playwright source-review-regressions 16/16. 이번 후속 변경의 검증 결과와 구분한다.
- 범위는 기존 DEV-190 허용 경로 안의 worker/final_eval, 기존 테스트 파일, 제품/구현 spec, wiki 영문 문단과 이 파일 끝 추가로 한정한다. 커밋·push·PR·live 호출은 금지한다.
- stage-1 비-hard 청크 오류는 chunksFailed(청크 순번·쪽·고정 코드)와 pagesFailed(쪽별 중복 제거)에 기록하고 나머지 청크를 계속한다. 성공 청크의 후보를 보존해 PARTIAL로 처리하며, 전 청크 호출 실패 또는 hard 오류는 원래 예외로 FAILED다. 유효 후보 없이 거절 후보만 남으면 CANDIDATES_REJECTED/FAILED이며, 단순 빈 성공 응답은 기존 빈 결과다. 자동 재생 없이 호출별 예약·정산을 유지한다.
- worker와 final_eval의 vision stage-1 orchestration을 공유한다. 일반 텍스트/mock/로컬 OCR은 빈 쪽에도 제품 text_chunks와 같은 호출을 하고, 청크 전부 거절 시 해당 per-chunk 항목이 실패하는 기존 계약을 유지한다. 파일 단위 vision의 CANDIDATES_REJECTED는 모든 청크 처리 뒤 유효 후보 0개·거절 있음일 때 판정한다.
- vision 병합은 (targetId, fieldKey, value, historical, evidence)로 중복 제거한 원문 청크 순서 prefix 100개를 보존하고 candidatesSkipped 진단을 남긴다. photo_requests도 결정적 중복 제거/prefix30으로 schema 상한을 지킨다. acceptedCount는 저장 대상 고유 후보 수다.
- 같은 source/revision/sanitization/targets의 새 scope는 부분집합인 기존 페이지/span scope를 대체한다. 기존 확정 편집/동일 후보 ID 보존 규칙을 유지하며, 재사용은 SUCCEEDED 부분 scope들의 합집합이 새 scope 전체를 덮을 때만 허용한다(실패/누락 쪽이 있으면 파일 재분석).
- 예외 중 진단 저장에서 lock/privacy context를 잃어도 원래 코드·usage·provider_request_id를 보존한다. CANCELLED/LEASE_LOST 가상 hard 코드는 제거하고 실제 SOURCE_CHANGED fencing을 설명한다. 비-vision 후보 검증은 비용 정산 뒤로 복원한다.

### 11/02 후속 리뷰 구현·검증 기록
- stage-1은 공용 `extract_vision_chunks`에서 실패 청크를 격리하며 성공 후보·OCR spans를 보존한다. REQUEST_UNCERTAIN 중간 실패→PARTIAL/양옆 후보 저장·REFINE 생성, 전 청크 실패→FAILED, PROVIDER_AUTH→즉시 FAILED를 제품/평가 회귀로 확인했다. 모든 호출의 Spend 수·정산액 및 retry_after가 있어도 자동 재생되지 않음을 검사한다. hard 오류도 실패 청크 진단에 기록한 뒤 전파한다.
- page_scope 부분집합 교체로 기존 페이지별 자동 후보를 outdated 처리하고 review의 활성 후보 중복·충돌이 없음을 확인했다. 재사용은 SUCCEEDED scope 합집합이 전체 요청을 덮을 때만 허용하며 실패/누락 span/다른 revision/다른 targets가 있으면 새 파일 항목을 만든다. `git show origin/main:server/app/source_analysis/worker.py`에서도 기존 페이지별 OpenRouter 항목 생성 이력을 확인했다.
- INFO a–f: CANCELLED/LEASE_LOST 가상 hard 코드를 제거하고 SOURCE_CHANGED fencing 주석으로 수정; OCR/stage-1 원래 예외·usage·요청 ID 보존; 고유 후보 prefix100/candidatesSkipped·사진 요청 prefix30 적용; 비-vision 빈 페이지 호출/청크별 거절 경계 복원; 비-vision validate_candidates를 settle 뒤로 이동; 파일 소유와 요청 분할을 구분한 주석으로 수정했다. 제품/구현 spec과 wiki 끝 영문 한 문단을 추가했다.
- 최초 신규 회귀 실행: `DATABASE_URL=postgresql+psycopg://farmclub:farmclub@127.0.0.1:55484/farmclub_dev190 UV_CACHE_DIR=/private/tmp/farmclub-dev190-uv-cache uv run --directory server pytest tests/test_source_gemini_ocr.py tests/test_final_eval.py -k 'stage1_chunk_failures or diagnostics_fencing or legacy_page_candidates or legacy_success_reuse or vision_merge or eval_stage1_failure or nonvision_empty or text_wholly_rejected' -q` → **18 passed / 1 failed / 124 deselected (5.94s)**. 인증 오류가 failed chunk count에서 빠진 구현을 수정했고, OCR/stage-1 각각의 예외 보존 회귀3건을 추가했다. 기존 assertion을 약화하지 않았다.
- 최종 Ruff: 같은 DB/cache 환경의 `uv run --directory server ruff check .` → **All checks passed / 종료0**.
- 최종 지정 pytest: 같은 환경의 `uv run --directory server pytest tests/test_source_gemini_ocr.py tests/test_final_eval.py tests/test_source_refine.py tests/test_source_recovery.py tests/test_source_analysis.py` → **462 passed / 16 failed (88.49s)**. 신규 회귀22건은 모두 통과했다. 로그 `/private/tmp/dev190-followup-pytest.log`.
- PREPARE sandbox 실패(별도): source_gemini_ocr7건(Page 없음), source_recovery3건, source_analysis6건으로 기존 실패 목록과 동일하다. `UV_CACHE_DIR=/private/tmp/farmclub-dev190-uv-cache uv run --directory server python`에서 합성 텍스트 `prepare(..., 'text/plain')`를 호출해 `psutil.Process.children(recursive=True)`의 `sysctl() malloc 1/3 PermissionError`를 재현했다(prepare와 cleanup 양쪽). 환경 우회·테스트 약화 없이 보고하며 이번 후속 전체 검증은 sandbox 밖 재실행 전까지 미완료다. 사용자가 보고한 이전 full pytest1191/Playwright16 통과는 이번 미커밋 후속 변경의 결과로 주장하지 않는다.
- `npm run typecheck` → **5 workspace 통과 / 종료0**, 로그 `/private/tmp/dev190-followup-typecheck.log`. TS/UI 변경은 없다.
- 감사: 기존 test_source_gemini_ocr14개·test_final_eval48개 함수의 AST가 HEAD와 동일해 기존 테스트 삭제/약화0이다. tasks/wiki의 HEAD 전체 바이트가 prefix로 유지된다. 이번 미커밋8경로는 DEV-190 범위 안이며 `git diff --check` 통과. `git diff main...HEAD`681경로는 상속 이력, `origin/main...HEAD`14경로는 앞서 커밋된 DEV-190 변경이므로 이번 후속은 `git diff HEAD`로 따로 대조했다.
- 의도한 커밋(실행하지 않음): `fix(source): AC-SRC-2/5/10 청크 실패 격리와 검증 경계 복원 (DEV-190)`; `fix(source): AC-SRC-2/5/10 기존 페이지 범위 재사용과 후보 교체 (DEV-190)`; `docs(source): AC-SRC-2/5/8 후속 복구 규칙과 검증 기록 (DEV-190)`.
- HEAD `3d7e7c0` 유지. 커밋·push·PR·외부/live 호출0, 기존 체크박스/상태 변경0. Agent 시간 / Tokens는 계측 미제공(추정 미기재). 대표 프롬프트: stage-1 청크 실패 격리와 main에 저장된 페이지별 항목의 범위 호환을 고치고 원래 예외·비용 원장·기존 테스트를 보존한다.

### 11/02 추가 리뷰 결정·범위 (append-only)
- 사용자 검증 보고: 이전 커밋의 sandbox 밖 full pytest **1213 passed**. 이번 후속 변경 결과와 구분한다. 현재 HEAD `7e90646`; 커밋·push·PR·외부/live 호출 없이 그 위에 수정한다.
- 범위: 기존 DEV-190 허용 경로 중 `worker.py`, `service.py`, `refinement.py`, `final_eval.py`, `test_source_gemini_ocr.py`, `test_final_eval.py`, 두 생산자 컴포넌트, 공용 API 타입, 기존 Playwright 파일, 제품/구현 spec, wiki 끝 영문 문단, 이 tasks 끝 추가만 사용한다.
- 후보 교체는 새 파일 범위에서 `pagesFailed`와 `chunksFailed`의 쪽을 뺀 성공 범위의 부분집합인 기존 항목에만 적용한다. 한 쪽의 일부 청크가 실패해도 그 쪽의 기존 후보는 보존한다. 기존 Run 설정과 무관한 후보 교체는 유지하되, outdated 후보가 하나라도 있는 항목은 설정이 같아도 재사용 coverage에 포함하지 않는다(vision과 text 경로 공통). 후보 없는 정상 성공 항목은 재사용할 수 있다.
- `pagesFailed`는 OCR 단계에서 전사를 버린 쪽만 나타내며 stage-1 호출 실패는 `chunksFailed`에만 남긴다. 둘 중 하나가 있으면 PARTIAL, 불확실 호출이 있으면 기존 REQUEST_UNCERTAIN/비용 확인, 나머지는 OCR_PAGES_FAILED 또는 EXTRACT_CHUNKS_FAILED로 구분한다. accepted PARTIAL의 REFINE 허용과 평가 상태를 같은 진단에 맞춘다.
- run API는 chunksFailed도 개수만 공개한다. 두 화면은 OCR 실패 쪽이 있으면 기존 N쪽 안내, 청크만 실패했으면 “일부 내용을 읽지 못했어요. 다시 분석해 보세요.”를 파일당 한 번 표시하고 오류·빈 결과 안내를 중복하지 않는다. 기존 Playwright의 문구·개수·재시도 잠금 assertion을 유지하며 청크/혼합 실패를 추가 검증한다. Figma는 live 호출 금지로 수정하지 않으며 후속 동기화가 필요하다.
- 각 청크의 검증된 후보만 병합하며 중복된 병합 후 validate 호출은 제거한다. acceptedCount/emptyReason을 직접 계산해 검증 거절 목록·개수가 덮어써지지 않게 한다. 거절 후보가 저장되지 않는 DB 회귀를 추가한다.
- 포맷 기준을 수정 전 git HEAD/main으로 확인했다. HEAD format-clean인 worker/final_eval/test_source_gemini_ocr에만 ruff format을 실행한다. service/refinement/test_final_eval은 HEAD에서 이미 unformatted이므로 전체 재포맷하지 않는다(main에서 이미 unformatted인 파일도 재포맷하지 않는다).
- 검증: 사용자 지정 `cd server && uv run ruff check . && uv run pytest tests/test_source_gemini_ocr.py tests/test_final_eval.py tests/test_source_recovery.py`, `npm run typecheck`. 로컬 DB는 farmclub_dev190의 pytest 전용 `_test`, 기존 sandbox PREPARE 제한을 우회하거나 테스트를 약화하지 않는다. Playwright는 기존 사람 실행 조건을 유지하고 기대값만 엄격하게 갱신한다.

### 11/02 추가 리뷰 구현·검증 기록
- 성공 scope로만 후보를 교체해 p1/p2 성공·p3 실패의 legacy 집합에서 새 파일의 p2 OCR/추출 실패 시 p2 후보가 review에 남는다. p2의 두 청크 중 하나만 실패한 경우에도 성공 청크 후보와 기존 p2 후보를 함께 보존한다. 기존 p1 후보는 교체하며 새 p1/p3 후보는 저장된다.
- 재사용 previous 쿼리에 outdated 후보 NOT EXISTS를 추가했다. 기존 항목 status가 모두 SUCCEEDED여도 다른 mode/model/prompt_version/visual_pages 설정의 분석이 그 후보를 교체한 뒤 예전 설정으로 돌아오면 새 EXTRACT를 만든다. mode=mock의 text 경로도 같은 규칙을 검증한다. 기존 후보 없는 전체 성공 coverage 재사용 assertion은 유지했다.
- pagesFailed에서 stage-1 오류를 분리하고 API chunksFailed 개수·EXTRACT_CHUNKS_FAILED·accepted PARTIAL REFINE·평가 PARTIAL을 연결했다. 불확실 청크도 REQUEST_UNCERTAIN을 유지한다. UI 두 화면과 Playwright는 정확한 문구·단일 개수·오류/빈 결과 중복 부재·알려진 오류 재시도 허용/불확실 재시도 잠금을 검사하며, OCR/청크 혼합 실패에서도 한 줄을 확인하도록 강화했다.
- 병합 후 사용하지 않던 validate 결과를 제거하고 청크별 검증 통과 후보만 저장한다. acceptedCount/emptyReason을 직접 계산하고 거절 목록·개수를 보존한다. 긴 OCR fixture의 각 span에 고유 식별 숫자를 넣어 정상 후보와 거절 payload가 우연히 같지 않게 했으며, 기존 모든 호출 수/분할/쪽/span/후보 수 assertion에 거절 payload 미저장 assertion을 추가했다.
- 수정 전 포맷 기준: worker/final_eval/test_source_gemini_ocr는 HEAD·main 모두 clean. service/refinement/test_final_eval은 HEAD unformatted, main clean이었다. `UV_CACHE_DIR=/private/tmp/farmclub-dev190-uv-cache uv run ruff format app/source_analysis/worker.py app/source_analysis/final_eval.py tests/test_source_gemini_ocr.py`를 server에서 실행했으며 그 외 파일은 전체 재포맷하지 않았다. 기본 캐시의 uv 최초 시도는 ~/.cache/uv 쓰기 PermissionError로 종료2여서 허용된 tmp 캐시로 변경했다.
- 최초 관련 회귀 묶음: **19 passed / 4 failed / 133 deselected (9.31s)**. 새 legacy fixture의 불완전한 evidence와 기존 동일 문구 fixture에서 거절 payload가 다른 정상 청크와 우연히 같았던 문제였다. evidence 필수 필드를 채우고 고유 span 문구로 강화했으며 assertion을 약화하지 않았다.
- 최종 관련 회귀: `DATABASE_URL=postgresql+psycopg://farmclub:farmclub@127.0.0.1:55484/farmclub_dev190 UV_CACHE_DIR=/private/tmp/farmclub-dev190-uv-cache uv run pytest tests/test_source_gemini_ocr.py tests/test_final_eval.py -k 'partial_file_preserves or superseded_candidates_cannot or stage1_chunk_failures or long_ocr_chunks or eval_stage1_failure or legacy_success_reuse' -q` (server/) → **23 passed / 0 failed / 133 deselected (8.48s)**.
- 지정 최종 명령: `cd server && uv run ruff check . && uv run pytest tests/test_source_gemini_ocr.py tests/test_final_eval.py tests/test_source_recovery.py` (위 로컬 DATABASE_URL·tmp UV_CACHE_DIR 적용) → **Ruff All checks passed / 종료0; pytest 170 passed / 10 failed (31.46s), 종료1**. 로그 `/private/tmp/dev190-review-final-pytest.log`. 이번 추가 parameter 사례10건은 모두 통과했고 기존 final_eval 전체108건도 통과했다.
- 실패10건은 기존 source_gemini_ocr7건과 source_recovery3건의 PREPARE 환경 실패다. 별도 `UV_CACHE_DIR=/private/tmp/farmclub-dev190-uv-cache uv run python`에서 합성 텍스트 `prepare(b'Synthetic storage text', 'text/plain')`로 `psutil.Process.children(recursive=True)` → `sysctl() malloc 1/3 PermissionError`를 준비/cleanup 양쪽에서 재현했다. 환경 제한 우회·테스트 삭제/약화 없이 중단하며 이번 후속 전체 검증은 **미완료**다. 사용자 보고의 이전 full pytest1213 통과는 이 미커밋 변경의 통과로 주장하지 않는다.
- `npm run typecheck` → **5 workspace 통과 / 종료0**. Playwright는 기존 사람 실행 조건에 따라 실행하지 않았으며 DEV-190 두 화면의 기대값만 강화했다. Figma v6 문구 동기화도 후속 담당자 확인이 필요하다. 신규 의존성/프롬프트/gold 변경0이다.
- 감사: 수정14경로 모두 허용 범위. tasks/wiki의 HEAD 전체 바이트 prefix 보존, 기존 테스트 함수 삭제0, 변경된 기존 함수3개는 쪽/청크 의미의 정확한 기대값과 assertion 추가만 확인했다. `git diff --check` 통과. `git diff main...HEAD`681경로는 상속 이력, `origin/main...HEAD`14경로는 이전 DEV-190 커밋이며 이번 후속은 `git diff HEAD`14경로로 별도 대조했다.
- 의도한 커밋(실행하지 않음): `fix(source): AC-SRC-2/5/10 성공 페이지 후보 교체와 재사용 범위 수정 (DEV-190)`; `fix(producer): AC-SRC-5/8 OCR 쪽 실패와 추출 청크 실패 안내 구분 (DEV-190)`; `docs(source): AC-SRC-2/5/8 추가 리뷰 규칙과 검증 결과 기록 (DEV-190)`.
- HEAD `7e90646` 유지. 커밋·push·PR·외부/live 호출0, 기존 체크박스/상태 변경0. Agent 시간 / Tokens는 계측 미제공(추정 미기재). 남은 검증: sandbox 밖 지정 pytest 재실행, 사람의 갱신된 Playwright 두 화면 및 Figma 문구 동기화.
- 11/02 owner sandbox 밖 검증: 전체 pytest 1223 passed, Playwright `source-review-regressions` 16/16, typecheck 통과.
- 11/02 알려진 한계(후속): 교체는 항목 단위다. 다른 설정으로 만든 기존 파일 단위 항목 F1(p1–p3) 뒤에 새 파일 항목 F2가 p2만 실패해 PARTIAL이 되면, F1 범위가 F2의 성공 범위(p1, p3)에 포함되지 않아 F1 후보가 그대로 남는다. 값이 다르면 review에 conflict로 보이며 조용히 사라지지는 않는다. 후보 근거 쪽 단위 교체는 후속 이슈로 남긴다.


## DEV-191 OCR crop 호출 병렬화

- 이슈: [DEV-191](https://linear.app/sswp6/issue/DEV-191), 사용자 제공 왜/완료 조건을 작업 지시서로 사용한다.
- 브랜치: `jinumeral/dev-191-parallel-ocr` (미머지 DEV-190 기반 유지)
- 기능·인수 조건: FEAT-03/04/07 · AC-SRC-2/3/5/6/8/10/11
- 상태: 진행 중

### 목표
파일 내 쪽/crop OCR 대기 시간을 제한된 병렬 실행으로 줄이고, 기존 근거 순서·쪽 실패 격리·호출별 비용/lease 보호를 유지한다.

### 범위 (수정 허용 경로)
- `server/app/core/config.py`
- `server/app/source_analysis/worker.py`, `server/app/source_analysis/final_eval.py`
- `server/tests/test_source_gemini_ocr.py`, `server/tests/test_final_eval.py`
- `docs/spec/source-analysis.md`, `server/app/source_analysis/spec.md`, 이 파일 DEV-191 끝 섹션
- `docs/wiki/Source-Analysis.md` 끝 영문 문단 추가

### 결정 사항
- 11/02 `SOURCE_OCR_CONCURRENCY` 기본4/최소1, 1은 speculative 호출 없이 기존 순차 경로를 재현한다. worker/final_eval은 같은 `transcribe_pages`를 사용한다.
- 11/02 stdlib ThreadPoolExecutor와 제한된 대기열로 crop만 병렬화한다. 쪽/crop 순서로만 span/진단을 병합하며 추출·후보 검증 순서는 유지한다.
- 11/02 OpenRouter OCR 어댑터는 호출마다 OpenAI 클라이언트를 만들고 닫는다. `paid_vision_call`과 eval Calls는 예약/정산마다 별도 SQLAlchemy Session을 만들며 Session을 스레드 사이 공유하지 않는다.
- 11/02 `budget.reserve`의 기존 `pg_advisory_xact_lock(563158)`이 전체/평가 원장 한도를 보호한다. eval의 `used` 확인·예약 반영·정산 차액은 별도 thread lock으로 보호하고 진단 entries도 예약 순서로 남긴다.
- 11/02 hard error를 발견한 실행 스레드는 stop 신호를 즉시 세운다. 대기 중 작업도 전송 전에 검사하며, 이미 보낸 호출은 정산 후 원래 예외를 전파한다. 일반 쪽 실패는 그 쪽의 미전송 crop만 중단한다. retry/429 정책은 변경하지 않는다.
- 11/02 `run_once`의 별도 heartbeat(30초/180초 lease)는 병렬 실행 전체를 감싼다. 각 호출의 `lock_context`가 취소/소스/승인/lease token을 전송 전에 검사한다.
- 11/02 기존 순차 호출 수/순서 전제 회귀는 concurrency=1을 명시하고 assertion을 보존한다. 새 테스트는 1/4 비교와 실제 DB 원장·hard stop·취소·heartbeat를 검증한다. 비자명 변경 테스트는 spec-blind-test 스킬의 격리 test-writer/fail-first 절차를 적용한다.
- 11/02 eval entries는 예약 시 완전한 보수적 기본값으로 생성한다. 정산 DB 실패에도 메타데이터 집계가 깨지지 않고 미정산 예약을 유지하며, usage/latency는 finally에서 기록한다.
- 11/02 독립 리뷰 재현: 제공자 hard error 뒤 정산이 느리면 다른 성공 crop이 대기열을 채울 수 있다. 실제 transcribe 예외를 받은 즉시 stop을 세우고 정산은 wrapper가 마친다. eval Calls도 한도 거절을 lock 안에서 latch해 대기 예약이 비용 반환 뒤 다시 허용되지 않게 한다.
- 11/02 예약 lock 대기 중 hard stop이 발생한 이미 시작된 작업도 실제 transcribe 직전에 stop을 재검사한다. 전송하지 않은 예약은 비용0으로 정산하고 결과 병합에서 제외한다.
- 11/02 사용자 지시대로 커밋·push·PR·외부/live/유료 호출은 실행하지 않는다. 신규 의존성 없음.

### 작업
- [ ] 설정·공용 병렬 OCR와 eval 비용 동기화 구현
- [ ] AC ID 회귀 및 fail-first/green 검증
- [ ] 제품·구현 spec / wiki 갱신
- [ ] 지정 Ruff/pytest/typecheck 실행, PREPARE sandbox 실패 별도 기록

### 완료 조건
- [ ] concurrency1/4 근거·진단·후보 순서 동일 및 sleep 기반 시간 감소
- [ ] 예산 초과 예약 없음, hard stop 후 in-flight 정산, PARTIAL/불확실 호출 정책 보존
- [ ] 지정 검증 결과와 사람이 실행할 development 시간 비교 명령 보고

### 기록
- 11/02 HEAD 기반 clean worktree 확인, DEV-190 기록/브랜치 유지. 구현 전 범위와 결정 기록.

- 11/02 구현: 설정 기본4/최소1, 공용 ordered bounded executor, 전송 직전/제공자 hard 예외 즉시 stop, in-flight drain, eval 예산 lock·한도 거절 latch·정산 실패 메타데이터 보존 구현. worker의 기존 요청별 Session/클라이언트·DB advisory lock·heartbeat를 유지했다.
- 11/02 격리 사양 기반 test-writer가 구현/diff 없이 회귀21개(parameter 포함)를 추가했다. 기존 함수의 본문 AST가 순서 있는 부분열로 유지됨을 확인: test_source_gemini_ocr22개, test_final_eval51개. 순차 호출 횟수로 응답을 만드는 기존5개 함수는 concurrency=1 전제를 명시했고 모든 원래 assertion을 유지했다.
- 11/02 fail-first: 런타임 mutation으로 executor 동시성을 강제로1로 제한한 뒤 `tests/test_source_gemini_ocr.py::test_AC_SRC_2_5_parallel_single_long_page_is_bounded_and_faster` → **1 failed (1.40s)**. concurrency4의 실제 중첩 검사가 실패했다. mutation은 Python 프로세스 안에만 적용해 파일 복구가 필요하지 않았다. 로그 `/private/tmp/dev191-red.log`.
- 11/02 초기 정상 병렬 회귀: `UV_CACHE_DIR=/private/tmp/farmclub-dev191-uv-cache DATABASE_URL=postgresql+psycopg://farmclub:farmclub@127.0.0.1:55484/farmclub_dev191 uv run --directory server pytest tests/test_source_gemini_ocr.py tests/test_final_eval.py -k parallel -q` → **19 passed / 156 deselected (5.80s)**. 그 뒤 독립 리뷰에서 발견한2건의 회귀를 추가해 최종21개가 되었다.
- 11/02 독립 diff 리뷰2건(제공자 hard 오류의 정산 지연 중 신규 전송, 정산 실패 시 빈 eval entry로 보고 실패)을 fake callback/session으로 재현하고 수정했다. 재검토에서 인증 오류 후 새 전송0건, 정산 실패의 미정산 예약 보존·정상 비용 요약을 확인했고 추가 must-fix0건이다.
- 11/02 순차 기준 실행: `SOURCE_OCR_CONCURRENCY=1` 및 위 DB/cache 환경에서 지정 pytest3개 파일 → **170 passed / 10 failed (36.40s)**. 최종 기본4 실행과 동일한 PREPARE 실패10건이었다.
- 11/02 최종 지정 검증: server에서 위 DATABASE_URL/UV_CACHE_DIR를 적용한 `uv run ruff check . && uv run pytest tests/test_source_gemini_ocr.py tests/test_final_eval.py tests/test_source_recovery.py` → **Ruff All checks passed / 종료0; pytest 191 passed / 10 failed (39.48s) / 종료1**. 신규 병렬 회귀21개는 모두 통과. 로그 `/private/tmp/dev191-final-pytest.log`.
- 11/02 PREPARE sandbox 실패(별도): 기존 source_gemini_ocr7건, source_recovery3건. 합성 텍스트 `prepare(b'Synthetic storage text', 'text/plain')`에서 `psutil.Process.children(recursive=True)` → `sysctl() malloc 1/3 PermissionError`가 prepare와 cleanup 양쪽에서 발생함을 직접 재현했다. 테스트를 삭제/약화하거나 환경 제한을 우회하지 않았다. 지정 묶음 전체 검증은 sandbox 밖 재실행 전까지 **미완료**로 두고 완료 체크박스/상태는 바꾸지 않는다.
- 11/02 `npm run typecheck` → **5 workspace 통과 / 종료0**. 신규 의존성0. 제품/구현 spec과 wiki 끝 영문1문단 갱신, `git diff --check` 통과. tasks/wiki의 HEAD 전체 바이트 prefix 보존.
- 11/02 범위 감사: 이번 `git diff HEAD`9경로는 모두 위 DEV-191 허용 범위 안이다. `git diff main...HEAD`681경로와 `origin/main...HEAD`14경로는 상속된 변경이며 이번 변경과 구분했다. HEAD `ae9885eae24b971fef9346918d38a5091bf4b201` 유지, 커밋·push·PR·live/유료 호출0.
- 11/02 의도한 커밋(실행하지 않음): `feat(source): AC-SRC-2/5/10 OCR crop 병렬화와 예산 동기화 (DEV-191)`; `test(source): AC-SRC-2/5/10 병렬 순서·중단·비용 회귀 추가 (DEV-191)`; `docs(source): AC-SRC-2/5/10 병렬 OCR 설정과 검증 기록 (DEV-191)`.
- 11/02 남은 검증: 사람이 sandbox 밖에서 지정 pytest3파일 재실행. 실호출 시간 비교는 아래 명령을 **사람이 실행**하며 이번 세션에서는 실행하지 않았다. development synthetic subset의 `22-pdf-25-pages`는 제품 한도에 따라 첫20쪽을 분석하므로 metadata의 해당 source `stage1Ms`/`endToEndMs`로 PDF 시간을 비교한다. CLI는 단일 source 선택 옵션이 없어 subset 전체를 실행하며 `/usr/bin/time`은 subset 총시간이다. c4는 c1의 저장 입력을 재사용한다.

```sh
cd server
export DATABASE_URL=postgresql+psycopg://farmclub:farmclub@127.0.0.1:55484/farmclub_dev191
/usr/bin/time -p env SOURCE_OCR_CONCURRENCY=1 uv run python -m app.source_analysis.final_eval \
  --split development --subset synthetic --provider openrouter --max-usd 3 \
  --dev-dir ../../source-dev-i3-private --out ../../source-dev-i3-private/dev191-ocr-c1 --yes
/usr/bin/time -p env SOURCE_OCR_CONCURRENCY=4 uv run python -m app.source_analysis.final_eval \
  --split development --subset synthetic --provider openrouter --max-usd 3 \
  --dev-dir ../../source-dev-i3-private --out ../../source-dev-i3-private/dev191-ocr-c4 \
  --inputs-from ../../source-dev-i3-private/dev191-ocr-c1/inputs.json --yes
```

- Agent 시간 / Tokens: 계측 미제공(추정 미기재). 대표 프롬프트: bounded crop concurrency, deterministic evidence, call-level budget locking, hard stop/drain, shared eval, no live calls. AI 오류 사례: 독립 리뷰에서 정산 지연과 정산 실패의 경계를 발견해 각각 회귀로 고정했다.

### DEV-191 후속 · 페이지 묶음과 stage-1 병렬화 (2026-11-02)

- 목표/입력: owner의 합성20쪽 PDF 측정은 concurrency1 101.6초 / 4 59.0초, 후보 동일. OCR40회 뒤 stage-1 20회가 순차로 약32초를 사용했다(사용자 제공 측정, 이번 세션 실호출 아님).
- 범위: 위 DEV-191 허용 경로를 유지한다. `tasks.md`는 이 파일이며 기존 본문/체크박스를 수정하지 않고 이 끝 섹션에만 추가한다.
- 결정: vision/OCR stage-1은 원문 순서의 span을 쪽 경계 너머로 최대4000자·4쪽까지 채운다. 큰 쪽은 기존 span 경계로 나누고 원래 쪽 번호/span ID를 보존한다. 텍스트 경로와 단일 span 분할 규칙은 유지한다.
- 결정: `SOURCE_OCR_CONCURRENCY`를 OCR 및 stage-1 각 단계의 제한으로 공유한다. 공용 bounded ordered executor로 병합 순서를 고정하고, 전송 전/제공자 hard 오류 즉시 stop·in-flight 정산·호출별 예약·자동 재시도 금지를 유지한다. eval은 기존 공용 `extract_vision_chunks`로 동일하게 실행한다.
- 결정: 여러 쪽의 근거는 `(page, spanId)`로 검증한다. 실패 청크의 모든 쪽을 `chunksFailed`에 기록하고 OCR 실패 쪽은 추출에서 제외한다. PARTIAL/FAILED 판정은 DEV-190을 유지한다.
- 검증 계획: 작은 쪽 묶기/4쪽 제한/4000자 경계/큰 쪽 분할/다쪽 인용·쪽별 동일 span ID/순서·중복·cap/청크 실패/병렬 예산·hard stop을 검증한다. 기존 한 쪽당 한 호출 전제의 테스트는 최대 쪽 수1 및 필요한 순차 동시성을 명시하고 원래 assertion을 유지한다.
- 실행 제한: 커밋·push·PR·live 호출 없이 로컬 stub/DB 검증만 수행한다. 지정 Ruff/pytest4파일/typecheck 결과를 끝에 추가한다.

#### 후속 구현·검증 기록

- 11/02 구현: vision stage-1을 원문 span 순서의4000자·최대4쪽 청크로 묶었다. OCR/추출은 공용 bounded ordered executor와 `SOURCE_OCR_CONCURRENCY`를 사용한다. 텍스트 분할/근거 검증/DEV-190 판정은 유지하고 `chunksFailed`에는 실패 청크의 모든 쪽을 남긴다. eval은 기존 공용 함수 연결을 그대로 사용하므로 별도 실행 코드 변경이 필요하지 않았다.
- 11/02 기존 테스트: 한 쪽만 읽는 fake/호출 수·순서·원장 행 수 전제에는 `single_page_extraction_chunks` fixture로 최대 쪽 수1을 명시했다. 호출 순서에 의존하는 테스트만 concurrency1도 명시했다. OCR 병렬 비교 테스트의1/4 설정은 유지했다. AST 감사에서 기존 OCR34개/eval55개 함수의 모든 본문 statement가 순서 있는 부분열로 보존됨을 확인했다(원래 assertion 삭제·수정0).
- 11/02 격리 사양 기반 test-writer는 구현/diff/커밋 이력 없이 새 회귀19건(parameter 포함)을 추가했다. 20쪽→5청크, 정확한4000자/4쪽 경계, 큰 쪽 분할, 쪽마다 같은 span ID/다쪽 인용과 잘못된 인용 거절, 동시성1/4 후보·상한·중복·순서 동일, 다쪽 청크 실패, 제공자 hard stop/예약 대기 중단/정산 대기, 실제 eval local/전체/평가 예산 원장, 실제 worker PARTIAL/FAILED/호출별 정산, 공용 eval 경로를 검증한다.
- 11/02 targeted green: `UV_CACHE_DIR=/private/tmp/farmclub-dev191-uv-cache DATABASE_URL=postgresql+psycopg://farmclub:farmclub@127.0.0.1:55484/farmclub_dev191 uv run --directory server pytest tests/test_source_gemini_ocr.py tests/test_final_eval.py -k followup -q` → **19 passed / 178 deselected (4.89s)**. 로그 `/private/tmp/dev191-followup-tests.log`.
- 11/02 fail-first: 파일을 바꾸지 않고 Python 프로세스 안에서 쪽별 분할로 강제한 packing 테스트 → **1 failed (0.64s)**, 공용 scheduler를 concurrency1로 강제한 병렬 추출 테스트 → **1 failed (3.60s)**. 각각 쪽 묶음 기대값/실제 동시 실행 barrier에서 실패했다. 로그 `/private/tmp/dev191-followup-red-packing.log`, `/private/tmp/dev191-followup-red-concurrency.log`. mutation은 프로세스 종료로 소멸했다.
- 11/02 지정 최종 검증: server에서 위 DB/cache 환경으로 `uv run ruff check . && uv run pytest tests/test_source_gemini_ocr.py tests/test_final_eval.py tests/test_source_recovery.py tests/test_source_analysis.py` → **Ruff All checks passed / 종료0; pytest 234 passed / 17 failed (47.70s) / 종료1**. 새19건은 모두 통과했다. 로그 `/private/tmp/dev191-followup-final-pytest.log`.
- 11/02 실패17건 분리 검증: 합성 텍스트 `prepare`에서 `psutil.Process.children(recursive=True)` → `PermissionError: sysctl() malloc 1/3`를 prepare/cleanup 양쪽에서 재현했다. 커밋된 HEAD worker를 Python 프로세스 안에만 로드하여 실패17개 selector를 재실행한 결과도 **동일17 failed (5.30s)**이고 각17건 모두 PREPARE의 같은 PermissionError를 기록했다. OCR8건/recovery3건/source_analysis6건이며 baseline 비교 로그 `/private/tmp/dev191-followup-baseline.log`. sandbox 우회/테스트 약화 없이 지정 묶음 전체 검증은 **미완료**, 기존 상태/체크박스는 유지한다.
- 11/02 `npm run typecheck` → **5 workspace 통과 / 종료0**. 로그 `/private/tmp/dev191-followup-typecheck.log`. 독립 로컬 diff 리뷰는 구체적 must-fix0건(실행 검증/제공자 호출은 하지 않은 코드 리뷰). 신규 의존성/프롬프트/gold 변경0, 새 라이브 시간/정확도 측정0.
- 11/02 문서/범위 감사: 제품 spec·구현 spec·wiki의 기존 전체 바이트 prefix를 보존해 끝에만 추가했고 tasks도 append-only를 확인했다. 이번 수정7경로는 전부 DEV-191 허용 범위다. `git diff main...HEAD`681경로와 `origin/main...HEAD`16경로는 기존 커밋 이력이며 이번 후속은 `git diff HEAD`7경로로 별도 대조했다. `git diff --check` 통과.
- 11/02 의도한 커밋(실행하지 않음): `feat(source): AC-SRC-2/5/10 페이지 묶음과 추출 병렬화 (DEV-191)`; `test(source): AC-SRC-2/3/5/10 다쪽 근거·병렬 추출·비용 회귀 추가 (DEV-191)`; `docs(source): AC-SRC-2/5/10 추출 청크 계약과 검증 기록 (DEV-191)`.
- 11/02 HEAD `c692c8d` 유지. 커밋·push·PR·외부/live 호출0. Agent 시간 / Tokens는 계측 미제공(추정 미기재). 남은 검증은 sandbox 밖에서 위 지정 pytest4파일 재실행이며 전체 통과 전까지 완료 선언/체크박스 변경은 하지 않는다.
- 11/02 owner 실측(합성 개발 23건, openrouter gemini-3-flash-preview): 20쪽 PDF `22-pdf-25-pages` 처리 시간 — 병렬화 전(DEV-190) 101.6초, OCR 병렬만 59.0초, 쪽 묶음+추출 병렬(동시성 4) **28.1초**(동시성 1에서는 79.1초). 추출 호출 20→5회, 23건 비용 $0.130→$0.103. 점수는 동시성 1·4 모두 사실 27/30·중요 17/20으로 같다. 전체 pytest 1262 passed(나머지 2건은 기존 간헐 테스트로 단독 재실행 31/31 통과).

## DEV-192 간헐 실패 테스트 안정화 — `test_AC_SRC_5_11_stale_refinement_restores_verbatim_fallback[delete_source]`

- 이슈: https://linear.app/sswp6/issue/DEV-192 · 같은 이슈의 다른 테스트는 `server/tasks.md`(AC-11-3), `apps/consumer/tasks.md`(AC-34-7, AC-10-6) DEV-192 섹션.
- 범위: `server/tests/test_source_refine.py`만. 제품 코드는 바꾸지 않는다(테스트 쪽 원인).
- 원인: `tests/test_source_analysis.py`의 `start()`가 대표 사진(`original_photo=True`)을 묶음에 붙이므로 `ready()` 뒤 묶음 자료는 글 자료와 사진 둘이다. `test_source_refine.py:1351`의 `original_id = db.scalar(select(Asset.id).where(Asset.batch_id == ...))`는 순서 없는 조회라 PostgreSQL이 돌려주는 첫 행(힙/인덱스 TID 순서)에 따라 사진 id를 집을 수 있다. 그러면 정리 후보를 가진 글 자료가 `{original_id, source["id"]}`에 없어 1390줄 `assert owner_asset.id in {...}`가 실패한다. 단독 실행에서는 글 자료가 먼저 나오고, 전체 실행에서 앞 테스트의 삭제로 생긴 빈 칸에 행이 다시 쓰이면 순서가 바뀐다.
- 수정: 조회에 `Asset.original_photo.is_(False)`를 더해 글 자료 하나만 고른다. assertion은 그대로다.
- 결정적 재현: 원래 테스트에서 글 자료를 non-HOT update 두 번으로 사진보다 뒤 TID로 옮기면 CI와 같은 `assert 'src_…' in {…}`로 **1/1 실패**. 같은 조작을 한 수정본은 **통과**. (임시 probe 파일은 지웠다)
- 반복: 수정 전 단독 0/20, 파일 일부(-k) 0/10 실패(로컬에서 자연 재현 안 됨). 수정 후 단독 **0/20**, 파일 전체 **0/3**, 전체 pytest **0/3 실패(각 1264 passed)**.
