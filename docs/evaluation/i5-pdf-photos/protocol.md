# PDF 사진 실험 프로토콜 v1 (DEV-457)

관련 FEAT-03/04/07, AC-SRC-1/2/5/7/9/11, M-11/13/18. DEV-456의 첫 offline slice다. 이 문서는 실제 사용자 사진/PII를 포함하지 않으며 앱 동작·gold·scorer·AI 모델을 변경하지 않는다.

## 목적과 동결 시점

PDF 그림을 복구해 사람이 고를 수 있는지부터 확인한다. raw image stream decode, 유용한 사진 복구, 추천 관련성, 섹션 배치, 최종 페이지 품질은 다른 지표다. 이번 첫 도구는 모델/네트워크/운영 API 호출이 없고 모든 후보는 REVIEW_REQUIRED다. 사진 추가·공개는 하지 않는다.

개발 공개자료의 기존 PDF6개만 원래 해시와 대조해 동결했다. sealed holdout은 접근하지 않는다. 전체68쪽 중 기존20쪽 상한 아래45쪽을 inventory했고23쪽은 상한 때문에 건너뛰었음을 유지한다. 최초9쪽을 이미지 객체 면적/무이미지·합성 대조 규칙으로 선택했다. 원문만 시각검토한 결과 객체면적이 큰 페이지가 연락/약관 패널일 수도 있음을 확인하여 그 negative를 유지하고 상품표지1쪽·사용자가 제기한 포장사진1쪽을 추가했다. 최종11쪽이며 어떤 후보 추출 결과/필터 성능도 보고 고르지 않았다. 최초 inventory와 수정 이유/최종 sample을 별도 해시로 보존한다.

## 유용성 기준과 분모

- 사람이 원문에서 원하는 사진 영역을 먼저 지정한다. 상품/포장/크기/농가 사진을 useful, 로고/버튼/반복 장식/연락·약관/가격 중심 패널을 unwanted, 전체 스캔·복합 배너 안 사진은 assisted, 모르는 것은 uncertain/PENDING으로 둔다. 동일 사진은 사진단위 중복관계와 모든 page occurrence를 함께 남긴다. 미추출 사진도 원문 reference에 들어가야 한다.
- 기준은 눈에 보이는 승인·가림된 페이지 픽셀이다. clip/crop 바깥·빨간/검은 덮개 아래 숨겨진 원본 픽셀을 raw stream에서 복원하면 실패다. 후보는 page render의 보이는 영역에서만 만들고 원문/source revision·sanitizationVersion·page/region/hash로 연결한다.
- recovered/total useful: 전체 in-cap useful reference 사진을 분모에 남기고 native subset도 따로 보고한다. native/assisted 구분은 실제 후보 결과 전에 source 구조로 정한다. native scope의 제안목표90%와 displayed suggestions 관련성90%는 개발 목표일 뿐 정확도예측/릴리스gate가 아니다. failed/missing/capped source와 scanned misses를 전체분모에서 빼지 않는다. zero denominator는 N/A다.
- relevance 분모는 표시한 모든 후보이며 중복으로 같은 원문사진을 여러 번 맞춰도 한 번만 credit한다. 불필요한 사진, 미매칭·틀린 상품, 실패 source의 leftover 후보는 맞는 추천으로 세지 않는다. duplicate 부담과 raw decode 성공률·해상도는 별도다.
- optional placement는 conditional accuracy>=85% AND 원래 native useful reference에 대한 coverage>=70%를 제안한다. 매칭/배치를 아예 하지 않거나 추출에 성공한 일부만 분모로 골라 통과시킬 수 없다. 섹션 대체 허용/상품·과거시점/unknown을 명시한다.
- root/worker가 만든 labels·matching은 제안이다. 실제 reviewer/date와 VERIFIED가 없으면 report는 항상 PROVISIONAL/PENDING_HUMAN_REVIEW다. 현재 사진별 source-region reference는 아직 미작성/미확인으로 두므로 이번 출력으로 accuracy/adopt를 주장하지 않는다. Jinwoo에게 전체47자료 gold검수를 요구하지 않는다.

## 고정 자원 한도

함수·CLI 계약은 [spec.md](spec.md). 20쪽/PDF, 이미지객체200/document, recursion4, 후보30/document, 입력100MiB, native40MP, page render8MP, 출력64MiB,30초, CLI child RSS512MiB, scale<=2다. caller는 상한을 낮출 수만 있다. tiny는 native 한 변64px 미만, full visible page coverage>=0.85는 composite/manual로 보수처리한다. 이 threshold가 놓친 useful 영역도 recovery miss/unsupported로 보존한다. raw native dimensions를 기록하고 업스케일하지 않는다. 잘못된 transform/nested geometry는 추측하지 않고 UNSUPPORTED로 남긴다.

기존 서비스의 source30개/100MB·product strip10장 한도는 바꾸지 않는다. 현재 도구는 production imports/storage quota에 연결되지 않으며 DEV-460에서 선택한 private derivative의 버전/쿼터/cleanup API를 구현한다.

## 재현·산출물

- private input index와 최초inventory/최종sample, 원문 page PNG, pending reference는 git 밖에만 둔다. 원본 해시를 실행 전후 확인한다. 각 source/prompt/model을 바꿔 좋은 trial을 고르지 않는다.
- 후보 생성 → portable contact sheet → strict scorer 순서로 실행하고 명령·versions·caps·전체 성공/부분/실패/skip·시간/bytes를 집계한다. 후보파일 경로/원문텍스트/이미지는 public result에 넣지 않는다.
- 실제 원문 reference와 mapping이 확인되기 전 결과는 extraction inventory와 negative-control diagnostics다. 미작성 reference를 empty-gold 정답으로 오인하지 않는다. 유용성 판단이 없으면 adopt/release 결정을 내리지 않는다.
- 실제 제품 통합/작은 실제 app-renderer 사진페이지 검토는 DEV-460/461/464의 후속이다. DEV-462 crop·DEV-463 placement는 선택사항이며 manual gallery를 막지 않는다. DEV-412/413/433 릴리스권한과 사람code리뷰는 그대로다.

## Frozen sample provenance

Before any candidate extraction, the path-free sample lock was frozen at SHA-256 `5ee91011b7037b5954300d8b5d2958bd75bfdcb67731a8104ebac4153b3e530a` (6 source PDFs, 11 selected review pages, 45 inspected pages, 23 pages outside the frozen page cap). Private source IDs, page selections and input hashes are retained in the restricted review packet. No real per-photo labels are verified yet; the empty pending reference is a template, not evidence that the PDFs contain zero useful photos.
