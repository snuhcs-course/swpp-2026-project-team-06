# apps/producer spec

> 구현하는 기능: FEAT-01, FEAT-02, FEAT-03, FEAT-04, FEAT-05, FEAT-12, FEAT-13, FEAT-14, FEAT-15, FEAT-17, FEAT-19 · 지키는 규칙: R-05, R-06, R-15, R-17, R-18, R-19, R-20, R-21, R-22, R-23, R-25, M-01, M-09, M-11, M-12, M-13, M-14, N-01, N-02, N-04, N-06
> 동작·규칙·인수 조건 원본: docs/spec/functional/ (여기에 다시 쓰지 않는다)
> 화면·경로·레이블 원본: docs/spec/ia.md 2장·4장·6장, 화면별 명세·API: docs/spec/screens.md 6장·7장, FEAT ↔ 폴더: docs/spec/tech-design/stack.md 4장

## 역할
생산자 앱(모바일 웹). Expo + Expo Router 웹 출력으로 만들고 Vercel에 정적 배포한다(ADR 0001). 로그인 SCR-19, 가입·대기 SCR-20·21, 정지 안내, 승인 후 화면 SCR-22~30을 맡는다.

## 구조
- `src/app/` — Expo Router 라우트. 파일 하나가 화면 하나다.
- 하단 탭 4개(ia.md 4장): 현황(SCR-22) · 상품(SCR-23) · 채팅(SCR-28) · 환경설정(SCR-33). `src/app/(tabs)/_layout.tsx`
- 탭 밖 화면은 루트 Stack에 둔다: 로그인, 가입 신청, 승인 대기, 정지 안내, 소식 올리기, 출하 처리.
- 승인 전 생산자는 SCR-21(승인 대기)만, 정지된 생산자는 정지 안내만, 농가 없는 생산자 계정은 SCR-20만 열린다(ia.md 6장, AC-01-3). 탭 그룹 진입 시 막는 처리는 DEV-3, 서버 검사는 DEV-4(N-06).

| SCR | 화면 | 경로 | 파일 | FEAT |
| --- | --- | --- | --- | --- |
| SCR-19 | 로그인(생산자 테스트 계정만) | `/login` | `src/app/login.tsx` | FEAT-01 |
| SCR-19 하위 | 정지 안내 | `/suspended` | `src/app/suspended.tsx` | FEAT-01 |
| SCR-20 | 가입 신청 | `/apply` | `src/app/apply.tsx` | FEAT-01 |
| SCR-21 | 승인 대기 | `/pending` | `src/app/pending.tsx` | FEAT-01 |
| SCR-22 | 현황(홈) | `/` | `src/app/(tabs)/index.tsx` | FEAT-14 |
| SCR-23 | 상품 목록 | `/products` | `src/app/(tabs)/products/index.tsx` | FEAT-04 |
| SCR-24 | AI 상품 초안 | `/products/new` | `src/app/(tabs)/products/new.tsx` | FEAT-03 |
| SCR-25 | 상품 편집 | `/products/:id/edit` | `src/app/(tabs)/products/[id]/edit.tsx` | FEAT-04 |
| SCR-26 | 예약 기간·가격 | `/products/:id/stages` | `src/app/(tabs)/products/[id]/stages.tsx` | FEAT-05 |
| SCR-27 | 소식 올리기 | `/broadcast/new` | `src/app/broadcast/new.tsx` | FEAT-12, 15 |
| SCR-28 | 채팅 목록 | `/chats` | `src/app/(tabs)/chats/index.tsx` | FEAT-12, 13 |
| SCR-28 하위 | 소비자별 채팅 | `/chats/:consumerId` | `src/app/(tabs)/chats/[consumerId].tsx` | FEAT-13 |
| SCR-29 | 출하 처리 | `/ship` | `src/app/ship.tsx` | FEAT-17 |
| SCR-30 | 농가 프로필·링크 | `/farm` | `src/app/(tabs)/farm/index.tsx` | FEAT-02, 19 |
| SCR-30 하위 | 프로필 항목 고치기 | `/farm/edit/:field` | `src/app/(tabs)/farm/edit/[field].tsx` | FEAT-02 |

| SCR-33 | 환경설정 | `/settings` | `src/app/(tabs)/settings.tsx` | FEAT-02, 13 |
| SCR-28 하위 | 농가 소식방 | `/news/:farmId` | `src/app/news/[farmId].tsx` | FEAT-12 |

## 계약
- 공용 컴포넌트·토큰은 `@farmclub/ui`(packages/ui), 서버 호출은 `@farmclub/api`(packages/api)만 쓴다.
- 서버 주소는 `EXPO_PUBLIC_API_URL`(packages/api spec).
- 환경설정 → 농가 프로필에서 복사하는 링크는 서버의 `/s/farms/<id>`다(ADR 0006). 소비자 앱 주소를 직접 복사하지 않는다.
- I1 로그인은 생산자 테스트 계정 선택(`GET /api/auth/test-accounts?app=producer`, `POST /api/auth/test-login`의 `app: producer`, ADR 0009·0010). 시드 생산자는 승인·확인 중·반려·정지·농가 없음 5명(tech-design 시드 데이터). 소비자 계정은 이 앱에 로그인하지 않고, 403 `WRONG_APP`이면 토큰을 지우고 로그인으로. 가입 신청(SCR-20)이 생산자 계정 만들기를 겸한다. 카카오 리다이렉트 `/auth/kakao`는 I2.
- 출하 처리(SCR-29)는 주문을 여러 건 골라 ‘n건 출하로 바꾸기’ → 주문마다 `POST /api/orders/{orderId}/ship`(`carrier`, `trackingNumber`)을 반복한다(새 일괄 API 없음). 생산자는 배송 완료로 바꾸지 못한다(R-19). 자연어 입력은 I2.
- 화면 모양·크기·문구는 Figma v6/UI 1.6이 기준이다(주요 버튼 56, 현황 숫자 40, 목록 줄 최소 56).
- 쓰는 API는 screens.md 7.2.

## 구현 결정 이력 (현재 화면은 DEV-51 절 우선)
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | 라우트는 `src/app/`, 탭 화면은 `(tabs)` 그룹(상품 탭은 Stack). 로그인·가입·대기·소식 올리기·출하 처리는 탭 밖 루트 Stack | ia.md 2장 경로와 4장 탭 구성을 함께 지킴 | — |
| 2026-10-07 | 웹 출력은 `web.output: "single"`(SPA). Vercel rewrite는 DEV-8 | 정적 호스팅, 동적 경로 | — |
| 2026-10-07 | Expo는 SDK마다 바뀌므로 docs.expo.dev의 버전별 문서를 확인하고, 패키지는 반드시 `npx expo install`로 추가한다 | create-expo-app이 만든 AGENTS.md 규칙을 루트 AGENTS.md 하나로 합치며 옮김 | — |
| 2026-10-07 | DEV-12의 화면은 `Placeholder`로 "SCR-xx 화면 이름 · FEAT-xx"만 보여준다. 승인 전 잠금은 아직 없음 | 뼈대 이슈, 기능은 DEV-3·DEV-4 | AC-01-3 |
| 2026-10-07 | SCR-27 레이블을 ‘소식 올리기’로, SCR-29는 상태 변경 + 송장(자연어 I2), 로그인은 테스트 계정 | P22 결정(SWPP-26) | AC-17-2, AC-17-4 |
| 2026-10-07 | 로그인을 SCR-19(생산자 계정만)로, `/suspended`·`/questions/:escalationId`·`/farm/edit/:field` 하위 화면, 현황의 출하 처리 버튼 대신 할 일, 여러 건 출하와 택배사 | SWPP-81(screens.md 1.1, ADR 0010) | AC-01-3, AC-01-6, AC-17-2 |


## DEV-3 로컬 이식 결정 (2026-10-07)

ZIP의 SCR-19~30과 상태별 진입 제어, 질문함·농가 하위 경로를 이식했다. 루트 npm run dev로 Mock 로컬 실행하며 소비자 링크는 로컬 주소를 따른다.

기존 구현 결정 표의 DEV-12 뼈대 설명은 과거 기록이며 현재 구현은 이 절을 따른다.


DEV-3: 현황·농가 소식 FAB은 /broadcast를 연다. 본인 farmId의 NewsRoom에 모든 답장을 표시하며 입력은 전체 방송이다. /broadcast/new는 첨부·공개 범위 작성용으로 유지한다.

## DEV-3 스펙 1.2 구현 기준

PR #38의 contracts-1.2.md와 디자인 README를 따른다. 판매 설정/날짜 기간의 버전·멱등 키와 권한을 공유 Mock까지 구현한다. 공용 대화 UI에 API 함수를 주입하고 활성 화면만 polling한다. 구형 로컬 중간 구조의 호환 API는 남기지 않는다.


## DEV-3 화면 구조 1.3 (변경 이력)

이전 탭/로컬 이식 기록은 변경 이력이다. PR #39의 navigation-1.3.md를 따른다. 소비자 발견/내 주문/채팅/내 정보, 생산자 현황/상품/채팅/환경설정. 주문은 `/orders`, 채팅 목록은 소식방/1:1 선택을 유지하며 활성 화면만 갱신한다. 앱 공통 메신저 행/헤더는 API를 직접 호출하지 않는다. 전체 cursor 수집은 취소·실패·반복 cursor를 처리한다. 새 API/DB 계약은 없다.


## DEV-3 공급 물량 승인 1.4 (현재 구현 기준)

제품·API 기준은 main에 먼저 머지한 PR #40의 `docs/spec/capacity-1.4.md`이며 위 1.2/1.3 기록에서 충돌하는 결정은 대체한다. 상품별 kg 입력을 정수 g로 전달하고 승인량과 판매 한도를 구분한다. 최초 승인만 상품을 공개하고 증액 심사 중에는 기존 판매를 유지한다. 가격은 신규 주문부터 즉시 반영하며 기존 결제 중량·가격 스냅샷은 보존한다(AC-04-8/9, AC-05-6, AC-09-6). 요청 버전과 멱등 키는 동일 본문 재시도에서 유지한다.

Mock 스키마 7은 단일 판매값·capacityRequests·주문 unitWeightGrams/releasedQuantity를 사용한다. 예전 승인 복제값·publish-request·박스 총 한도·런타임 마이그레이션은 제거한다. 로컬 공유 서버와 독립 브라우저 저장소를 지원하며 실제 서버는 DEV-4 범위다. 로그인 변경 시 탭 상태를 새로 만들고 비동기 이전 응답을 폐기한다.

소비자 주문 문구는 미확정 주문, 생산자 상품 그룹은 판매 중/심사 중/작성 중/판매 중지/판매 종료다. 배송 기간 변경은 미출하 결제 주문의 동의·환불 선택을 보존한다(R-21). 일반 상품 변경·가격 변경에 재승인을 요구하지 않는다.

## DEV-3 상세·공개 소식방 구현 (1.5)
명세 PR #44의 storefront-1.5.md를 따른다. 상세는 text/image 블록과 공유 DetailStory 렌더러를 사용하며 생성은 저장 전 편집안이다. 기존 intro/description은 실제 기존 데이터의 기본 소개로 유지한다. 소식방 공개 읽기와 답장 권한을 분리하고 권한 변경 후 이전 비동기 메시지를 폐기한다. 실제 AI 호출은 구현하지 않으며 Mock임을 명시한다.

## DEV-51 현재 프론트 구현 기준 (1.6)

제품 동작은 `docs/spec/conversation-ui-1.6.md` 및 관련 FEAT를 따른다. 이전 DEV-3/1.3/1.5 화면 배치는 변경 이력이며 API 계약만 유지한다. Figma 현재 시안 v6가 시각 기준이다.
OwnNewsRoom을 채팅 탭 본문에 유지하고 비활성 때 polling을 끈다. 기본 news, 품목 접힘. 현황은 전체 cursor 주문 건수 및 대표 상품 kg를 분리한다. ship은 RESERVED 조회만, PREPARING 송장/출하만 제공한다. 수확 시작 호출은 없다.


## I2 생산자 오류 복구 (DEV-29/34/38)

SCR-24는 초안·상품 생성 요청을 하나씩 수행하고 빈 문자열·빈 배열을 확인 필요로 취급한다. SCR-25는 원산지·보관 필수값도 현재 폼에서 검사한다. SCR-30은 Web Share 취소와 실패를 구분하고 실패 시 기존 복사 경로를 사용한다. SCR-29는 출하 중 확인/선택을 잠그고 기존 데이터가 있어도 갱신 오류와 재시도를 표시한다. 농가 조회/수정 응답의 shareUrl은 실제 서버 공유 페이지의 절대 주소다. 나머지 서버 계약 변경 없음.

## DEV-56/57/58 integration

Current contract: docs/spec/source-integration.md, AC-SRC-1~10. SourceWorkspace uses the sourceAnalysis client and shared ModuleStory renderer. Product moduleDetail is separate from legacy detailContent. OpenRouter Gemini and persistent budget accounting are source-analysis-only.

## DEV-58 초기 입력 보존

세션 확인이 완료된 뒤에 Tabs를 표시한다. 사용자 식별 전 입력 화면을 열면 userId key 변경으로 화면이 다시 만들어져 초기 문구가 사라질 수 있다. 기존 사용자 변경 시 상태 초기화는 유지한다(AC-03-3, AC-SRC-5).

DEV-58: 가림 승인 전에 이미지/PDF 전체 가림 페이지가 AI 문자인식에 전송됨을 안내한다. OpenRouter Gemini OCR 모드의 기본 문자 인식과 선택적 시각 분석 설정을 구분한다. 저장·상품 적용·공개 계약은 유지한다.

DEV-58 자료 작업 UI: 공용 토큰의 20px 좌우 여백·16px 카드·64px 썸네일·최소48px 터치를 따른다. 작업 중 탭 위 스피너와 “분석 중이에요”를 표시하고 개인정보 승인 대기는 별도 안내한다. 업로드 직후 이미지는 로컬 object URL, 전처리 후 이미지/PDF는 인증된 가림 첫 쪽으로 표시한다. TXT·준비 전 PDF·미리보기 실패는 파일 형식 타일을 사용한다. 로컬 URL은 삭제/작업 전환/화면 종료 시 해제한다. 연결·삭제·추가 시각 설정과 문구 입력은 펼쳐보기에 보존하며 기존 저장/적용 계약은 유지한다.

DEV-58 새 상품 진입: /products/new에서 새 비공개 상품과 연결된 자료 작업을 만들고 업로드 화면으로 바로 이동한다. 이전 문구/직접 입력은 /products/manual에 유지한다. 상품 생성 응답이 확인된 경우 같은 상품·작업 멱등 키로 재시도하며 불확실하면 상품 목록 확인을 안내한다. 자료 화면에서 상품 정보·판매 설정으로 이동한다. Mock 전용 환경은 자료 API가 없어 manual을 사용한다.
상품 목록의 별도 자료로 상세 만들기 버튼은 제거하며 새 상품 버튼을 단일 신규 진입으로 사용한다. 기존 상품의 저장 작업 편집 진입은 유지한다.

### 상품별 판매페이지 수정 (DEV-58, 2026-10-17)
- 상품 목록의 `판매페이지 수정`은 해당 상품의 비공개 수정본을 연다. 없으면 현재 `moduleDetail` 또는 `detailContent`를 사진 URI/문구 그대로 보존하여 시작한다. 원본 자료가 없어도 수정할 수 있다.
- `수정본 저장`은 공개 내용을 변경하지 않는다. `상품에 반영` 확인 후에만 상품 상세가 변경된다. 판매 중인 상품은 구매자 페이지에 즉시 반영되며, 초안/심사 상태는 바꾸지 않는다.
- 상품 버전이 바뀌면 적용을 거절한다. 수정본을 자동 폐기하지 않고, 사용자가 명시적으로 현재 상품 불러오기를 선택해야 폐기한다. 저장하지 않은 입력에는 이탈 확인을 표시한다.
- 새 상품은 상품+연결 자료 작업을 한 트랜잭션으로 생성한다. 멱등 키 재시도로 응답 유실 시 중복 생성하지 않는다.
- API: POST `/api/source-analysis/product-workspaces` (선택 productId), PUT `/{productId}` (version/snapshot), POST `/{productId}/apply` (version). 초기화는 POST의 discardChanges/version으로 명시한다. 승인 농가 소유권·상품/수정본 버전·사진 소유 참조를 검증한다.
- 생산자 4탭은 유지한다. 공통 좌우20px/카드16px/카드반경16px/터치48px 규격을 사용한다. AI 채팅 기능은 이번 변경 범위에서 제외한다.

### DEV-58 통합 편집
AC-SRC-11: review.editorFields 자동 채움 제안, PUT /batches/:bid/editor 원자 저장. 자동 제안은 UNREVIEWED/EXTRACTED로 보존하며 개별 확정 없이 유효한 ON 항목만 previewModules에 포함한다. 기존 API와 저장 데이터는 유지한다. OFF 내용은 복원 가능하며 오래된 OFF 근거는 공개 검증에서 제외한다. UI는 자료/상세 편집 2탭, 카드별 스위치/직접 편집/접히는 원문.

- DEV-58 상세 편집 스위치: 공통 SectionSwitch의 눈/눈 감김 아이콘, 44px 터치 영역. switch 역할과 checked/disabled 상태, 웹 Space/Enter 조작을 유지한다.

- DEV-58: see docs/spec/source-editor.md for the approved two-box input, description-only placement, and in-page editor contract. Source assets retain their existing role flag; description revisions are independent of image revisions.

- DEV-58 편집 조작: 텍스트 카드 본문 클릭 편집/×·설명 inline 저장, 점선 사진 추가 칸, 눈 아이콘만 제공(별도 접기 제거). 설명 저장 완료 후 최신 batch 버전으로 분석을 시작한다. 별도 접힘 상태 없이 섹션 hiddenSectionIds와 항목 enabled를 사용한다. 상세 계약은 docs/spec/source-editor.md.

- DEV-58 / AC-SRC-11: 큰 섹션 숨김은 `hiddenSectionIds` JSON 목록으로 저장하고 하위 항목의 `enabled`와 분리한다. 미리보기/공개 및 활성 근거 검증은 두 상태를 함께 적용한다. 기존 저장본은 빈 목록 기본값. UI는 큰 제목 줄 오른쪽 눈, 항목/사진 우측 상단 ×와 제자리 편집 복원, 연한 placeholder. 상세 계약은 docs/spec/source-editor.md.

- DEV-58 / AC-SRC-11: 빈 항목은 연한 동일 placeholder로 항상 편집 가능하며 입력/사진 추가 시 활성화한다. 항목 추가 메뉴 제거, 공백을 포함한 빈 내용은 공개에서 제외. 빈 섹션 제목 흐림, 눈은 수동 숨김 상태 유지.

- DEV-58: 상품명/소개 문구는 편집·미리보기·공개에서 같은 중앙 정렬/글꼴 스타일을 사용하며 오른쪽 조작부에 의해 중심이 이동하지 않는다. 나머지 본문 정렬은 기존 디자인 유지. 사진 추가 제안 버튼/목록 제거; 수동 사진 추가는 유지.

- DEV-58 / AC-SRC-11 기본 정보: 대상별 basicInfo(variety/size/expectedBrix)를 JSON에 보관하며 PUT /source-analysis/batches/:bid/basic-info로 버전 검사 후 저장한다. 기존 상품은 품종·info.size·예상 당도만 초기값으로 복사한다. 새 분석에는 품종 필수, 나머지는 선택. 직접 확정한 상세 문구/삭제 > 기본 정보 > 추출 제안 우선순위. 기존 작업 열람과 직접 편집은 허용하고 공개 상품은 명시적 반영 전 변경하지 않는다. 입력 blur 및 분석 전 flush, 실패 시 입력 보존. 편집에 빈 내용 구매자 비노출 안내를 표시한다.

- DEV-58 / AC-SRC-11: 자료 텍스트는 첨부 카드 안에서 생성·수정하고 blur/분석 전 저장한다. 대표사진은 대상별 representativeAssetId와 비공개 스냅샷에 저장하며 첫 성공 상품사진 자동 선택/별 지정/삭제 시 다음 사진 대체를 지원한다. 분석 및 공개 반영 시 유효한 상품사진 필수. product workspace는 representativeUri를 저장하며 기존 상품 대표를 초기값으로 사용한다. 대표 커버는 숨긴 섹션과 독립적이며 공개 반영 시 product.photos 첫 사진과 동기화한다. 공용 Photo는 /api/source-media 상대 경로를 API 주소로 해석한다.

DEV-58 PR113 최종 리뷰: 상품 편집 snapshot은 대표 URI/null을 명시하며 연속 대표 지정·사진 배치는 함수형 상태 갱신으로 모두 유지한다. 중간 PageSnapshot 형태의 런타임 호환 분기는 제공하지 않는다.
