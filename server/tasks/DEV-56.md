## DEV-56 / DEV-57 / DEV-58 자료 기반 상세 생성 통합

- 상태: 진행 중. 사용자 2026-10-16 구현 승인. FEAT-03/04, AC-SRC-1~8.
- 브랜치: jinumeral/dev-56-dev-build-producer-source-upload-evidence-review-and-private
- 목표: 업로드→가림→근거 검토→18개 모듈 초안→명시적 상품 적용, Gemini 연결 및 가상 자료 검증.
- 범위: apps/producer/src/**, apps/consumer/src/app/**/products/**, packages/api/src/**, packages/ui/src/**, server/app/{source_analysis,ai,core,catalog}/**, server/app/main.py, packages/ui/assets/source/**, server/migrations/**, server/tests/**, server/.env.example, scripts/**, docs/spec/**, docs/wiki/**, docs/design/sales-templates/** 및 해당 폴더 spec/tasks.
- 비범위: AI CS/채팅·로그인·결제·배포. 기존 사용자 worktree 수정 금지.
- 결정: OpenRouter google/gemini-3.1-flash-lite, OCR 기본/선택 페이지 시각 분석. 고가 모델/OpenAI fallback 비활성. 평가 $1/누적 $5 영속 예약·정산. 기존 detailContent 유지, 별도 moduleDetail 및 상품 version으로 적용. 공개 사진 독립 저장.
- [x] DEV-56 업로드·개인정보·근거·재진입 UI 및 계약
- [x] DEV-57 공통 렌더러·사진 공개 복사·버전/멱등 적용
- [ ] DEV-58 제공자·예산·가상20세트·평가 및 회귀
- 완료 조건: 중요 사실/출처/개인정보 오류0, 명확한 필드95%, 테스트·타입·빌드·브라우저 통과. 실호출 미실행은 구분 기록.
- 기록: 신규 이슈 DEV-56→57→58 생성. 기존 DEV-51/53/54 정정, DEV-52 최신 단일 템플릿 진행 중.

- 범위 보충: 공통 렌더러가 사용하는 packages/ui/assets/source/** (기존 로컬 원본 일러스트와 출처 기록).

- 2026-10-16 구현/검증: 서버 전체173개 + 추가 회귀2개(신규 파일13개 통과), Ruff, 타입4개, mock12개, 실제 API7개, Chromium22개, 두 앱 웹 빌드 통과. 신규 UI는 360/390/430px에서 저장·재진입·미저장 이탈 확인·적용을 검증했다.
- 실제 Gemini 텍스트16세트 정확일치 precision/recall 1.0, 중요 오류0. 동일 고정 사례로 프롬프트를 개선한 결과이며 홀드아웃 성능이 아니다. 이미지19 추출 보류/PDF20 근거 거부로 시각 품질은 미완료; DEV-58 및 배포를 완료 처리하지 않는다. docs/spec/validation/source-integration-2026-10-16.json 참고.
- 커밋 전 수정: 독립 워커 모델 등록, CRLF 정규화, kg→개수 오분류 차단, 가림 이미지 전환/선택 표시, 미저장 편집 이탈 확인, CI 신규 E2E 활성화. 기존 디자인 worktree는 보존했고 복사본의 미커밋 v1 호환 분기만 제거했다.

### DEV-58 시각 자료 실패 수정 및 실제 자료 평가 (2026-10-16)
- 사용자 승인: 회전 이미지/PDF 실패 수정, 공개 직거래 자료 12건(이미지6/PDF3/텍스트3, 4판매처 이상), 독립 홀드아웃4건, 원본/근거/상세화면 비교. 배포·AI CS 제외.
- 범위: 위 통합 범위 내 preprocess/worker/service/models/AI adapter/evaluation, migration, 회귀 테스트, 검증 도구, 한국어 스펙·영문 Wiki. 수집 원문과 진단은 gitignored .artifacts에만 보관.
- 결정: OCR 방향 탐색·타일 분할, PDF 좌표 기반 가림·중복 제거, 전처리 버전 변경 시 source revision 갱신·가림 재승인. 근거 검증은 완화하지 않는다. 응답/오류 진단은 로컬 평가에서만 기록한다.
- 결정: 이미지/PDF 기대값을 명시하고 실패·빈 결과도 recall 분모에 포함한다. 형식별95%/중요오류0, 모호한 자료 검토필요 분리. 기존 $1 평가/$5 누적 원장과 Gemini 모델 유지.
- [x] OCR/PDF 처리 실패 재현 및 수정 (정확도 게이트는 미달)
- [x] 버전 무효화/가림/엄격한 근거 회귀
- [x] 공개자료12건 출처·정답 고정 및4건 최초 홀드아웃 평가 (재평가와 구분)
- [x] 실제3건 저장/적용 및 모바일 렌더 검토
- [x] 전체 테스트·커밋 스캔·스펙/Wiki 결과 갱신 (Linear/PR에도 반영)

- 10/16 실제 Paddle CPU 모델 RSS 약915MB, 잘못 회전된 긴 행 인식 시1.4GB 관측. 감지 박스로 방향 후보를 먼저 제한하고 인식 batch1/960px 타일을 사용한다. 프로세스 상한은 모델 작업 여유를 포함한2048MB로 명시하며120초 제한은 유지한다.
- 10/16 실제 PDF 실패 응답을 보존해 원인을 확인했다: 여러 span의 줄바꿈을 모델이 공백으로 반환한다. 동일 span 문자열의 공백 배치만 다른 경우 원문 위치로 quote를 복원한다(문자/숫자/구두점 변경은 계속 거절). 농장 소개/생산품목 라벨의 필드 매핑도 명시한다. 평가 정답은 수정하지 않는다.
- 10/16 사용자 OCR 엔진 교체 승인. Tesseract 비교는 한국어 오인식이 많아 채택하지 않는다. RapidOCR3.10.0/ONNX Runtime1.31.0 + PP-OCRv5 한국어 모델을 채택: 동일 보관 패널1.3초/RSS291MB(Paddle2GB 초과). 기존 Paddle 런타임을 교체하고 오프라인 모델 SHA 검증/네트워크 자동 다운로드 금지/1024MB·120초 상한을 유지한다. 범위에 server/pyproject.toml, server/uv.lock, server/README.md를 추가한다.

- 10/16 RapidOCR 실제 전처리 통과 후 타일 경계의 중복 문장을 발견했다. 가로 분할 대신 전체 너비의 세로 스트립(높이960/겹침128)을 인식하고, 동일 위치의 중복은 판독 면적·신뢰도로 하나만 남긴다. 최대 너비2800까지 보존한다.

- 최종 결과: RapidOCR 교체 후 실제12건 전처리/추출 성공. 텍스트100%/100%, 이미지18.75%/14.29%, PDF42.86%/37.5% precision/recall로 **시각 품질95% 기준은 미달**. 원문 정답은 수정하지 않았고 실패/빈 결과를 분모에서 제외하지 않는다. 최초 홀드아웃4건과 재평가 결과를 별도 보존한다.
- 합성 최종18실호출+2계약: 텍스트16건/PDF 정확일치 통과, 회전 이미지 문구 변형으로 실패(별도 수량 미확인 문장을 합침). 이전 통과 회차를 최종값으로 바꾸지 않는다. 프롬프트 조정 중 누락을 확인한 조건문 보존 예시를 추가했다.
- 최종 엔진 실제3건(ssarijai 텍스트/farm-citrus 이미지/farm-jun PDF)의 가림 승인→실호출→근거 확인→초안 저장→로컬 상품 적용→재조회 통과. 현재 ModuleStory로390px 렌더 확인, 가로 넘침/콘솔 오류 없음. 로컬 비교화면 `.artifacts/source-quality/real.html`, 원문·정답·응답은 ignored 비공개 파일이다.
- 검증: 전체 pytest190개, 추가 최종 집중15개, Ruff/uv lock 검사 통과. 0008 downgrade/upgrade/check 통과. 네트워크 차단 OCR 실측 최대596.8MB. 단위 테스트와 처리 성공은 생성 품질 통과를 뜻하지 않는다.
- 커밋 스캔: 중복 OCR 설치 진입점을 제거하고 기존 provision_ocr/manifest를 교체했다. 사용하지 않는 OCR confidence fallback을 제거하고 설치 안내를 동기화했다. 미커밋 중간 모델/호환 분기 없음. nullable 전처리 버전은 실제 커밋된 Asset 데이터(4d7eece)를 무효화하기 위해 필요하다.
- 남은 일: 작은 한국어 글자 오인식·필드 누락/분류·문구 변동을 개선한 뒤 새로운 독립 자료에서 검증하고 실제 농가 인수를 진행한다. DEV-58 In Progress 유지, 배포/머지 없음. Agent 시간/Tokens 미측정.

- 10/17 사용자 PR #57 머지 금지 재확인. GitHub #57 CLOSED/mergedAt=null, DEV-57 포함 #113 OPEN Draft/mergedAt=null. 현재 브랜치 커밋/push 및 검증 기록만 반영한다. 원장153건, 정산$0.096049/미정산 예약$0.191654 보존.

