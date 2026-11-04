## DEV-58 최신 main 동기화 (2026-10-17)
- 범위: 기존 DEV-56/57/58 경로 내 core/seed.py, migrations, source spec, 검증 기록. main 변경은 원본 그대로 보존한다.
- 결정: main에 운영자 migration0007이 먼저 병합되어, 미배포 브랜치의 source integration은0008, preprocessing은0009로 재번호를 부여한다. 기존 로컬 평가 DB와 비용 원장은 dump로 보존하고 별도 새 DB에서 migration/전체 회귀를 검증한다. PR 머지는 하지 않는다.
- [x] 충돌 해결·전체 로컬 검증·커밋 스캔·main 동기화 커밋 CI 확인

- OCR 반환 좌표가 NumPy float32일 때 JSON 직렬화되는지 확인하는 회귀 테스트를 위해 numpy를 개발 의존성에 명시한다. CI의 기본 uv sync에서도 해당 테스트를 건너뛰지 않고 실행한다.

- 최종 통합: b8d33f3 원격 server/apps/integration CI 통과. 로컬에서 발견된 초기 입력 손실과 배송지 E2E 경쟁은 producer readiness/응답 대기로 보완한 뒤 실제 API7개·Chromium22개 전부 통과했다. 서버238개·타입4개·mock12개도 통과. 마지막 UI 보완 커밋의 원격 CI 상태는 PR #113에서 추적하며 Draft/미머지를 유지한다.

### DEV-58 모델 상향 (2026-10-17)
- 사용자 결정: 비용을 조금 늘려 더 좋은 모델을 사용한다. 기본 추출 모델을 OpenRouter `google/gemini-3-flash-preview`로 변경한다. 공식 단가는 입력/출력 100만 토큰당 $0.50/$3.00으로 기존 Flash-Lite의 2배다.
- 범위: 위 DEV-56/57/58 범위 안의 core 설정, source AI 어댑터, 비용 예약, worker, 평가 CLI, 관련 테스트·spec·wiki·검증 메타데이터.
- 결정: 모델별 허용 단가를 한 곳에 두고 설정 검증·제공자 가격 상한·비용 예약에 공유한다. 기존 Lite는 명시적 비교 실행에만 선택 가능하며 자동 fallback은 추가하지 않는다. 예약은 worker의 현재 기본값 대신 Run에 저장한 실제 모델을 따른다. 평가 CLI도 설정 모델을 호출·기록한다.
- 비교 원칙: OCR·프롬프트·고정 정답은 유지하고 같은 실제12건으로 평가한다. $1 평가/$5 누적 한도와 기존 비용 원장을 유지한다. 모델 교체만으로 OCR 오류가 해결된다고 간주하지 않는다. PR #57/#113 머지 및 배포는 하지 않는다.
- [x] 모델·가격 제한·예약/평가 일관성 구현 및 회귀 검증
- [x] 실제12건 모델 비교와 비용·한계 기록

- 검증: 전체 `pytest -q` 244개 통과 후 평가 CLI 회귀2개 추가, 관련 `pytest -q tests/test_source_integration.py` 최종21개 통과. `ruff check .`, `npm run typecheck`4개 workspace, `npm run test:mock`12개, `npm run test:integration:full` API7개/Chromium22개 통과.
- 실제12건: 동일 safeInput/정답 확인, precision37.04→38.71%, recall30.30→36.36%, 비용$0.023114. 출하시기 뒷부분/선별 설명/규격 분류 개선, GAP 누락·OCR 오타·일부 필드 오분류 유지. 표본별1회 반복 개발평가이므로 일반 성능 향상을 확정하지 않는다.
- 합성20건(18실호출+2계약): 정확일치90%/90%, 텍스트94.44%/94.44%, PDF100%/100%, 회전이미지0%/0%. 과거 판매 라벨 보존/이미지 문장 병합 때문에 실패했으며 정답/프롬프트를 바꾸지 않았다. 비용$0.018023. DEV-58 품질 게이트는 여전히 미달.
- 이번 실호출 합계$0.041137. 기존 원장183건 정산$0.137194/미정산 예약$0.191654(개별 micro-USD 올림 적용), 팀 전체 사용량 아님. 기록: docs/spec/validation/source-model-upgrade-2026-10-17.json. 원문/생성 결과는 ignored 로컬 artifacts에만 보존한다.
- 커밋 스캔: 이슈 없음. 레거시 호환 점검 후보1건 — 지적0건 / 커밋된 구조1건(google/gemini-3.1-flash-lite:388d956, 명시적 모델 비교 지원). PR #113 Draft 및 DEV-58 In Progress 유지, 머지/배포 없음.

### DEV-58 Sol 비교 평가 (2026-10-17)
- 사용자 승인: GPT Sol로 같은 실제12건을 비교한다. 기본 Flash는 유지하며 OpenRouter `openai/gpt-6.1-sol`을 명시적 평가 선택으로 추가한다. 기존 DEV-58 범위 안의 설정·어댑터·평가 진단·회귀 테스트·spec/wiki/메타데이터만 변경한다.
- 결정: 입력/출력100만토큰당 $2/$10 가격 상한, 지원되는 최소 추론 `low`, 최대 출력4096토큰을 사용한다. 자동 재시도/모델 fallback 없음. OCR·프롬프트·원문·정답·시각 선택은 기존12건과 동일하게 유지한다.
- 예산: 기존 원장을 보존하고 시작 시 누적 평가 사용액(정산+미확인 예약)에 $0.50을 더한 값과 기존 $1 한도 중 작은 값을 이번 프로세스의 평가 상한으로 적용한다. 모든 호출 전 영속 예약으로 검사하고 새 원장을 만들거나 한도를 우회하지 않는다.
- [x] OpenRouter Sol 선택 및 비용/추론 계약 회귀 검증
- [x] 실제12건 비교·비용·실패 분석과 리뷰 가능한 결과 저장

- 결과: Sol12/12 응답·근거 검증 완료. 정확일치 precision/recall36.36%/36.36%(Flash38.71%/36.36%), 비용$0.087277(Flash의3.776배), p50 5.408초/p95 26.622초. GAP/선별 과정/맛 분류 일부 개선, OCR 오타와 문구·필드 문제 유지. 이미지 직접 입력0건으로 시각 OCR 성능 비교가 아니다. 기본 Flash 유지.
- 공백만 제거한 사후 진단: Lite51.85%/42.42%, Flash54.84%/51.52%, Sol57.58%/57.58%. 주 평가/정답은 그대로 유지하며 의미 정확도로 주장하지 않는다.
- 검증: `pytest -q`250개, `ruff check .`, 타입4 workspace, mock12개, 실서버 API7개/Chromium22개 통과. 실제 생성 결과 비교 페이지를 현재 ModuleStory로 렌더했고3모델 카드/390px 가로 넘침0/콘솔 오류0을 확인했다. 원문/정답/응답은 ignored private artifacts에만 보존한다.
- 원장195건 정산$0.224474/미확인 예약$0.191654. 이번 평가 상한$0.828848(시작사용액+$0.50, 기존$1 이내)을 적용했다. 기록: docs/spec/validation/source-sol-comparison-2026-10-17.json. 비교화면: http://127.0.0.1:18084/models.html.
- 커밋 스캔: 이슈 없음. 레거시 호환 후보2건 — 지적0건 / 커밋된 모델 선택2건(Lite:388d956, Flash:cbe1d6f). DEV-58 In Progress/PR #113 Draft, 머지·배포 없음.

### DEV-58 직접 이미지 OCR 비교 (2026-10-17)
- 사용자 승인: 동일 이미지6건을 Sol/Gemini OCR로 실제 비교하고 기존 RapidOCR 대비 개선과 비용을 확인한다.
- 범위: 기존 DEV-58 평가 범위의 ignored `server/app/ai/.artifacts/vision_ocr_experiment.py`, `server/.artifacts/source-vision-comparison/**`, 로컬 비교 화면, `server/tasks.md`, `docs/spec/validation/**`, 관련 source spec/wiki 결과 기록. 제품 OCR·기본 모델·API는 이번 실험에서 바꾸지 않는다.
- 결정: 이미 가림 처리된 동일6이미지만 전송한다. JPEG quality85의 동일 입력을 두 모델에 제공하고 긴 이미지는 같은 고정 구간으로 분할한다. Sol low/Gemini Flash minimal, OCR 호출은2048 출력토큰, 후속 추출은 기존 Flash4096/프롬프트/고정 정답을 사용한다. OCR에는 정답·기존 OCR 텍스트를 주지 않는다. 자동 재시도 없음.
- 평가: 기존 RapidOCR+Flash 결과를 대조군으로 보존한다. OCR 단계는 기존21개 정답의 근거 구절을 공백 제거 후 찾는 회수율과 수동 오인식 검토로 비교한다(전체 문자 정확도/CER 아님). 후속 추출은 기존 정확일치와 공백 제거 진단을 별도로 기록한다. OCR 인용 검증 통과는 이미지 내용이 참임을 보증하지 않으므로 원본 대조를 병행한다.
- 예산: 동일 기존 비용 원장195건을 유지한다. 이번 실험 시작 사용액(정산+미확인 예약)$0.416128에 추가$0.50을 더한 $0.916128 평가 상한(기존$1 이하)을 적용한다. 이미지 base64 길이 기반 기존 보수적 예약을 그대로 사용하고 실제 usage로 정산한다. 한도 부족 시 자동 증액하지 않는다.
- [x] Sol/Gemini 각각6건 OCR + 동일 Flash 추출 완료
- [x] 정답 고정 확인·오타/누락/추출 정확도·실제 비용 및 비교 화면 기록
- 결과: 34/34 실호출 성공(OCR22 + Flash 추출12), 12/12 근거 검증 완료. 고정21근거 회수 RapidOCR15, Sol19, Gemini20. 원본 PDF 텍스트/이미지 대조에서 정답1건의 날짜기호(~→-) 오류를 확인했으며 기존 정답/주 점수는 보존했다. 그 한 글자만 고친 별도 진단은 Gemini21/21이다. 전체 문자 정확도로 해석하지 않는다.
- 최종 추출 고정정답 정확일치 P/R: RapidOCR22.22%/19.05%, Sol OCR57.89%/52.38%, Gemini OCR50%/42.86%. 원문 확인 정답1건 보정 진단에서 Gemini55.56%/47.62%, 다른 모델 동일. 긴이미지를 포함한5/6건의 두 VLM 판독은 공백 제거 후 같아 후속 Flash 출력의 변동/묶음/분류가 점수 차이를 만든다. Sol이 더 좋은 OCR이라는 결론은 내리지 않는다.
- 실제 비용: Sol OCR$0.025071 + Flash 추출$0.010216 = $0.035287; Gemini OCR$0.0093205 + Flash 추출$0.011973 = $0.0212935. 합계$0.0565805로 이전 견적보다 낮았다. 원장229건 정산$0.281061, 기존 미확인 예약$0.191654 유지. 새 미정산0건.
- 판단: Gemini OCR을 통합 후보로 권장한다. Sol은 farm-water에서 농장명/체험 단어를 새로 오인식했다. 두 OCR 모두 뒤의 Flash가 계절 목록을 나누거나 GAP·활용 문구를 누락하는 문제는 해결하지 못했다. 후속 단계의 문장 경계/필드 분류 개선과 독립 자료 평가가 필요하다. 이번 작업은 비교 평가만이며 제품 OCR은 변경하지 않았다.
- 검증: 가림된 동일 입력 해시/기존 정답 manifest SHA 불변/영속 예약·정산/12개 추출 근거 검사 확인. 비교 화면6사례×3카드, 390px 가로 넘침0/JS 오류0. source PDF 재확인은 설치된 pypdfium2로 수행했다(fitz는 미설치라 사용하지 않음). 원문/출력/스크립트는 ignored private artifacts; 공개 결과는 docs/spec/validation/source-vision-ocr-comparison-2026-10-17.json. http://127.0.0.1:18084/ocr.html.

### DEV-58 추출 묶음·분류·누락 보완 (2026-10-17)
- 사용자 승인: OCR 교체 범위를 늘리지 않고 묶음·분류·누락 검사만 개선한 전후 결과를 보여준다.
- 범위: `server/app/ai/source_analysis.py`, `server/app/source_analysis/{models,worker,synthetic,coverage}.py`, `server/app/source_analysis/spec.md`, 관련 source 테스트, `server/tasks.md`, source spec/wiki/검증 메타데이터, ignored 평가 스크립트·비교 화면. OCR 모델/원문/기존 정답·채팅·배포는 변경하지 않는다.
- 결정: 의미 문장/라벨 목록 단위로 추출하고 물리 줄바꿈은 근거 span으로만 보존한다. 과정·인증·맛·보관·사용 제안의 필드 우선순위를 명시하고 응답 전 근거 구절 누락을 점검한다. 근거 없는 값을 후처리로 생성하거나 금지된 추론을 허용하지 않는다.
- 결정: source-v4로 프롬프트 버전을 올려 기존 결과를 새 결과로 재사용하지 않는다. 구버전 대기 작업은 전송 전에 실패시켜 새 분석/명시적 재시도로 현재 버전을 적용한다.
- 결정: 비공개 평가 진단에 근거 span별 미반영 문구를 보수적으로 탐지하는 누락 점검을 추가한다. 원문을 길게 인용했어도 실제 value에서 빠진 내용은 표시하고, 장식/중복 구절 등 오탐 가능성을 명시한다. 자동 보완/추가 유료 호출은 하지 않는다.
- 평가: 저장된 Gemini OCR6건을 그대로 재사용해 Flash 추출만 재실행한다. 원문/고정 정답/이전 결과 유지, 이미 확인된 날짜기호 정답1건 보정은 별도 진단. 실제/합성 회귀와 전후 화면 확인. 추가 평가 한도$0.25, 기존 원장·$1 전체 평가 상한 유지.
- [x] 프롬프트·버전·누락 진단 및 의미 있는 회귀 테스트
- [x] 같은 OCR6건 개선 전후 실호출·회귀 평가·비교 화면
- 결과: 동일 저장 Gemini OCR6건의 추출 정밀도/재현율50%/42.86% → 85.71%/85.71%(9→18개 일치). 원문 확인 날짜기호 정답1건 보정 진단은55.56%/47.62% → 90.48%/90.48%. 정답은 변경하지 않았다. 남은 정확일치 차이는 원문 날짜기호, 규격 공백, 더 긴 인증 표현이다. 목록 묶음/과정 분류/맛·활용 문구/보관3문장과 인증을 복원했다.
- 회귀: 기존 RapidOCR 입력12건의 P/R38.71%/36.36% → 43.24%/48.48%, 텍스트3건100% 유지. 합성18건90%/90% 유지(텍스트16건94.44%, PDF100%, 회전이미지0%; 과거판매 라벨/회전이미지 문장 묶음 문제 유지). 실제 API의 실패/자동 금지 검사0건은 의미 정확도100%를 뜻하지 않는다. 독립 홀드아웃이 아닌 반복 개발자료다.
- 비용: OCR 재호출 없이 개선 전후6건 추출$0.013377, 기존 실제12건$0.027815, 합성18건$0.02214, 합계$0.063332. 원장265건 정산$0.344402/기존 미확인 예약$0.191654, 새 미정산0건. 이번 프로세스 평가 상한$0.722715(시작사용액+$0.25, 기존$1 이내) 유지.
- 검증: 집중31개/전체 pytest256개, Ruff, 타입4 workspace, mock12개, 실제 API7개·Chromium22개 통과. 전후 비교 화면6사례×2개 ModuleStory, 390px 가로 넘침0/JS 오류0. 금번 렌더 스크립트의 초기 JS 줄바꿈 오류를 수정한 뒤 최종 검증 통과. 현재 URL http://127.0.0.1:18084/extraction.html.
- 범위: 기본 OCR은 RapidOCR, 추출 모델은 기존Flash 유지. 채팅/배포/머지 없음. 누락 점검은 평가용 보조 진단이며 생산자용 자동 보완이나 무조건 통과 처리로 연결하지 않는다. DEV-58 품질95% 기준과 실제 농가 인수는 미완료.
- 커밋 전 scan-before-commit 점검: 회귀/버그/불필요 추가/미커밋 호환 이슈 없음. 모델·예약·평가 호출부와 source-v4 캐시/구버전 차단을 확인했고, 새 누락 진단은 원문/값을 변경하지 않는다. 전후 지연시간은 이전 OCR 포함/이후 추출만이라 속도 비교에 쓰지 않도록 메타데이터에 명시했다. 레거시 호환 점검: 후보2건 — 지적0건 / 커밋된 구조2건(Lite:388d956, Flash:cbe1d6f). 구버전 source-v3는4047e06에 실재하며 새 작업은 이를 수용하지 않고 재분석을 요구한다.

## DEV-58 사용자 채택 Gemini OCR 제품 통합 (2026-10-17)

- 사용자 결정: 동일 저장 Gemini OCR6건 + source-v4 추출의 P/R85.71% 버전을 채택해 PR #113 수정. 과거95% 목표를 이번 채택의 강제 머지 조건으로 유지하지 않는다. 독립 성능/농가 인수 완료로 주장하지 않는다.
- 범위: server/app/ai/{source_analysis.py,source_ocr.py}, server/app/source_analysis/{worker.py,budget.py,service.py,spec.md}, server/tests/test_source*.py, server/tasks.md, apps/producer/src/lib/SourceWorkspace.tsx, apps/producer/{spec.md,tasks.md}, docs/spec/source-integration.md, docs/wiki/Source-Analysis.md, docs/spec/validation/source-gemini-production-2026-10-17.json, PR #113/Linear DEV-58.
- 결정: OpenRouter 이미지/PDF는 가림 승인 후 Gemini Flash OCR(2048 tokens/minimal)→기존 source-v4 추출 문구로 처리. 로컬 RapidOCR은 가림 좌표용으로 유지. 원본 사진은 분석 제외, 텍스트/mock/OpenAI 경로 유지. OCR용 가림 JPEG85만 전송, 긴 자료는 제한된 비중첩 조각. OCR/추출 각각 독립 비용 예약·정산, 불확실한 전송 자동 재시도 금지. OCR spans는 해당 Item.pages에 비공개 보존하여 페이지 원본 좌표를 덮어쓰지 않는다. 신규 pipeline version으로 이전 성공결과 재사용 차단. 이전 수치와 새 제품 경로 회귀 검증은 구분.
- DB 스키마 변경 없이 기존 작업 JSON 활용. main 충돌 해결·마이그레이션 재번호·머지는 이번 OCR 구현과 분리하며 PR 최신 상태에 명시.
- [x] OCR 어댑터/제품 worker/사용자 안내 연결
- [x] 가림·예산·취소·실패·근거·장문/텍스트 회귀 검증
- [ ] 명세/평가 한계/PR/Linear 갱신 및 커밋 전 스캔

- 검증: 전체 pytest267개, mock12개, 타입4 workspace, Ruff 통과. 실제 팀 OpenRouter로 긴 이미지 OCR6회+추출1회28.364초/$0.011443, 가림 준비3.578초. 실제 UI 업로드→가림→검토/설정→비공개 저장→명시적 적용→공개 본문 일치 확인. 기존 승인 상품 수정이며 사용자 직접 인수는 대기. 자동 테스트가 저장 후 열린 미리보기를 다시 눌러 닫은 뒤 같은 초안에서 재개했으며 유료 호출은 반복하지 않았다. 원문/영상/키는 ignored artifacts에만 보관한다.

- 커밋 전 scan-before-commit: 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보1건 — 지적0건 / 커밋된 구조1건 (Item.pages number/spanIds:388d956). 예약 함수 전체 호출부와 신규 어댑터/테스트 포함 확인. PR/Linear 기록은 UI 추가 요청 반영 후 함께 갱신한다.

## DEV-58 상품별 편집 작업·생산자 흐름 안정화 (2026-10-17)
- 사용자 승인 계획: 판매 중 상품에서 현재 판매페이지 직접 수정, 신규 상품/작업 원자 생성, 생산자 앱 전체 공통 UI·흐름, 영상3개. 탭4개 유지, AI 채팅 기능/배포/머지 제외.
- 범위: server/app/source_analysis/**, server/app/catalog/{models,schemas,service}.py, server/migrations/**, server/tests/**, server/tasks.md, apps/producer/**, packages/api/**, packages/ui/{src,spec.md,tasks.md}, scripts/e2e/**, docs/spec/{source-integration,validation/**}.md, docs/wiki/Source-Analysis.md. main 동기화 충돌 파일은 main 변경 보존.
- 결정: 상품별 비공개 작업 연결을 보존하고 생성/재개 API를 멱등 처리. 현재 공개 모듈을 원본 없이도 편집 가능하게 복원하며 기존 공개 사진 보존, 근거 추정 금지. 신규 상품/작업은 한 트랜잭션. 저장/공개 분리·버전/권한 유지.
- [ ] main 동기화·마이그레이션 충돌 정리
- [ ] 상품별 편집/원자 생성 API·회귀
- [ ] 생산자 전체 화면 규격·이동/저장 정리
- [ ] 회귀·영상3개·스펙/Linear/PR·커밋 스캔
## DEV-58 상품별 판매페이지 편집 구현 기록
- main 동기화: DEV-39의0008 보존, source integration0009/preprocessing0010로 재번호. 격리 DB upgrade→0008 downgrade→head 재업그레이드 및 전체 pytest275개 통과. 기존 데모/평가 DB는 변경하지 않았다.
- 구현 결정: 상품별 Workspace에 비공개 판매페이지 스냅샷·기준 상품 버전·자료 batch 연결을 저장한다. 기존 moduleDetail와 detailContent를 그대로 보존하는 두 스냅샷 형식을 사용해 원본 자료 없이 편집한다. 모듈/기존 블록을 임의 변환하지 않는다. 새 API는 상품+batch+workspace 원자 생성/재개, 비공개 페이지 저장/명시적 적용. source 적용과 페이지 편집 사이 미공개 충돌은 차단한다. 범위 추가: server/app/core/seed.py(새 FK 정리 순서).

- 구현 완료: 상품별 현재 내용 재개·비공개 저장·명시적 적용, 18모듈 추가/숨김/문구 편집 및 기존 블록 보존, 새 상품 원자 생성/응답 유실 멱등 재시도. source 적용과 수정본 충돌 보호, 삭제된 원본 작업과 독립 편집, 본인 전용 사진 조회를 포함한다.
- 검증: 전체 `pytest -q` 281개, `npm run typecheck` 4 workspace, `npm run test:mock` 13개, Ruff 통과. 격리 API/DB의 생산자/자료 Playwright18개 통과, 사진 권한 보완 후 상품 편집·자료 적용4개 및 응답 유실 재시도2개 추가 통과. migration0011 upgrade/downgrade0010/re-upgrade 통과.
- 화면 점검: 현황의 제목/여백, 상품 목록 카드/판매페이지 진입, 환경설정 카드, 농가 프로필/출하 간격을 공통 토큰에 맞췄다. 기존4탭·URL 상품 필터/출하 상태 및 기존 송장 오류 보존 계약을 유지한다. 로그인/승인/정지 안내는 기존 공용 컴포넌트 유지, AI 채팅 동작은 수정하지 않았다.
- scan-before-commit: 새 상품 effect의 미커밋 중간 코드 제거, 잠금 대기 후 workspace 재조회, 비공개/숨김 사진 접근 보완. 최종 이슈 없음. 레거시 호환 점검: 후보2건 — 지적0건 / 커밋된 구조2건 (detailContent: b464eba, moduleDetail: 388d956).
- 사용자 영상 확인 전 PR113 Draft/미머지 유지. 추가 AI 호출/배포 없음. Agent 시간/Tokens 미측정.

## DEV-58 상세 편집 통합·항목별 ON/OFF
- 사용자 승인: 근거 검토 별도 탭/개별 확정 제거, 기존18항목별 스위치, 자동 채움·직접 편집·선택적 원문 보기.
- 범위: apps/producer/src/lib/{SourceWorkspace,SourceDetailsEditor,ProductPageEditor}.tsx, packages/api/src/sourceAnalysis.ts, server/app/source_analysis/**, server/tests/**, scripts/e2e/**, 해당 spec/tasks 및 docs/spec/source-integration.md/docs/wiki/Source-Analysis.md.
- 결정: 유효한 단일 후보만 자동 채움(UNREVIEWED 유지), 충돌/과거/오래된/불명확한 후보 제외. 기존 저장 내용/선택 우선, OFF내용 보존. 편집값+모듈 선택 원자 저장 API와 기존 API 병행. 사진 승인/버전/명시적 공개 유지. 추가 AI 호출·머지·배포 없음.
- [x] 구현/회귀/영상/커밋 스캔

- 범위 추가: docs/spec/source-analysis.md의 예전 개별 확인 필수 문구를 승인된 자동 채움·항목별 선택 계약에 맞춘다. OFF된 오래된 사진은 비공개 보존하고 다시 켤 때 준비/연결 검증을 수행한다.

- 완료: 근거 검토 탭/개별 확정 제거, 자동 채움·18항목 스위치·직접 편집·접히는 원문, 문구/선택 원자 저장. 자동 값은 UNREVIEWED 유지, OFF 값/사진 보존, 충돌·오래된 항목은 선택적 해결. 기존 상품 편집도 같은 스위치로 통일했다.
- 검증: 전체 pytest284개 통과 후 오래된 OFF 사진 케이스 추가/보완을 포함한 최종 관련22개 통과. Ruff, 타입4 workspace, mock13개 통과. 기존 생산자·자료 Playwright18개 + 저장 실패/동일 요청 재시도1개 통과; 직접 탭 진입/분석 완료 갱신 보완 후 관련9개 재검증 통과.
- scan-before-commit: 상세 편집 탭 직접 진입 시 최신 결과를 읽지 않던 경로와 분석 중 열린 편집 화면의 초기 선택 갱신을 보완. 미저장 입력은 기존 버전에 고정해 충돌 시 보존한다. 최종 이슈 없음. 레거시 호환 점검: 후보1건 — 지적0건 / 커밋된 구조1건 (기존 review/drafts CONFIRMED 계약: 4d7eece).
- 영상: .artifacts/in-app-v4/toggle-review/index.html. 새 상품 mock 분석의 자동 채움/OFF저장/재진입/ON복원, 기존 실제 Gemini 생성 상품의 수정/반영을 녹화. 추가 유료 AI 호출0, PR113 Draft·머지/배포 보류. Agent 시간/Tokens 미측정.

## DEV-58 분석 완료 표시·업로드 개인정보 안내 전환
- 사용자 지시: 실행별 완료 n/n 제거, 최신 분석 상태 하나만 표시. 개인정보 가리기/승인 기능 대신 업로드 전 직접 가리기 안내.
- 범위: apps/producer/src/lib/SourceWorkspace.tsx, server/app/source_analysis/{worker,service}.py, server/tests/test_source*.py, scripts/e2e/source*.ts, apps/producer/{spec,tasks}.md, server/{spec,tasks}.md, docs/spec/{source-analysis,source-integration}.md, docs/wiki/Source-Analysis.md.
- 결정: 개인정보는 업로드 전에 사용자가 직접 제거. 새로 준비된 자료는 자동 가림 없이 분석 가능 상태로 전환한다. 기존 가림본과 버전 취소/예산/권한 보호는 유지한다. 기존 대기 작업은 취소 후 새 분석으로 이어갈 수 있도록 안내한다. 추가 유료 호출·머지·배포 없음.
- [x] 구현·관련 회귀 검증

## DEV-58 두 첨부함·설명 기반 사진 배치·페이지 직접 편집
- 사용자 승인 계획: 자료/상품사진 별도 썸네일 박스, 텍스트 자료 수정, 상품사진 한 줄 설명으로만 AI 위치 분류, 완료 후 편집 진입, 실제 페이지에서 문구/사진/ON-OFF 편집.
- 범위: apps/producer/src/lib/**, packages/{ui,api}/src/**, server/app/{source_analysis,ai}/**, server/migrations/versions/**, server/tests/test_source*.py, scripts/e2e/source*.ts, 관련 spec/tasks 및 docs/spec/{source-analysis,source-integration}.md, docs/wiki/Source-Analysis.md.
- 결정: 사진 설명은 캡션/상품 사실로 사용하지 않는다. 상품사진은 OCR 없이 준비하고 위치 분류에 이미지 전송하지 않는다. 미배치 사진 수동 선택, 수동 수정 우선. 기존 초안/가림본 보존. 추가 유료 검증/배포/PR113 머지 없음.
- [x] 백엔드·직접 편집기·통합 검증·영상

- DEV-58 scope addition: docs/spec/source-editor.md; current source-editor contract supersedes the previous UI/approval flow.

- 완료: 자료/상품사진 두 박스·텍스트 수정·설명만 이용하는 사진 배치, 분석 완료 후 페이지 직접 편집, 사진 추가/제외/이동/순서 및 원래 위치의 OFF 접기. 최신 상태 하나와 업로드 전 개인정보 제거 안내로 전환. 비공개 저장/명시적 적용·버전·권한 보호 유지.
- 검증: 전체 `pytest -q` 291개, `npm run typecheck` 4 workspace, `npm run test:mock` 13개, Ruff 통과. 격리 DB/API의 source-analysis/source-editor/source-workspace-ui/product-page-workspace Playwright 11개 통과. migration0012 upgrade/downgrade0011/re-upgrade 통과.
- 영상: `.artifacts/in-app-v4/page-editor-review/index.html` (새 자료→직접 편집→저장/공개, 기존 상품 사진 추가/제외/복원/순서→저장/공개). mock 제공자 및 기존 저장 결과만 사용, 추가 유료 호출 0. 사진 설명 분류의 실제 모델 품질 평가는 별도 미실시.
- scan-before-commit: 사진 업로드 중 중복 조작·사진 풀 중복·분류 재시도 중복·버전 충돌 보호 보완 후 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보3건 — 지적0건 / 커밋된 구조3건 (privacy_approved: 4d7eece, modules/blocks: 839503e, SourceRun inputs 없는 실행: 388d956).
- 사용자 영상 확인 전 PR113 Draft/미머지·미배포 유지. Agent 시간/Tokens 미측정.

## DEV-58 큰 섹션 눈 아이콘·항목 제외
- 승인 계획: 큰 제목 왼쪽 눈으로 섹션 전체 제어, OFF 제목/장식 흐림, 하위 항목·사진 우측 상단 ×, 연한 placeholder. 별도 회색 조작 줄/접기 없음.
- 범위: apps/producer/src/lib/{PageCanvas,SourceDetailsEditor,ProductPageEditor}.tsx, packages/{ui,api}/src/**, server/app/source_analysis/**, server/tests/{test_source*,test_product_workspace}.py, scripts/e2e/{source-analysis,source-editor,product-page-workspace}.spec.ts, apps/producer/{spec,tasks}.md, server/{spec,tasks}.md, docs/spec/source-editor.md, docs/wiki/Source-Analysis.md.
- 결정: hiddenSectionIds는 JSON 초안/API에 저장하며 기존 enabled와 분리. 숨김은 공개/활성 근거 검증에서 제외, 재활성화 시 재검증. 기존 초안은 빈 배열 기본값. ×는 비파괴 제외, 항목 추가/사진 풀에서 복원. SQL 마이그레이션 없음. PR113 Draft/미머지/미배포, 유료 AI 호출 없음.
- [x] 구현·저장/공개 회귀·타입·브라우저·커밋 스캔

- 완료: 큰 제목 바로 왼쪽 눈·OFF 제목/장식/구분선 흐림, 하위 항목/사진 ×와 복원, 연한 placeholder, 섹션 숨김/개별 제외 독립 저장·공개 필터 적용.
- 검증: server/에서 `pytest -q tests/test_source_editor.py tests/test_product_workspace.py tests/test_source_integration.py tests/test_source_analysis.py` 57개 통과(12.72초), 타입4 workspace 및 최종 생산자 타입 검사 통과, mock13개 통과. 격리 DB/API Playwright15개 최종 통과(1.0분), 360/390/430px 정렬·흐림·제외/복원·placeholder·새로고침·미리보기/공개 확인. Ruff/diff 검사 통과.
- 스캔: 여러 저장본 중 최신 hiddenSectionIds 선택 및 활성 충돌 항목 확인 경로 보완. 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보2건 — 지적0건 / 커밋된 구조2건 (Draft snapshot:4d7eece, PageSnapshot:839503e).
- 검증 과정의 루트 cwd 실행은 전처리 subprocess 환경 때문에 실패하여 server/에서 정상 재검증. 브라우저 fixture 모델 등록 및 실제 사진 선택자를 수정했다. 화면 캡처 `.artifacts/section-editor-{360,390,430}.png` 확인. 기존 영상은 이번 조작 변경 전 기록으로 남김. 로컬 API 재시작만 수행, 기존 데이터 재시드/AI 호출 없음. PR113 Draft/미머지/미배포. Agent 시간/Tokens 미측정.

## DEV-58 빈 항목 직접 입력·오버레이 정렬
- 사용자 승인: 항목 추가 버튼/목록 제거. 모든 빈 항목은 제자리의 연한 `내용을 입력해주세요`, 빈 섹션은 제목/장식/구분선도 흐림. 내용 입력/사진 추가 시 자동 반영, 빈 내용은 공개 제외. 눈은 섹션 머리 맨 오른쪽으로 이동.
- 범위: apps/producer/src/lib/{PageCanvas,SourceAttachments,SourceDetailsEditor}.tsx, packages/ui/src/ModuleStory.tsx, server/app/source_analysis/{service,workspace}.py, server/tests/{test_source_editor,test_product_workspace}.py, scripts/e2e/{source-analysis,source-editor,product-page-workspace}.spec.ts, 관련 spec/tasks 및 docs/spec/source-editor.md, docs/wiki/Source-Analysis.md.
- 결정: × 제외는 값 보존/흐림, 클릭 편집으로 다시 반영. 빈 항목 × 숨김. 숨김 눈은 수동 상태 유지. 첨부 텍스트/항목 ×를 첫 줄에 겹쳐 배치하고 오른쪽 공간만 확보. API/DB 필드 추가 없음. 격리 mock 영상2개 갱신, PR113 머지·배포 없음.
- [x] 구현·검증·영상·커밋 스캔

- 검증 완료: 타입4 workspace, mock13개, Ruff/diff 검사 통과. server/에서 관련 source-editor/product-workspace/source-integration/source-analysis pytest58개(13.86초), 격리 DB/API Playwright15개(1.1분) 통과. 빈 항목 입력/사진 활성화, 공백 제외, 빈 섹션 제목 흐림, 오른쪽 눈/× 정렬, 제외 후 클릭 복원·저장/공개 확인.
- scan-before-commit: 호출부·전체 diff·빈 상태/충돌 경로 검토 후 이슈 없음. 커밋 안전. 레거시 호환 점검: 신규 후보0건 — 지적0건 / 커밋된 구조0건. 기존 hiddenSectionIds 기본값은 기존 커밋의 변경 없는 동작.
- 영상2개 최신 녹화: `.artifacts/in-app-v4/page-editor-review/index.html`. 항목 추가 없이 직접 입력, 빈 섹션 흐림/오른쪽 눈/× 제외·클릭 복원, 사진 추가/제외/순서 및 저장/공개. 격리 mock만 사용, 추가 유료 호출0. 로컬 API 갱신, 실제 데모 데이터 유지. PR113 Draft/미머지/미배포. Agent 시간/Tokens 미측정.


## DEV-58 기본 정보 입력과 빈 항목 안내 (AC-SRC-11, FEAT-03/04/07)
- 범위: apps/producer/src/lib/{SourceWorkspace,SourceBasicInfo,PageCanvas}.tsx, packages/api/src/sourceAnalysis.ts, server/app/source_analysis/{schemas,service,router,editor}.py, server/tests/test_source*.py, scripts/e2e/source*.spec.ts, 관련 spec/tasks/wiki 및 로컬 검토 영상.
- 결정: 품종 필수, 사이즈·예상 당도 선택. 대상별 basicInfo JSON 저장, 기존 상품 기본값 복사, 분석 전 저장/필수 검증. 직접 편집 CONFIRMED/EXCLUDED > 기본 정보 > 추출 결과. 실측값으로 변환하지 않음. 기본 정보 저장만으로 공개 상품 변경 없음.
- 결정: 기본 정보만 변경할 때 추출 근거는 무효화하지 않으며 reviewVersion을 증가시켜 오래된 편집 저장을 막는다. 기본 정보에서 만든 미확정 제안은 변경 시 새로 만들고 직접 편집은 유지한다.
- [x] 구현·API/mock 타입·관련 문서 갱신
- [x] backend/typecheck/mock/브라우저 검증 및 headless 영상 갱신
- [x] 커밋 전 스캔, PR #113 갱신 (미머지)

- 검증: server/에서 관련 pytest 61개 통과(15.39초). npm run typecheck 4 workspace, npm run test:mock 13개, 격리 DB/API Playwright 16개(1.1분), 변경 Python Ruff 및 git diff --check 통과.
- 스캔: 기본 정보 우선순위가 오래된 사진 검증을 생략하던 경로를 보완하고, 화면 전환 후 늦은 응답/flush 참조 수명을 수정했다. 수정 후 관련 검증 통과. 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보 2건 — 지적 0건 / 커밋된 구조 2건 (SourceTarget:388d956, Batch.targets:4d7eece).
- 화면 확인: .artifacts/basic-info-390.png. 기존 영상 페이지 .artifacts/in-app-v4/page-editor-review/index.html에 기본 정보 입력부터 분석·편집·저장·공개 영상(32.68초)과 기존 상품 사진 편집(12.4초)을 갱신하고 재생 확인. headless 브라우저 종료, 추가 유료 호출 0. 기존 실제 데모 DB를 보존해 로컬 API만 갱신했다.
- PR113 Draft/미머지/미배포 유지. Agent 시간/Tokens 미측정.


## DEV-58 카드 직접 입력·대표사진 필수 (FEAT-03/04/07, AC-SRC-11)
- 범위: apps/producer/src/lib/{SourceAttachments,SourceWorkspace,SourceBasicInfo,SourceDetailsEditor,ProductPageEditor,PageCanvas}.tsx, packages/api/src/{sourceAnalysis,productWorkspace}.ts, packages/ui/src/{Icon,content}.tsx, server/app/source_analysis/{representative,service,schemas,router,publish,workspace}.py, 관련 source/workspace pytest 및 scripts/e2e 테스트, 관련 spec/tasks/wiki, 로컬 검토 영상.
- 결정: 텍스트 추가 즉시 첨부함에 카드·포커스 생성. 카드 내 편집, blur/분석 전 저장, 빈 신규 카드는 업로드하지 않음. 저장 실패 입력 유지. 기존 텍스트를 비우면 입력 또는 × 삭제 안내로 분석 차단.
- 결정: 첫 성공 상품사진을 상품별 대표로 자동 지정, × 왼쪽 별로 변경. 대표 삭제 시 다음 첫 사진으로 대체, 마지막 삭제 가능하나 새 분석/공개에 대표사진 필수. 자료 이미지는 불가. 대상/초안 JSON에 대표 ID, 기존 상품 작업 JSON에 대표 URI를 저장하며 공개 반영 시 product.photos 첫 사진과 동기화. 섹션 숨김과 별개 대표 커버 유지.
- 결정: 원본 사진 공개 경로는 상세 사진뿐 아니라 현재 상품 대표사진으로 참조되는지도 검사한다. 공용 Photo의 서버 상대 미디어 경로를 API 주소로 해석해 앱 간 동일하게 표시한다.
- [x] 구현 및 스펙 반영
- [x] backend/typecheck/mock/browser 검증·영상 갱신
- [x] 커밋 스캔; PR113/Linear에 이 기록 반영, Draft·미머지 유지

- 검증: server/에서 `DATABASE_URL=… .venv/bin/pytest -q --tb=short tests/test_source_*.py tests/test_product_workspace.py` 99 passed. `npm run typecheck` 4 workspace, `npm run test:mock` 13 passed. 격리 API/DB Playwright 4 spec 17 passed. Ruff 및 git diff --check 통과.
- 스캔: 공개 대표사진 접근 판정, 자동 지정 전 DB flush, 카드 sibling key 중복, 신규 카드 삭제/blur 경합 보완. 미해결 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보 3건 — 지적 0건 / 커밋된 구조 3건 (SourceTarget:388d956, Batch.targets:4d7eece, PageSnapshot:839503e).
- 화면: 기존 영상 페이지 `.artifacts/in-app-v4/page-editor-review/index.html` 갱신, 36.24초/12.28초 재생 확인. 카드 입력/대표사진 캡처 포함. headless 브라우저 종료, 추가 유료 호출 0. 실제 데모 DB 보존 후 로컬 API 갱신. Agent 시간/Tokens 미측정.

## DEV-58 PR113 최종 머지 리뷰 (FEAT-03/04/07, AC-SRC-9/11)
- 범위: server/app/source_analysis/workspace.py, server/tests/test_product_workspace.py, apps/producer/src/lib/ProductPageEditor.tsx, packages/api/src/productWorkspace.ts, scripts/e2e/product-page-workspace.spec.ts, 관련 spec/tasks/wiki.
- 결정: main에 없는 PageSnapshot 중간 형식 보충 분기 제거. 현재 대표사진 필드를 명시하며 비공개 저장/명시적 공개 및 권한 검사를 회귀 검증한다. 연속 사진 상태 갱신은 함수형 처리한다.
- [x] 구현·검증·리뷰 완료. 최신 CI 확인 뒤 PR113 머지 결과는 PR/Linear에 기록.

- 검증: 전체 pytest 300 passed(37.17초), typecheck 4 workspace 통과, Ruff 전체 통과, 격리 Playwright 4 spec 18 passed. 변경하지 않은 mock 계약 13 passed 결과 재사용. 마이그레이션 0008→0009→0010→0011→0012 단일 체인 확인.
- 리뷰 수정: 첫 사진 업로드의 대표 지정 덮어쓰기 수정, PageSnapshot 브랜치 전용 호환 제거, 현재 스펙 우선순위/마이그레이션 설명 정정. 새 첫 업로드·저장·재접속 및 누락/다른 상품 사진/null 대표 계약 회귀 테스트 추가. 커밋 전 스캔 이슈 없음, 신규 호환 후보 0건.
- 머지 스캔: 후보 7건 — 지적 1건(수정 완료) / 정당 6건. ProductWorkspace.snapshot은 origin/main 이력 0건(브랜치839503e→b36fe10)이라 제거. Batch.targets·Draft.snapshot·Run.inputs·Page.spans·Asset.privacy_approved는 base4d7eece, Product.detail_content는 baseb464eba에 존재해 유지. 새 사진 저장 이후 공개 참조·소유권·버전·예약/취소 경로 검토.
- 사용자 승인: Draft 해제·리뷰 수정 후 머지 명시 요청. 기존 사람 승인 병목 없이 각자 충돌 해소 후 머지하는 팀 방침에 따라 진행. Agent 시간/Tokens 미측정, 추가 유료 AI 호출 0.

## DEV-58 공개자료 후속 안정화 (FEAT-03/04/07, AC-SRC-4/5/9/10/11)
- 이슈: https://linear.app/sswp6/issue/DEV-58
- 브랜치: jinumeral/dev-58-dev-integrate-budgeted-openrouter-gemini-and-synthetic-pre
- 상태: 진행 중. 2026-10-17 사용자 계획 승인.
- 목표: 정상 문구 가림, 후보 단위 오류의 전체 전파, 자료 연락처 자동 반영을 수정한다. 숫자 OCR 한계는 별도 실험으로 측정한다.
- 범위: server/app/source_analysis/**, server/app/ai/source_analysis.py, server/migrations/versions/0013_source_diagnostics.py, server/tests/test_source*.py, packages/api/src/sourceAnalysis.ts, apps/producer/src/lib/SourceWorkspace.tsx, scripts/e2e/source-analysis.spec.ts, 관련 spec/tasks/wiki/validation 및 .artifacts 후속 평가.
- 비범위: AI CS, 운영 OCR 모델/크롭 변경, 배포, 농가 인수.
- 결정: 기존 엄격 검증은 유지하고 후보별 통과만 저장. Item PARTIAL 및 Run PARTIAL, 채택/거절 개수와 비공개 JSON 진단. 전부 거절은 FAILED. 재시도는 명시적으로만 하며 기존 후보 중복/생산자 편집 덮어쓰기 방지.
- 결정: 개인정보 라벨은 항목 경계에서 인식하고 '대표 특산물' 같은 설명 보존. 자료 전화/이메일은 자동 추출 제외, 생산자 직접 편집 허용. 처리 버전 갱신.
- 결정: 원본/첫 평가를 보존하고 동일 모델 숫자 크롭 비교와 3자료 재검증은 기존 비용 포함 $0.50 이내. 동일 자료 재사용 결과는 독립 평가로 표시하지 않음.
- [x] 구현·마이그레이션·제품 스펙/영문 위키 동기화
- [x] 무료 서버/앱/브라우저 회귀 및 마이그레이션 검증
- [x] 실제 자료 재검증·숫자 실험·보고서/영상
- [x] 커밋/브랜치 스캔·PR·Linear 기록 (최신 원격 CI 결과는 PR에 기록)
- 기록: 원격 main d4efd6d, migration head0012 확인. 기존 테스트/데모 DB 보존.

- 구현: 후보별 검증, PARTIAL 종료/명시 재시도, 동일 후보 ID 재사용, 재응답에서 누락된 확정 후보·생산자 편집 보존. source-parser-v3/source-v6-candidate-validation, migration0013.
- 무료 검증: 최종 전체 pytest324(37.93초), 최종 recovery24 통과. 타입4 workspace, mock13, 웹export2, migration head/check→0012→head/check 통과. 관련 브라우저18개 중17개 통과 후 바뀐 source-analysis3개 재실행 전부 통과(안내 문자열 선택자와 재시도 후 최신 초안 재저장 순서 수정). 기존 라이브 데모 DB/8000·8081·8082 보존.
- 실제 회귀: 기존 정답17그룹/원본 유지, 3자료 각1회. 정밀도17/18, 완전 회수14/17, 엄격 필드/값7/18·7/17. 동일 자료 재사용이므로 일반 정확도/수정 인과효과로 해석하지 않는다. 후보 충돌로 편집란이 빈 경우는 직접 보완했으며 자동 점수에 포함하지 않는다.
- 숫자 실험: 1000의 두 위치 모두 기존/문맥2배 확대가 100으로 오독. 대조군5kg(5–6과)는 양쪽 통과. 운영 OCR/크롭 변경하지 않음.
- 비용: 3자료 재검증 $0.027342 + 숫자6회 $0.007345 = 추가 $0.034687. 기존 포함 $0.060098/36호출, 미정산0, 예산$0.50 이내. 자동 재호출 없음.
- 산출물: `.artifacts/source-recovery-1017/index.html` 및 3개 편집/저장/공개 영상. 실제 자료3개 로컬 공개까지 PASS(명시적 수동 수정 후). 원본 첫 평가 보존. 배포/농가 인수 미실행. Agent 시간/Tokens 미측정.
- 잔여: 숫자 원문 검토, 같은 필드 후보 충돌 수동 조정, PDF13% 할인 누락, 농가 인수. DEV-58 전체 Done 아님.
- 커밋/브랜치 스캔: 전체 diff·새 파일·호출부·취소/비공개/예산/재시도 경로 확인. 확정 후보가 재응답에서 누락되는 사례도 추가 검증. 이슈 없음. 레거시 호환 점검: 후보1건 — 지적0건 / 정당1건(기존 source_items 진단 빈 객체 backfill, origin/main 4d7eece의 Item). 브랜치 중간 형식 호환 추가 없음.
- PR130 ready for review, ce38486 구현 push 및 AI 리뷰 코멘트 완료. Linear DEV-58에 구현/비용/실험/잔여 항목 반영, In Progress 유지. 최신 head CI 완료 여부는 PR 체크를 참조. 머지/배포 없음.

