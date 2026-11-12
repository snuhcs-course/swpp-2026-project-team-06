# apps/producer spec

> 구현하는 기능: FEAT-01, FEAT-02, FEAT-03, FEAT-04, FEAT-05, FEAT-12, FEAT-13, FEAT-14, FEAT-15, FEAT-17, FEAT-19 · 지키는 규칙: R-05, R-06, R-15, R-17, R-18, R-19, R-20, R-21, R-22, R-23, R-25, M-01, M-09, M-11, M-12, M-13, M-14, N-01, N-02, N-04, N-06
> 동작·규칙·인수 조건 원본: docs/spec/functional/ (여기에 다시 쓰지 않는다)
> 화면·경로·레이블 원본: docs/spec/ia.md 2장·4장·6장, 화면별 명세·API: docs/spec/screens.md 6장·7장, FEAT ↔ 폴더: docs/spec/tech-design/stack.md 4장

## 역할
생산자 앱(모바일 웹). Expo + Expo Router 웹 출력으로 만들고 Vercel에 정적 배포한다(ADR 0001). 로그인 SCR-19, 가입·대기 SCR-20·21, 정지 안내, 승인 후 화면 SCR-22~30을 맡는다.

## 구조
- `src/app/` — Expo Router 라우트. 파일 하나가 화면 하나다.
- 하단 탭 4개(ia.md 4장): 현황(SCR-22) · 상품(SCR-23) · 채팅(SCR-28) · 설정(SCR-33, DEV-294에서 ‘환경설정’ → ‘설정’). `src/app/(tabs)/_layout.tsx`
- 탭 밖 화면은 루트 Stack에 둔다: 로그인, 가입 신청, 승인 대기, 정지 안내, 소식 올리기, 출하 처리.
- 승인 전 생산자는 SCR-21(승인 대기)만, 정지된 생산자는 정지 안내만, 농가 없는 생산자 계정은 SCR-20만 열린다(ia.md 6장, AC-01-3). 탭 그룹 진입 시 막는 처리는 DEV-3, 서버 검사는 DEV-4(N-06).

| SCR | 화면 | 경로 | 파일 | FEAT |
| --- | --- | --- | --- | --- |
| SCR-19 | 로그인(생산자 테스트 계정만) | `/login` | `src/app/login.tsx` | FEAT-01 |
| SCR-19 하위 | 정지 안내 | `/suspended` | `src/app/suspended.tsx` | FEAT-01 |
| SCR-20 | 가입 신청 | `/apply` | `src/app/apply.tsx` | FEAT-01 |
| SCR-21 | 승인 대기 | `/pending` | `src/app/pending.tsx` | FEAT-01 |
| SCR-22 | 현황(홈) | `/` | `src/app/(tabs)/index.tsx` | FEAT-14 |
| SCR-22a | 원산지 표시제도 안내 | `/origin-notice` | `src/app/origin-notice.tsx` (원산지 칸 도움말 `src/lib/OriginFieldHint.tsx`) | 원산지표시법 제6조 ⑥, DEV-121 |
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

| SCR-33 | 설정 | `/settings` | `src/app/(tabs)/settings.tsx` | FEAT-02, 13 |
| SCR-28 하위 | 농가 소식방 | `/news/:farmId` | `src/app/news/[farmId].tsx` | FEAT-12 |

## 계약
- 공용 컴포넌트·토큰은 `@farmclub/ui`(packages/ui), 서버 호출은 `@farmclub/api`(packages/api)만 쓴다.
- 서버 주소는 `EXPO_PUBLIC_API_URL`(packages/api spec).
- 환경설정 → 농가 프로필에서 복사하는 링크는 서버의 `/s/farms/<id>`다(ADR 0006). 소비자 앱 주소를 직접 복사하지 않는다.
- I1 로그인은 생산자 테스트 계정 선택(`GET /api/auth/test-accounts?app=producer`, `POST /api/auth/test-login`의 `app: producer`, ADR 0009·0010). 시드 생산자는 승인·확인 중·반려·정지·농가 없음 5명(tech-design 시드 데이터). 소비자 계정은 이 앱에 로그인하지 않고, 403 `WRONG_APP`이면 토큰을 지우고 로그인으로. 가입 신청(SCR-20)이 생산자 계정 만들기를 겸한다. 카카오 리다이렉트 `/auth/kakao`는 I2.
- 출하 처리(SCR-29)는 주문을 여러 건 골라 ‘n건 선택 · 출하 처리’(DEV-294) → 주문마다 `POST /api/orders/{orderId}/ship`(`carrier`, `trackingNumber`)을 반복한다(새 일괄 API 없음). 생산자는 배송 완료로 바꾸지 못한다(R-19). 자연어 입력은 I2.
- 화면 모양·크기·문구는 Figma v6/UI 1.6이 기준이다(목록 줄 최소 56). DEV-294부터 현황·배송 현황과 생산자 문구는 Figma 검토본 `TEN0IqovZJenoRqSIma3wL`(기준표, 1:62, 1:74, 11:133)을 따르고, 크기는 숫자 대신 `tokens.*`를 써서 토큰 개편(DEV-293)을 따라간다.
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
OwnNewsRoom을 채팅 탭 본문에 유지하고 비활성 때 polling을 끈다. 기본 news, 품목 접힘. 현황은 전체 cursor 주문 건수 및 대표 상품 판매량(DEV-300부터 옵션별 박스, kg은 보조)을 분리한다. ship은 RESERVED 조회만(맨 위 ‘수확 시작하기’ 줄은 예약 기간 카드로 이동), PREPARING 송장/출하만 제공한다. 수확 시작은 예약 기간 화면(`stages.tsx` + `lib/HarvestStart.tsx`)에서 기간 단위로 호출한다(DEV-231). 저장 안 한 값이 있으면 막아 폼과 섞이지 않게 한다.


## I2 생산자 오류 복구 (DEV-29/34/38)

SCR-24는 초안·상품 생성 요청을 하나씩 수행하고 빈 문자열·빈 배열을 확인 필요로 취급한다. SCR-25는 원산지·보관 필수값도 현재 폼에서 검사한다. SCR-30은 Web Share 취소와 실패를 구분하고 실패 시 기존 복사 경로를 사용한다. SCR-29는 출하 중 확인/선택을 잠그고 기존 데이터가 있어도 갱신 오류와 재시도를 표시한다. 농가 조회/수정 응답의 shareUrl은 실제 서버 공유 페이지의 절대 주소다. 나머지 서버 계약 변경 없음.

## DEV-56/57/58 integration

Current contract: docs/spec/source-integration.md, AC-SRC-1~10. SourceWorkspace uses the sourceAnalysis client and shared ModuleStory renderer. Product moduleDetail is separate from legacy detailContent. OpenRouter Gemini and persistent budget accounting are source-analysis-only.

## DEV-58 초기 입력 보존

세션 확인이 완료된 뒤에 Tabs를 표시한다. 사용자 식별 전 입력 화면을 열면 userId key 변경으로 화면이 다시 만들어져 초기 문구가 사라질 수 있다. 기존 사용자 변경 시 상태 초기화는 유지한다(AC-03-3, AC-SRC-5).

DEV-58 현재 계약: 개인정보는 업로드 전에 직접 제거한다. 새 자료는 가림 승인 대기 없이 기본 OCR/Gemini 문자 인식으로 분석하며, 비공개 원본/버전과 기존 가림본 보존을 유지한다. 상품사진 원본은 분석하지 않고 설명만 분류한다. 저장·상품 적용·공개 계약은 유지한다.

DEV-58 자료 작업 UI: 공용 토큰의 20px 좌우 여백·16px 카드·64px 썸네일·최소48px 터치를 따른다. 작업 중 탭 위 스피너와 “분석 중이에요”를 표시하고 과거 개인정보 승인 대기 작업은 취소 후 재분석을 안내한다. 업로드 직후 이미지는 로컬 object URL, 전처리 후 이미지/PDF는 인증된 가림 첫 쪽으로 표시한다. TXT·준비 전 PDF·미리보기 실패는 파일 형식 타일을 사용한다. 로컬 URL은 삭제/작업 전환/화면 종료 시 해제한다. 연결·삭제·추가 시각 설정과 문구 입력은 펼쳐보기에 보존하며 기존 저장/적용 계약은 유지한다.

DEV-58 새 상품 진입: /products/new에서 새 비공개 상품과 연결된 자료 작업을 만들고 업로드 화면으로 바로 이동한다. 이전 문구/직접 입력은 /products/manual에 유지한다. 상품 생성 응답이 확인된 경우 같은 상품·작업 멱등 키로 재시도하며 불확실하면 상품 목록 확인을 안내한다. (DEV-184부터) 새 상품은 두 장이다. ① `composer=1` 채우기(`NewProductComposer`: 구매자 상품 페이지 모양, 빈 칸만 점선, 하단 AI 시트) → '다음: 판매·가격'에서 판매 전(DRAFT/REJECTED) 상품은 확인 없이 상세 반영 → ② `/products/:id/sell`(옵션·받는 시기·가격·배송비·물량 → 구매자 화면 미리보기 → 판매 시작 요청, 운영자 승인 대기). 그 밖의 상태는 확인 후 상품 편집(SCR-25). 그 밖의 자료 작업은 기존 `SourceWorkspace`. Mock 전용 환경은 자료 API가 없어 manual을 사용한다.
DEV-84 자료 분석이 꺼진 환경의 복구 경로(운영은 DEV-90에서 활성화): 진입 시 `GET /api/source-analysis/config`의 `enabled`를 먼저 본다. false면 `/products/new` → `/products/manual`, 판매페이지 수정(`ProductPageEditor`) → 기존 `DetailEditor`. 조회 실패는 오류와 다시 시도로 두고 다른 경로로 추측해 보내지 않는다(404는 상품 없음과 구분되지 않아 신호로 쓰지 않음).
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

## DEV-74 카카오 로그인 (SCR-19 · `/auth/kakao`)

카카오 설정(`enabled`, `clientId`, `redirectPath`)은 서버 `GET /api/auth/kakao/config`에서 받는다. 카카오 버튼 → `lib/kakao.ts`가 `state` 일회용 값을 sessionStorage(`farmclub-producer:kakao-return`)에 두고 인가 화면으로 보낸다 → `/auth/kakao`가 `state`를 대조해 `POST /api/auth/kakao`(`app: producer`) → `refresh()`. 갈 화면은 세션 관문(`homeFor`)이 농가 상태로 정한다(없음 → `/apply`, 확인 중·반려 → `/pending`, 승인 → `/`, 정지 → `/suspended`). 비로그인 관문은 `/login`과 `/auth/kakao`만 연다. 실서버에서 카카오가 켜져 있으면 테스트 계정 목록을 숨기고, Mock은 상태별 시연 계정 때문에 함께 둔다. 생산자는 소비자 온보딩을 거치지 않는다(가입 신청이 대표자 이름·연락처를 받음).

DEV-108: 관문은 `lib/gate.ts`의 `homeFor`. 로그인된 사용자는 농가 상태와 상관없이 `/login`·`/auth/kakao`에 머물지 않는다. `/auth/kakao`는 로그인 뒤 `homeFor(user).home`으로 직접 `router.replace`하고(관문과 같은 목적지), `state`가 없거나 달라도 토큰이 있으면(새로고침) `refresh()` 뒤 같은 곳으로 간다. 로그인+사용자 조회는 15초 제한, 넘으면 오류와 ‘다시 로그인’. 화면은 가운데 `ActivityIndicator` + ‘카카오 로그인 중이에요’ 한 줄.


## DEV-92 첨부 전 수동 입력 저장 순서

SourceWorkspace가 SourceBasicInfo의 flush를 SourceAttachments에 주입한다. 새 파일 및 새 텍스트 업로드는 기본 정보 저장(진행 중 blur 및 마지막 입력 포함)을 기다린 뒤 최신 batch.version을 조회한다. 저장 실패 시 업로드를 보내지 않고 파일/텍스트와 수동 입력을 보존해 명시적 재시도를 허용한다. 직접 편집 > 기본 정보 > AI 제안 우선순위와 다른 편집자 충돌 보호는 유지한다(AC-SRC-1/5/11).


## DEV-179 구현 결정 (2026-11-02)
FEAT-04/07/08/09/17 · AC-SRC-2/3/5/9/11 · AC-09-8. 제품 계약은 source-editor.md DEV-179 참조.
- Composer의 단일 basicInfo 훅을 화면과 AI 시트 footer가 공유한다. 품종은 footer에서 입력하며 저장/flush 구현을 중복하지 않는다. 시작 오류는 별도 상태로 footer/시작 버튼 옆에 둔다.
- PageCanvas의 preview는 같은 현재 modules/hiddenSectionIds를 공용 ModuleStory에 전달한다. 상단 고정 토글은 탐색이나 저장을 발생시키지 않는다. SourceDetailsEditor의 상태를 유지한다.
- SourceRunProgress는 현재 run item의 단계/상태와 가용 페이지 수만 사용한다. OCR 실패는 ocrFailedPageNumbers, 청크 실패는 chunkFailedPageNumbers를 별도 안내하며 재시도 확인은 새 작업 성공 후 초기화한다.
- 제외 모달 확인은 userId·batchId·targetId·refinementVersion으로 localStorage에 보존하며 저장소 불가 시 모듈 메모리로 대체한다. 확인 버튼을 눌러야 기록한다.
- 입금 확인은 기존 Sheet/서버 API를 사용하며 주문 총액은 기존 ProducerOrder.totalAmount를 표시한다. SHIPPED 송장 수정은 기존 시트에 현재 값을 불러와 orders.updateTracking으로 저장한다. trackingVersion과 동일 본문 재시도의 멱등 키를 유지하고 서버 감사 이력은 UI에서 표시하지 않는다(AC-17-9). Figma DEV-185.

- DEV-179 리뷰 보완: AI 시작은 자료 0개일 때만 자료 부족 사유로 비활성화한다(기존 busy/active 보호 유지). 구매자 preview subName/brix 슬롯은 undefined로 넘겨 ProductPageBody/BrixReading을 사용하고, run 진행은 시트 또는 본문 한 곳에만 렌더한다. 제외 확인은 사용자·batch·target별 마지막 버전을 덮어쓰고 커밋된 구 sessionStorage `farmclub-producer:excluded-seen:${batchId}:${version}`만 로그인 사용자 확인 후 한 번 읽고 제거한다. 사용자 정보가 없으면 이관하지 않는다.

- DEV-179 최종 리뷰 보완: Composer의 BasicInfo 래퍼는 batch 로딩 전후 유지하고 key는 URL batchId를 사용한다. 공용 기본 정보 훅은 null batch에서 빈 입력/저장 없음으로 시작해 로드 후 입력을 동기화한다. 로드로 Screen 하위 트리를 remount하지 않는다(AC-SRC-11).

- DEV-179 데모 후속: `sourceFeedback.ts`가 Composer의 representativePhoto 사유 매핑과 재조회 가능 여부(입력 검증 400만 숨김, 409·네트워크·서버 오류는 유지)를 공용으로 처리한다. Workspace 적용 거절 사유는 별도 applyError로 적용 확인 패널에만 한 번 표시한다. DEV-287부터 재시도 확인 UI는 단일 버튼으로 대체한다. 분석 중 상세 영역은 실제 진행 패널만 사용하고 중복 Skeleton은 두지 않는다(최초 상품 로딩 Skeleton은 유지).

## DEV-33 EAS 네이티브 빌드 (ADR 0013)

- 식별자 `kr.farmclub.producer`, 스킴 `farmclub-producer`, 복귀 주소 `https://farm.farmclub.kr/auth/kakao`(서버 값 그대로). 설정·흐름은 소비자 앱과 같다(`apps/consumer/spec.md` DEV-33 절). `lib/kakao.ts`(웹)는 state만 sessionStorage, `lib/kakao.native.ts`는 메모리. 복귀 화면은 농가 상태별 첫 화면으로 간다(DEV-108과 같음).
- 사진·영상: 웹 `lib/pick.ts`(`<input type="file">`, 600px 축소), 앱 `lib/pick.native.ts`(`expo-image-picker`, quality 0.8, `{uri,name,type}` 업로드). 원본 자료 첨부 `lib/sourceFiles.native.ts`는 사진만(PDF·텍스트는 웹 전용).
- `beforeunload` 경고(상세 편집·상품 페이지·원본 작업실)는 웹에서만 건다. 복사는 `expo-clipboard`.

## DEV-237 HE source recovery
SourceAttachments reports whether a new text card contains non-whitespace input separately from general unsaved edits. Composer/workspace start eligibility includes this signal and keeps the existing flush-before-start transaction order. Composer renders action errors beside the collapsed footer and inside the expanded sheet; initial load errors without a batch remain in the page. No API or persistence change.

## 도움말 투어 앱 표시 (DEV-206, 2026-11-05)
- `Tour.tsx`의 겹치기 레이어는 웹 `position: fixed`, 앱 `position: absolute`(앱 루트 기준). 앱에는 fixed가 없어 relative로 처리되면 본문을 민다.
- 앱 카드 위치는 `useSafeAreaInsets` 위·아래 인셋 안쪽. 웹은 인셋 0.
- 대상 위치 측정은 웹 DOM 전용이다. 앱은 대상 단계를 곧바로 가운데 카드 + '다음'으로 보여 주고, 단계 설명을 그대로 쓴다(`docs/spec/screens.md` "공통: 도움말" 앱 줄).

DEV-287: 상품 편집은 최종 구매자 배치에서 제자리 수정하며, 입력 영역은 항상 주황색 면/테두리로 표시한다. 미리보기·AI 초안·가이드 아이콘에 문구를 표시한다. summary 저장 필드는 상품 소개에 묶어 표시하고 별도 추가 버튼을 두지 않는다. 대표사진 버튼은 사진 선택기를 열고 준비된 사진 없이는 다음으로 이동하지 않는다. 분석하지 않은 사진도 수동 초안을 반영한다. 측정 당도 한 칸으로 입력하고 기존 두 API 값은 수정/삭제 시 동기화한다. 품종은 AI 초안과 같은 상태를 쓴다. 앱 내 뒤로 가기는 저장 성공 후 토스트와 함께 이동하고 실패하면 입력을 유지한다. 재시도 비용 체크박스는 제거하고 3초 클릭 제한과 서버 실행/멱등성 보호를 유지한다.


### DEV-289
인용 답장과 서버 기준 10분 직접 응대 계약은 FEAT-12·13 DEV-289 절을 따른다. 전체 AI 설정의 다른 정책 필드는 보존하고 폴링은 설정 버전을 역행시키지 않는다. 주문 문의 접수의 별도 직접 응대는 일반 타이머와 구분한다.

## DEV-294 생산자 화면 개편 (2026-11-09)

Figma 검토본(PM 11/09 승인)대로 현황·배송 현황·투어·문구를 고쳤다. 동작·API 계약은 바꾸지 않았다. 화면 서술은 screens.md SCR-22·29·도움말 절.
- 크기는 `tokens.*`(gutter·listRowProducer·touchTarget·heading 등)로 쓴다. 토큰에 아직 없는 기준표 값(작은 버튼 32, 썸네일 48, 진행 막대 6, accent 옅은 배경 `#FDECE2`)만 숫자로 둔다. 작은 버튼·칩은 hitSlop으로 누르는 영역 48.
- 현황(`(tabs)/index.tsx`): 화면 안 머리(기존 `BrandLogo` 아이콘형 + 제목 ‘현황’(title) + `HelpButton`, 높이 56·세로 가운데, 아래 ‘농가명 · 날짜’). 로고는 PM 11/09 결정으로 유지한다. 할 일 줄은 화면 안 `TodoRow`(56, 오른쪽 accent 건수·‘필수’ 태그·chevron). ‘답하지 않은 문의’는 대시보드 `todo.openQuestions` → `/chats?view=private`. 물량 줄은 DEV-300부터 옵션별 박스(아래 DEV-300 절)이고 kg 합계는 보조 글자, 썸네일은 `catalog.mine`의 대표 사진.
- 배송 현황(`ship.tsx`): 공용 `Segmented` 대신 화면 안 밑줄 탭(ScrollView). 상품 줄은 `lib/orderWho.ts` `orderItem`이 상품명 끝 옵션 목록 중 이 주문 옵션이 든 목록만 뗀다(`scripts/test-producer-order-rows.mjs`). 시트·읽기 라벨은 `orderWho` 전체 글자 그대로(AC-17-10). 전체 탭 상태 칩은 `ORDER_STATUS`.
- 투어(`lib/Tour.tsx`): `HelpButton`은 props 없이 버튼으로만 시작한다. 본 적 있음 기록(`help-guide-seen`)은 더 쓰지 않는다. 마지막 단계는 AC-34-5 때문에 farmclub 대화방 안내 한 문장을 남긴다.
- Mock 전용 문구는 `isMock`일 때만 보인다(로그인 카카오 설명 등).

## DEV-296 AI 답변 확인 요청 깃발
- 현황 할 일 ‘AI 답변 확인 요청 n건’은 대시보드 `todo.aiCheckRequests` → `/chats?view=private&checks=1`. ‘필수’ 줄 아래, ‘답하지 않은 문의’ 바로 위.
- 1:1 목록(`(tabs)/chats/index.tsx`): 요약 `aiCheckRequests` 합이 있으면 맨 위 띠(`aiCheckBanner`), 누르면 `checks=1` 파라미터로 확인 요청 대화만. 줄 태그는 `ConversationRow` `tag`. 거른 채 확인 요청이 0이 되면(있다가 없어지면) `checks`를 지워 새 요청이 와도 저절로 다시 걸러지지 않는다.
- 대화방(`[consumerId].tsx`)은 `ChatThread` `confirmCheck`로 `messaging.confirmAiAnswer`를 넘긴다(farmclub 문의 방 제외).
- 채팅 탭 배지(`(tabs)/_layout.tsx`)는 안 읽음 + 확인 요청 수.

## DEV-300 옵션별 가격·박스 판매 현황 (2026-11-10)

농가 피드백(11/10)으로 현황·상품 목록·물량·판매 설정의 판매량을 중량 옵션마다 박스로 보이고, 11/10 생산자 인터뷰: 옵션별 가격·박스가 주, kg 총량은 보조다. 옵션 줄은 `lib/OptionBoxRow.tsx` 하나(‘5kg  32,000원   24박스 / 72박스’)를 세 화면이 같이 쓴다. 화면 서술은 screens.md SCR-22·23·물량·판매 설정, AC-14-3.
- 계산은 `lib/optionBoxes.ts` 순수 함수(`scripts/test-producer-option-boxes.mjs`). 옵션마다 모든 기간의 `reservedCount`(대시보드는 `reserved`)와 `quantity`를 더한다. 옵션끼리는 더하지 않는다(공유 물량 이중 계산, DEV-292). 박스 수는 예약+출하 한 숫자(출하해도 줄지 않는 값)라 예약 중/출하 완료로 나누지 않는다. 가격은 지금 판매 기간의 박스당 가격이고 없으면 null(줄에서 비움).
- 출처별 함수: 상품 화면 `optionBoxesFromProduct(options, stages, p.currentStageId)`(서버가 고른 지금 판매 기간. 브라우저 Mock은 `X-Server-Time`이 없어 기기 날짜를 쓰면 Mock 기준일과 어긋나므로 앱에서 날짜로 고르지 않는다), 목록 카드 `optionBoxesFromCard(card.options)`(서버가 합·가격을 계산), 현황 `optionBoxesFromDashboard(stages)`(`current` 기간의 `price`, 서버 orders 변경 없음).
- 순서: 상품 화면·카드는 상품 옵션 순서(값 없는 옵션은 0박스), 현황은 대시보드 기간을 앞에서부터 읽어 처음 나온 순서(서버가 값 없는 옵션은 빼고 준다).
- 현황: 상품 줄 오른쪽 kg은 caption(12) 회색 ‘총 Nkg / Mkg’(두 숫자 모두 단위, 11/10 DEV-296), 옵션 줄(sub 14, 가격·박스 semibold)마다 4px 막대. 대시보드 `stages`가 비면 예전 kg 줄과 6px 막대.
- 상품 목록: `GET /api/products/mine` 카드의 `options`를 바로 쓴다(카드마다 상세를 읽던 N+1 제거). 옵션이 없으면 예전 kg 줄. ‘승인 · 추가 예약 가능 kg’ 줄은 caption(12) 회색 보조.
- 물량·판매 설정: 요약 상자 안 옵션 표(body 16, ‘옵션 · 박스당 가격’ / ‘예약+출하 / 판매’, 줄마다 role group 읽기 라벨) 아래 kg 항목을 sub(14) 보조로. kg 항목은 판매 한도 입력과 짝이라 유지.

## DEV-312 PostHog 생산자 이벤트 (2026-11-12)
이벤트 이름·속성·파일럿 지표 원본은 트래킹 플랜(`docs/spec/tech-design/README.md` "트래킹 플랜"·"파일럿 지표"), 허용 목록·enum은 `packages/analytics/src/privacy.ts`. 기록은 `tasks/DEV-312.md`.
- 화면은 `track`만 부른다. 연결·서버·409 실패(`isServerTrouble`)는 오류 안내로 세지 않는다. 단 생산자가 고칠 409(판매 한도 거절 APPROVED_CAP_EXCEEDED·CAP_BELOW_COMMITTED → quantity_invalid, 입금 계좌 없음 NO_FARM_ACCOUNT → deposit_account_required)는 센다. 속성은 ID·enum·불리언·ms만이고, 오류 코드·초안 결과·답장 종류는 `src/lib/producerEvents.ts` 순수 함수가 만든다(메시지·사유·송장 번호를 받지 않음). 판매·가격 서버 칸 별칭 표(`SELL_FIELD_GROUPS`)도 여기 한 곳에 두고 `sell.tsx` 칸 강조가 같이 쓴다.
- 새 상품: `NewProductComposer`(flow source)는 상품마다 열림 한 번, 이 화면에서 받아들여진 run(`api.start`·`api.retry` 응답 id)이 끝난 상태로 바뀔 때만 `draft_created`. 처음 불러온 이미 끝난 run은 보내지 않는다. `manual.tsx`(flow text)는 `createDraft` 응답 뒤 입력 검증 오류가 아니면 요청·끝을 함께 보낸다.
- 행동 이벤트는 서버 성공 응답 뒤(출하 전 송장은 화면 저장 뒤). `ship.tsx`의 `act`는 성공 콜백(`onDone`)으로 입금 승인·미승인만 보내고 환불 분기는 보내지 않는다. 출하는 성공한 주문마다 `order_shipped`.
- 채팅: 불러온 메시지의 보낸 쪽·확인 요청 상태·시각만 기억해(본문 없음) 보내기 전 `replyKind`를 정한다. 서버가 인용한 메시지로만 전달을 닫으므로 인용 대상으로 나눈다(인용한 소비자 질문과 같은 시각의 열린 전달이 있으면 forwarded, 서버가 질문과 전달을 같은 시각으로 저장). farmclub 문의방, 답장 수정은 보내지 않는다.
