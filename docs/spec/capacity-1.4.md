# 스펙 1.4 — 상품별 공급 물량 승인

2026-10-08. DEV-3/DEV-4 공통 구현 계약. 상품 승인·수량·가격은 이 문서가 1.2 계약 2·3장과 구형 승인 API를 대체한다. 나머지 인증·채팅·주문·오류·멱등 계약은 유지한다. kg은 화면 단위이며 API와 저장소는 안전한 정수 g을 사용한다. 문서 변경은 백엔드 구현 완료를 뜻하지 않는다.

## 1. 승인 범위와 상태

- 농가 가입 승인 유지. 상품 최초 신청은 공급 가능한 누적 총중량 확인이다. 필수 상품 정보·유효한 옵션과 예약 기간을 갖춰 신청한다. 공급 한도 승인 후 PUBLISHED로 공개한다.
- DRAFT/REJECTED → 최초 신청 PENDING_APPROVAL → 승인 PUBLISHED / 반려 REJECTED / 철회 DRAFT. 신청 중 편집을 막으며 철회 후 수정한다. CLOSED는 신청·재개 불가.
- PUBLISHED에서는 가격·옵션·기간·설명 수정에 운영자 재승인이 없다. 저장 즉시 신규 주문에 반영한다. 증액 신청 중에도 상품 편집·기존 한도 판매가 가능하다.
- 상품별 대기 신청은 하나. 요청량은 추가량이 아닌 변경 후 총한도이며 현재 승인량보다 커야 한다. 기존 대기 신청은 수정하지 않고 철회 후 다시 신청한다.
- 운영자는 신청량 전체 승인 또는 사유를 붙여 반려한다. 부분 승인 없음. 승인/반려/철회된 요청은 다시 처리하지 않으며 멱등 재전송만 원래 결과를 반환한다.
- 최초 승인 시 approvedSupplyGrams와 salesLimitGrams를 신청량으로 설정한다. 증액 승인은 approvedSupplyGrams만 증가시킨다. 실제 판매 한도와 salesPaused는 보존하며 농가가 별도로 확대한다.
- 공급 한도는 상품의 누적값이다. 날짜 변경·중지/재개로 초기화하지 않는다. 다음 수확 시즌은 새 상품으로 등록한다. 승인 한도 감액·농가 전체 공유 물량은 범위 밖이다.

## 2. 중량과 계산

| 필드 | 의미 |
| --- | --- |
| approvedSupplyGrams | 승인된 총 g. 최초 승인 전 0 |
| salesLimitGrams | 농가가 실제 판매에 배정한 누적 한도 g. 최초 승인 전 0 |
| reservedGrams | 결제 완료·미출하 물량에서 출하 전 취소/미공급 반환분을 뺀 g |
| shippedGrams | 이미 출하한 누적 g. 배송 완료·구매 확정·출하 후 환불 포함 |
| remainingGrams | salesLimitGrams - reservedGrams - shippedGrams |
| soldQuantity | 누적 확보 박스 수. 중량 한도 판정에 사용하지 않는다 |
| version | 상품 설정·신청·승인 시 충돌 검사 버전 |

- 모든 g은 0 이상 안전한 정수. 옵션 weightKg은 소수 셋째 자리까지 허용하며 weightGrams=weightKg×1000을 정확한 정수로 검사한다. 주문 unitWeightGrams는 생성 시 스냅샷으로 고정한다.
- 불변식: 0 ≤ reservedGrams + shippedGrams ≤ salesLimitGrams ≤ approvedSupplyGrams. 초안은 한도·집계 0이다.
- 주문 수량과 기간별 옵션 quantity/reservedCount는 박스다. 상품 카드 reservedCount는 기존대로 예약한 소비자 수이며 서로 혼용하지 않는다.
- 옵션별 최대 박스 = min(floor(remainingGrams / weightGrams), 현재 기간 옵션 잔여 박스, maxQuantityPerOrder). 한 옵션이 품절이어도 다른 옵션이 가능하면 상품은 예약 가능하다.
- availability 우선순위: 수동 중지 → 종료 → 현재 기간 없음 → 모든 현재 옵션 중량보다 잔여 g 부족(TOTAL_SOLD_OUT) → 기간별 옵션 물량 소진(PERIOD_SOLD_OUT) → AVAILABLE. 단순히 remainingGrams>0이라는 이유로 예약 가능으로 보이지 않는다.
- 미결제 주문서는 물량을 선점하지 않는다. 결제 시 원자적으로 확보하며 주문 상태·멱등 결과를 함께 저장한다. 상품 → 기간 옵션의 고정 잠금 순서를 사용한다.
- 출하 시 reserved에서 shipped로 이동하므로 사용량 합은 변하지 않는다. 출하 전 취소/부분 미공급은 해당 박스×주문 스냅샷 중량을 정확히 한 번 반환한다. 출하 후 환불은 자동 복원하지 않는다. 반환량은 주문에 releasedQuantity로 기록한다.
- 실제 창고 재고를 측정하는 기능이 아니다. UI에는 '추가 예약 가능'으로 표시한다.

## 3. 가격과 옵션

- 가격/옵션/기간은 단일 판매값을 사용한다. pendingReapproval·approvedStages·approvedOptions를 제거한다.
- 가격은 이미 예약이 있는 기간도 즉시 수정할 수 있으나 기존 결제 주문의 가격·중량·기간 ID는 바뀌지 않는다. 신규 주문은 현재 값을 사용한다.
- 미결제 주문과 비교해 기간·가격·옵션 중량이 달라졌으면 409 STAGE_CHANGED로 재확인을 요구한다. 사용자가 동의하지 않은 가격으로 결제하지 않는다.
- 예약 이력이 있는 기간의 삭제·날짜 변경, 주문에 연결된 옵션의 삭제·중량 변경은 409 PERIOD_LOCKED. 해당 기간 가격과 물량(사용량 이상)은 변경 가능하다.
- 겹치지 않는 유효 날짜, 예약 종료<배송 시작, 같은 옵션의 이른 가격<후기 가격 등 기존 검증은 유지한다. 배송 예정 변경의 주문자 동의 정책도 유지한다.

## 4. API

기존 envelope와 페이지 cursor를 유지한다. 아래 mutation에는 Idempotency-Key가 필요하다. 생산자는 승인된 자기 농가의 상품만 조회/수정하며 타 농가 자원은 404, 운영자 mutation은 ADMIN만 허용한다. 화면에 생산자용 승인 버튼을 넣지 않는다.

- MyProductCard/Detail: 중량 집계, pendingCapacityRequest(없으면 null), 최신 반려 사유 추가. 판매 상세 GET에도 같은 판매 중량을 제공한다.
- CapacityRequest = {requestId,productId,kind:INITIAL|INCREASE,requestedTotalGrams,status:PENDING|APPROVED|REJECTED|WITHDRAWN,reason,createdAt,decidedAt,version}. reason은 반려 사유(그 외 null). version은 신청 자체의 버전이다.
- POST /api/products/{productId}/capacity-requests: {requestedTotalGrams,version}; version은 상품 버전. 신청을 생성하고 상품 버전을 올리며 요청을 반환한다.
- GET /api/products/{productId}/capacity-requests?cursor=&limit=: 소유 생산자 또는 ADMIN의 신청 이력(Paged<CapacityRequest>), 최신순.
- POST /api/products/{productId}/capacity-requests/{requestId}/withdraw: {version}; 신청 버전 검사 후 철회하고 상품 버전도 올린다.
- POST /admin/products/{productId}/capacity-requests/{requestId}/approve: {version}; 신청 버전과 현재 대기 상태·소속 상품을 검사한다. 상품 잠금 안에서 최초 한도 설정 또는 증액을 적용하고 상품·신청 버전을 올린다.
- POST /admin/products/{productId}/capacity-requests/{requestId}/reject: {version,reason}; 비어 있지 않은 사유 필수. 최초 상품만 REJECTED로 전환하고 증액 반려는 기존 판매 상태·한도를 유지한다.
- PUT /api/products/{productId}/sales-settings: {salesLimitGrams,maxQuantityPerOrder,salesPaused,version}; 응답은 상품 ID·한 주문 상한·중량 집계·판매 상태·version. 초안은 salesLimitGrams=0만, 승인 상품은 사용량≤한도≤승인량. 재개 시 현재 또는 미래 기간의 판매 가능 옵션 존재 여부 검사.
- PATCH /api/products/{productId}: 편집 입력에 version 필수. 신청 중 최초 상품은 변경 불가. 승인 상품은 검증 후 즉시 반영하며 상품 version 증가.
- PUT /api/products/{productId}/stages: 기존 입력 유지, 응답 {version,stages}. 승인 사본 없음.
- 구형 POST publish-request 및 /admin/products/{productId}/approve|reject는 새 신청 API로 대체한다. 소비자/생산자 앱의 공개 경로는 변경하지 않는다.
- 오류 409 reason 추가: APPROVED_CAP_EXCEEDED, CAP_BELOW_COMMITTED, CAPACITY_REQUEST_PENDING, INVALID_TRANSITION. STALE_VERSION·PERIOD_LOCKED·STAGE_CHANGED·TOTAL_LIMIT_REACHED·SOLD_OUT 유지. 초과 요청은 400 필드 오류 또는 해당 409로 실패하며 부분 저장하지 않는다.

## 5. 화면

- 상품 필터: 판매 중 → 심사 중 → 작성 중 → 판매 중지 → 판매 종료. 심사 중은 최초 물량 심사만. 증액 심사는 기존 그룹에 '물량 추가 심사 중' 배지.
- 판매 설정: 승인 물량/현재 판매 한도/예약 중/출하 완료/추가 예약 가능(kg), 주문당 상한(박스), 중지/재개, 공급 신청·이력.
- 최초는 '공급 물량 승인 요청', 이후 '물량 추가 신청'. 신청 전 기존 승인량·추가량·신청 후 총량을 표시한다. 대기 중 철회, 반려 시 사유와 재신청을 제공한다.
- 신규 상품은 판매 한도 입력 대신 공급 신청 kg을 입력한다. 최초 신청 시 필수 항목·기간 검증. 상품·기간 편집에 '승인 전 가격 유지' 문구를 없앤다.
- 내 주문 상단 섹션은 '미확정 주문 N'. 대상은 기존 구매 확정/배송 시기 변경 응답 대기이며 각 주문에 필요한 행동은 유지한다.

## 6. 이관·검증·담당

- DEV-4: 실제 모델·마이그레이션·운영자 권한·잠금·집계 구현. DEV-3: 공통 타입/API 클라이언트·Mock·화면 구현. 실제 서버가 아직 구형 계약이면 새 화면은 Mock으로 검증한다.
- 실데이터의 박스 한도에서 승인 kg을 자동 추정하지 않는다. 공급 확인 후 확정한 상품별 승인량·판매 한도 전환표가 필요하다. 주문 스냅샷은 보존된 옵션 중량으로 복원하며 불명확하면 중단한다.
- 로컬 데모는 외부 백업 후 명시적인 상품별 g 전환표로 1회 변환한다. 기존 주문·채팅·ID·중지 상태를 보존한다. 폐기된 중간 API/저장 형식의 런타임 호환 분기는 남기지 않는다.
- AC-04-8: 최초 신청/승인/반려/철회/재신청, 증액 중 기존 판매·반려 유지·승인 한도만 증가, 한 건 대기·멱등·버전/권한 검사.
- AC-04-9: 판매 한도는 사용량~승인량 사이. 중지·재개·기간 변경으로 한도가 초기화되지 않는다.
- AC-05-6: 예약 있는 기간도 가격 즉시 반영, 기존 결제 주문 보존, 미결제 재확인. 기간/중량 잠금 유지.
- AC-09-6: 5kg×2와 10kg×1은 각각 10kg 차감. 마지막 물량 동시 결제는 한 건만 성공, 잔여 3kg은 5kg 옵션 품절. 중복 취소·부분 미공급·출하/환불 집계를 검증한다.
- AC-10-6: 미확정 주문 문구와 기존 대상·행동 유지. 타입·Mock 회귀·두 앱 웹 export·모바일 검증과 PR CI 통과.
