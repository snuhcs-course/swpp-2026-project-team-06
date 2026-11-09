# packages/ui spec

## DEV-251 메시지 anchor 복원
- 소비자 route가 방의 권한을 새로 확인한 뒤 `initialPage`와 선택 `viewState`(농가·실제 thread ID·metadata snapshot·save callback)를 전달한다. 이를 쓰지 않는 생산자/운영 문의 호출자는 기존 계약을 유지한다.
- 복원은 locating → layout → restored로 진행하고, 실패/사용자 중단을 구별한다. 저장된 anchor와 가장 오래 불러온 ID까지 fresh cursor를 따라가며 순번 병합한다. 반복 cursor/중복만 반환하는 중간 페이지는 오류와 재시도로 끝낸다.
- 실제 행 높이 + content padding/gap 20 + 이전 페이지 버튼 높이의 prefix sum으로 top을 계산한다. RN-web ResizeObserver의 오래된 y를 쓰지 않는다. signed offset으로 복원하고, 삭제된 anchor는 저장된 visible neighbor → 같은 허가된 window의 clamped offset 순으로 대체한다.
- 역사 위치 복원이 끝나기 전 최신 자동 스크롤·읽음을 막는다. 사진/문구 높이 변화는 restore anchor를 유지하고 wheel/touch/drag/key/최신 이동이 이를 중단한다. RN-web의 같은 offset scroll-end tick은 새 사용자 제스처로 취급하지 않는다.
- snapshot은 행 ID·geometry·loaded boundary·unseen 상태만 내보낸다. 메시지/URL/입력/첨부/전송 key는 store에 쓰지 않는다. 활성 세대와 방 identity가 바뀌면 늦은 요청을 버린다. 401/403/404는 보호된 메시지를 지우고 route에 알린다.
- polling 성공은 미해결 전송의 오류/다시 보내기/멱등 key를 지우지 않는다. DEV-248 전송 문맥 분리와 DEV-205 앱 키보드 여백을 유지한다.

## DEV-248 대화 초기 페이지와 재시도
ChatThread는 선택 initialPage로 권한 확인한 첫 페이지를 받고 sendScope(농가/주문/상품)를 멱등 본문 식별에 포함한다. 문맥 변경 때 이전 사진/요청 callback을 버린다. composerEnabled가 거짓이면 전송/사진을 막고, 401/403/404 조회 실패는 polling을 멈춰 onAccessDenied에 알린다. 전송 재시도와 조회 재시도를 구별한다. 미사용 호출자의 기본 계약과 DEV-205 키보드 여백을 유지한다.

## DEV-250 비공개 읽기 위치
- chatViewState.ts는 React/API/인증 부작용 없는 geometry/ID 전용 계약과 bounded store를 제공한다. 메시지 본문·사진 URL·토큰은 보관하지 않는다.
- 세션 generation과 대화별 lease로 늦은 callback을 무효화한다. 최대 20개, idle 30분, LRU. signed anchor offset은 부분 노출 메시지에 필요하다.
- 실제 권한 확인과 화면 연결은 DEV-252, pagination/layout 복원은 DEV-251에서 수행한다(AC-12-9, N-05).

> 구현하는 기능: 공용(두 앱의 모든 SCR) · 지키는 규칙: N-01, N-02
> 레이블 원본: docs/spec/ia.md 4장 "레이블", 문구 원본: docs/spec/policy.md (여기에 다시 쓰지 않는다)

## 역할
소비자 앱·생산자 앱이 함께 쓰는 컴포넌트와 디자인 토큰. 패키지 이름은 `@farmclub/ui`.

## 구조
- `src/tokens.ts` — 글자 크기·누르는 영역·간격·색. 값의 원본은 `docs/design/README.md` 토큰 표다. N-02 하한(본문 16px 이상, 누르는 영역 48px 이상)을 지킨다.
- `src/Button.tsx` — 기본 버튼. 높이·너비 최소 48px.
- `src/Placeholder.tsx` — 뼈대 화면용. "SCR-xx 화면 이름 · FEAT-xx"를 보여준다. 기능 화면이 생기면 쓰지 않는다.
- `src/index.ts` — 공개 export.

## 계약
- 앱은 `import { Button, Placeholder, tokens } from "@farmclub/ui"`로만 쓴다. 내부 파일 경로를 직접 import하지 않는다.
- 글자 단계는 본문 17, 입력 16, 보조 15, 메타(날짜·칩·탭·시각) 13, 본문·채팅 17(1.6). 누를 수 있는 요소는 `tokens.touchTarget.min`(48) 이상이고, 보이는 크기가 작으면 여백·hitSlop으로 넓힌다(N-02).
- 간격은 4 단위(4·8·12·16·20·24·32·40) 토큰만 쓴다. 썸네일은 104·64·40, 메신저 원형 프로필은 목록 48·헤더 40·설정 64를 쓴다(디자인 1.3). 사진이 없거나 로딩에 실패하면 이니셜을 표시한다.
- 글꼴은 Pretendard 가변 웹폰트(한글 서브셋)를 첫 순위로, `color-scheme: light`, PC는 최대 폭 480 가운데 정렬, 위·아래는 안전 영역을 더한다.
- 부품 상태: 버튼 눌림·로딩·비활성, 입력 포커스·비활성·오류, 키보드 포커스 링, 팔로우 토글, 토스트(성공·공통 오류). 현재 규격은 UI 1.6과 `tokens.ts`; `docs/design/screens/ds.html`은 이전 기록이다.
- 탭·버튼·상태 이름은 ia.md 4장 레이블을 쓴다(예: ‘예약하기’, ‘품절’, ‘받는 시기’). 쓰지 않는 말(구매하기, 매진 등)은 쓰지 않는다.
- `react`, `react-native`는 peerDependencies. 앱이 가진 버전을 쓴다.

## 구현 결정 이력 (현재 화면은 DEV-51 절 우선)
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | 빌드 없이 TS 소스(`src/index.ts`)를 `main`으로 둔다 | Metro가 워크스페이스 TS를 바로 번들, 설정 최소 | — |
| 2026-10-07 | 나머지 수치(색·간격·제목 크기)는 화면 명세(P21)가 정하면 `tokens.ts`만 고친다 | N-02는 하한만 정함 | — |
| 2026-10-07 | 토큰을 확정 디자인(`docs/design/README.md`)에 맞춘다: 메타 15, 누르는 영역 48, 4 단위 간격, 썸네일 3종, Pretendard, 부품 상태 | SWPP-81(screens.md 1.1 결정 35, 디자인 평가) | — |


## DEV-3 로컬 이식 결정 (2026-10-07)

ZIP 공통 UI(텍스트·아이콘·입력·바·시트·카드·말풍선·포맷)를 공개 export로 제공한다. react-native-svg는 peer dependency이며 단독 typecheck를 제공한다.

기존 구현 결정 표의 DEV-12 뼈대 설명은 과거 기록이며 현재 구현은 이 절을 따른다.


NewsRoom은 API 주입형 공용 UI다. 최신 페이지 polling과 과거 페이지를 messageId로 합치고, 스크롤 하단 여부에 따라 자동 이동/새 소식 버튼을 선택한다. 작성 실패 시 멱등 키와 글을 유지한다. 미디어는 웹 video controls 또는 Photo로 렌더링한다.

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
Storefront의 Price/ProductShelf/NewsCard/FeedCarousel/ChatChoices/BrandHeader는 API 없는 표현 컴포넌트다. 제목 28/36, 메타 13/18, 탭 72, 터치 48. ProductShelf의 local state로 전송/접기에서 대화를 재마운트하지 않는다. NewsRoom은 producer 시스템 안내를 본문에 두고 소비자 안내를 제거한다.

## DEV-56/57/58 integration

Current contract: docs/spec/source-integration.md, AC-SRC-1~10. SourceWorkspace uses the sourceAnalysis client and shared ModuleStory renderer. Product moduleDetail is separate from legacy detailContent. OpenRouter Gemini and persistent budget accounting are source-analysis-only.

## DEV-57 단일 상세 템플릿 시각 통합

`ModuleStory`는 DEV-52 최종 `docs/design/sales-templates/all-sections.*`의 상품 표지, 구역 묶음, 제목·본문 크기와 손 위 일러스트를 사용한다. 후속 사용자 결정으로 농가 소식을 포함한36px 제목 아이콘8종과 이미지 배경을 적용한다. 작은 제목은 텍스트로 유지한다. 18개 모듈의 저장 계약은 유지하고 구매자 순서의9개 구역으로 표시한다. 빈 구역·공백뿐인 문구는 숨긴다. 생산자 PageCanvas의 구매자 화면 미리보기와 소비자 moduleDetail은 같은 ModuleStory 컴포넌트를 사용한다.

원문 텍스트는 줄바꿈·숫자·기호를 보존한다. 작업실의 예시/자리 표시·원산지/품종 기본값·공정 순서를 추가하지 않는다. 설명 없는 공정 장식3종은 표시하지 않는다. 공개 사진은 SourcePhoto/StoryImage로 원본 비율을 유지하며 웹에서는 기존 종이 프레임(9% 분할/14px border-image)을 사진 밖에 표시한다. 네이티브는 기존 사진 렌더러를 유지한다. 크림색 사진 배경은 제거한다. 손 크기 비교는 섹션 여백 밖까지 확장한 전체 폭에 버튼과 같은 accent #C94F0C 및 ImageGen 벡터형 주황 배경을 적용한다. 안쪽24px/상하64px 여백에 그림과 기준 손 길이를 함께 배치하고 글자는 흰색으로 표시한다. 실제 상품 사진과 설명용 일러스트를 구분하며 후자에만 기준 손18cm/비교용 가정을 표시한다.


## DEV-57 당도계 일러스트
`brix-meter.png`는 사용자 지정 당도계 형태에 기존 귤·냉장고·선별 아이콘의 채색 종이 질감을 적용한 일러스트다. 크림·세이지·귤색을 공유한다. 최종 생성 프롬프트와 참조 경로는 자산 옆에 기록한다.
`BrixReading`은 API 실측값이 null이 아닐 때 당도계 장식을280×280 영역 중앙에 크게 표시하고 실제 값/측정일을 아래 중앙에 배치한다. 그림·값·날짜 전체에 버튼 accent #C94F0C/상하96px의 전체 폭 배경과 ImageGen 벡터형 주황 배경을 적용한다. 글자는 흰색이다. 공통 IllustrationBackdrop은 흰 바탕에 생성 원본100%를 stretch로 표시해 위아래 경계를 보존하며 접근성 트리/터치를 방해하지 않는다. 0을 예상값으로 대체하지 않으며 날짜 미등록은 명시한다. 실측값이 없으면 배경과 그림 없이 기존 예상값/대기 안내 행을 유지한다. 그림 자체에는 숫자나 인증 표시가 없다.

손·실측 당도 강조 영역은 이미지 자체의 매끈한 주황 곡선·투명 경계로 본문 배경과 연결한다. 손3종 내부는 흰색이고 바깥 알파는 유지한다. 하단 일러스트 설명은 제거하며 손 옆 비교용 가정은 유지한다. 선택한 과일 사이즈(소과/중과/대과) 및 실측 당도 숫자는40px/48px bold이다. 기준 손 길이18cm와 비교용 가정은13px/20px, 당도 제목·날짜는17px/26px 흰색이다. 실측은 제목/값/날짜로 분리하고 미측정 안내는 유지한다.

실측 당도 영역은 투명 곡선과 그림·날짜가 겹치지 않도록 상하96px 여백을 확보한다. 손 비교 영역은64px를 유지한다.

- DEV-58 / AC-SRC-11: 자료 텍스트는 첨부 카드 안에서 생성·수정하고 blur/분석 전 저장한다. 대표사진은 대상별 representativeAssetId와 비공개 스냅샷에 저장하며 첫 성공 상품사진 자동 선택/별 지정/삭제 시 다음 사진 대체를 지원한다. 분석 및 공개 반영 시 유효한 상품사진 필수. product workspace는 representativeUri를 저장하며 기존 상품 대표를 초기값으로 사용한다. 대표 커버는 숨긴 섹션과 독립적이며 공개 반영 시 product.photos 첫 사진과 동기화한다. 공용 Photo는 /api/source-media 상대 경로를 API 주소로 해석한다.


## DEV-85 승인 로고 배치 (2026-10-19)

원본 PNG 4종은 `assets/brand/`에 보존하며 실제 렌더링은 `BrandLogo`의 wordmark/icon/full 세 형태를 사용한다. 소비자 홈은 글자형, 생산자 현황은 아이콘형(36×40, 좌우 12, 제목 간격 12), 생산자 로그인은 상단 글자형 없이 안내 제목 오른쪽 조합형이다. 로그인 제목은 사용자 승인 예외 30/32px semibold, 조합형은 172×129px와 x=-16/y=-10px의 광학 정렬을 쓴다. 320px 등 더 좁은 화면에서는 로고를 비율대로 축소해 제목 공간을 확보한다. 원본을 자르거나 변형하지 않는다.

`BrandHeader.logo`는 홈에서 wordmark/icon을 명시한다. DEV-287부터 다른 헤더와 사진 빈 상태도 승인된 로고를 사용한다. 흑백은 두 줄 조합형의 grayscale(1) 파생 PNG로 표시한다. 카카오/테스트 로그인 선택·계정 상태·버튼·라우팅 계약은 변경하지 않는다. 승인된 정적 검토 페이지는 `docs/design/brand-review/`에 보존한다.

## DEV-113 약관·처리방침·사업자 정보 (2026-10-22)

| 결정 | 이유 |
| --- | --- |
| 문안은 `src/legalContent.ts` 한 곳(지울 수 있는 타입만, import 없음). `LegalFooter`·`LegalDocument`(`src/Legal.tsx`)와 `scripts/legal-pages.mjs`(Node type stripping으로 직접 import)가 같이 쓴다 | SPA라 JS 없이 읽히는 정적 HTML이 따로 필요하고, 두 벌로 쓰면 문안이 어긋난다 |
| 사업자 정보는 `EXPO_PUBLIC_BUSINESS_{NAME,OWNER,REGISTRATION_NO,MAIL_ORDER_NO,ADDRESS,PHONE,EMAIL}`·`EXPO_PUBLIC_PRIVACY_OFFICER`에서 읽고, 값 있는 항목만 그린다. 하나도 없으면 ‘farmclub · 테스트 서비스’ | 값은 레포에 쓰지 않는다(AGENTS.md). policy.md 6장 |
| `LegalFooter`는 링크를 직접 열지 않고 `onOpen(path)`로 앱 라우터에 맡긴다 | ui 패키지는 expo-router에 의존하지 않는다 |
| 파일 이름은 `Legal.tsx`와 `legalContent.ts`. `legal.ts`는 macOS(대소문자 무시)에서 `Legal.tsx`와 충돌한다 | TS1149 |
| (DEV-116) 푸터는 `<Scroll footer={<LegalFooter … />}>` 슬롯으로 둔다. footer가 있으면 내용 컨테이너를 `flexGrow: 1`로 늘리고 footer를 `marginTop: 'auto'` + 위 여백 section(40)으로 붙인다 | 내용 바로 뒤에 두면 짧은 화면(카카오 운영 로그인)에서 푸터가 화면 중간에 뜬다. flexGrow는 footer가 있을 때만 켜 다른 화면에 영향이 없다 |
| (DEV-116) 고정 하단 바가 있는 로그인은 바 높이를 `onLayout`으로 재서 `Scroll bottom`으로 쓴다 | 바 높이가 상태(카카오 버튼만·테스트 계정 버튼·오류 문구)마다 달라 고정값이면 푸터와 바 사이가 빈다 |
| (DEV-122) `LEGAL_VERSION`(동의 버전)과 `PRIVACY_EFFECTIVE`(시행일)를 따로 둔다. 동의를 받아 처리하는 항목이 바뀔 때만 버전을 올리고, 근거·고지 문구만 바뀌면 시행일과 변경 기록만 고친다. `test-legal.mjs`는 버전 날짜가 변경 기록에 있고 시행일보다 늦지 않은지, 시행일이 더 늦으면 마지막 변경 기록이 ‘다시 동의를 받지 않습니다’를 적는지 본다 | 버전을 올리면 생산자 앱 전체가 재동의 전까지 막힌다(#251/DEV-124). 법상 재동의는 동의 근거 항목이 바뀔 때만 필요하다(개인정보 보호법 제15조 제2항 후단, 제28조의8 제3항) |
## DEV-33 네이티브 분기 (ADR 0013)

- 화면 숨김 판단은 `src/foreground.ts`의 `inBackground()`(`AppState`; 웹에서는 `document.visibilityState`를 비춘다). `ChatThread`·`NewsRoom`·`useLiveList`가 쓴다.
- 비공개 사진 첨부(`PrivatePhotos`)는 웹 `<input type="file">`, 앱은 `src/pickPhoto.native.ts`(`expo-image-picker`)의 ‘사진 첨부’ 버튼. `upload`는 `File | PickedPhoto({uri, name, type, size})`.

## 팔로우 해제 뒤 소식방 (DEV-230, 2026-11-05)
- `Toast`에 `action`(라벨·동작)을 더했다. 행동 버튼이 있으면 오류 토스트처럼 4초. `onRetry`는 ‘다시 시도’ action과 같다.
- `FollowButton`의 `quiet`: 팔로우를 끊은 예전 팔로워의 소식방 헤더에서 강조색 대신 검정 테두리.
- `NewsRoom`은 `canReply=false`인데 본인 답장이 보이면 예전 팔로워로 본다(서버 새 필드 없음, AC-15-8). 이때 띠(`room-lapsed-banner`, `onRefollow`), 본인 답장 45%(`room-dimmed-reply`), 잠긴 입력(`room-locked-input`)을 그리고 `onLapsedChange`로 알린다(불러온 뒤에만).

## DEV-235/213 채팅 표시
모든 메시지에 sequence가 있으면 저장 순서로 정렬한다. 구 API 응답이 섞여 순번이 빠진 경우 전체를 시각순으로 정렬하고 동시각은 입력 순서를 유지한다. 무작위 messageId로 순서를 정하지 않는다. 전달 메시지는 내부 근거 요약을 표시하지 않는다.

## Android 앱 키보드·하단 인셋 (DEV-205, 2026-11-05)
- 두 앱 루트는 `KeyboardRoot`(`src/keyboard.tsx`)로 Stack을 감싼다. Android만 `KeyboardAvoidingView behavior="padding"`, 웹·iOS는 children 그대로(감싸는 View 없음). app.json `softwareKeyboardLayoutMode`는 쓰지 않는다: Android 15+ edge-to-edge에서 adjustResize가 창을 줄이지 않고, 네이티브 설정은 새 빌드가 필요하다.
- Android에서 키보드가 떠 있는 동안 `TabBar`·`BottomBar`는 그리지 않는다(`useKeyboardShown`). 루트가 올라가면 absolute 하단 바가 키보드 위에 떠 입력칸을 가린다.
- `ChatThread` 입력창 아래 여백은 앱에서만 하단 안전 영역을 더한다(키보드가 떠 있으면 뺀다). 웹은 20 그대로.


### DEV-289
인용 답장과 서버 기준 10분 직접 응대 계약은 FEAT-12·13 DEV-289 절을 따른다. 전체 AI 설정의 다른 정책 필드는 보존하고 폴링은 설정 버전을 역행시키지 않는다. 주문 문의 접수의 별도 직접 응대는 일반 타이머와 구분한다.

DEV-289 사용자 후속: 답장은 말풍선 옆 20px 인용 답장 아이콘(44px 터치 영역), 답장 취소는 × 아이콘으로 표시한다. 전체 AI 전환은 생산자 채팅 헤더의 24px 반짝이 아이콘으로 옮기고 ON은 주황색·상태점, OFF는 회색·사선으로 구분한다. 접근성 이름·동작은 유지한다. 대기 상태는 활성화된 경우에만 별도 짧은 문구로 표시한다.

DEV-289 최종 사용자 지시: 헤더 AI 아이콘+하단 AI 답변 ON/OFF, 메시지 답장·수정은 우클릭/길게 누르기 메뉴로만 제공. 본인 메시지 텍스트 수정, 하단 이탤릭 수정됨. Modal 키보드·외부 클릭은 web.ts 플랫폼 도우미로 처리한다.

소식방 생산자 메뉴 답장은 익명 인용 방송 composer를 열고, 1:1 채팅은 별도 private route를 연다. 인용 대상+본문이 같은 실패 재시도는 같은 idempotency key를 쓴다. 전송 확인에서 인용과 전체 팔로워 범위를 함께 보여주며 취소 시 발송하지 않는다.

## DEV-295 버블 채팅 구현 결정

화면 기준은 `docs/spec/conversation-ui-1.6.md` ‘버블 채팅 모양’. 숫자는 토큰을 쓰고, 새 고정값은 Figma의 아바타 36·입력줄 40뿐이다.
- 채팅 목록 탭은 `Messenger.tsx`의 `ChatTabs`(밑줄 탭 + 건수, 접근성 이름은 탭 이름만). `Storefront.tsx`의 `ChatChoices`·`ProductShelf`는 다른 화면이 쓸 수 있어 지우지 않고, 채팅·소식방은 `ChatTabs`·`NewsRoom.tsx`의 `RoomShelf`(한 줄 접힘, local state)를 쓴다.
- 묶음 계산은 순수 함수 `chatGroups.ts`(같은 보낸 사람·한국 날짜·분). `ChatBubble`은 `first`/`last`/`avatar`/`side`/`footer`로 아바타·이름·시각·읽음·하트·확인 요청을 그린다.
- 1:1 행은 위 간격(4/16)을 자기 높이에 담고 `chatRowGeometry(..., gap = 0)`로 보기 상태 복원 계산을 맞춘다. 시스템 문구도 첫 행 안에 둔다.
- `composer.tsx`: 1:1·소식방 공용 입력줄(40/40/40, 터치 48), 떠 있는 알약, 도구 칩, `copyToClipboard`(앱이 넘긴 expo-clipboard 도우미 우선, 없으면 웹 클립보드). ui 패키지에 의존성을 더하지 않는다.
- 사진 전체 화면은 `ViewablePhoto`/`PhotoViewer`(RN Modal). 누르는 칸을 사진 위 형제로 겹쳐 사진의 img 역할을 보조기술에 남긴다.
- `KeyboardRoot`·`useKeyboardShown`은 iOS·Android 공통(iOS는 will 이벤트). 웹은 그대로.
