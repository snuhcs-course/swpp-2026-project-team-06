> **1.2 적용 상태**: `screens/*.html`과 기존 캔버스는 1.1 스냅샷이다. 아래 ‘스펙 1.2 레이아웃’이 변경 화면의 구현 기준이며 HTML·실제 프론트 갱신은 후속 DEV-3 PR에서 한다.

# farmclub 화면 디자인 (I1)

확정일 2026-10-07, 디자인 평가 반영. 원본은 Claude Design 캔버스 "farmclub 디자인"이고, 이 폴더는 그 캔버스를 정적 HTML로 내보낸 사본이다. 디자인의 기준은 이 폴더이며, 화면·문구·크기는 여기를 따르고 동작·API는 [screens.md](../spec/screens.md)를 따른다. 둘이 다르면 아래 "스펙과 다른 점"이 우선한다.

- `screens/*.html` — 프레임 하나가 파일 하나다. 브라우저로 열면 390×844 기준으로 보인다. 세로로 긴 화면은 프레임을 늘려 그렸다.
- `assets/` — 예시 사진(Unsplash 무료 라이선스, 자리 표시용). 실서비스에는 농가 사진을 쓴다.
- 시트 화면은 뒤 배경으로 기본 화면을, 흐름도·PC 화면은 각 화면을 `iframe`으로 불러온다.
- 글꼴 Pretendard는 jsDelivr CDN의 가변 웹폰트를 불러온다(인터넷 연결이 없으면 기기 글꼴로 보인다).

## 디자인 토큰

| 구분 | 값 |
| --- | --- |
| 글꼴 | `"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`. Pretendard 가변 웹폰트(한글 서브셋)를 첫 순위로 둬 안드로이드·윈도에서도 같게 보인다. 숫자는 `font-variant-numeric: tabular-nums` |
| 글자 크기 | 22~34 생산자 요약 숫자 · 34 큰 제목 · 22 섹션 제목·상품명 · 17 본문 · 16 입력칸(아이폰 자동 확대 방지, 16 밑 금지) · 15 보조·메타(날짜·칩·탭·‘n명 예약’·시각)·채팅 말풍선. 13은 쓰지 않는다 |
| 굵기 | 400 · 600 · 700 |
| 큰 제목 자간 | 34·22는 -0.02em / -0.01em |
| 색 | 글자 `#111111` · 보조 글자 `#6B6B6B` · 바탕 `#FFFFFF` · 면 `#F5F5F3` · 구분선 `#E8E8E6` · 강조 `#C94F0C`(흰 글자 4.56:1, 17px 600 이상에만. 예외: 안 읽음 배지 숫자 15 굵게) · 강조 눌림 `#A8420A` · 오류 `#B42318`(오류 글·테두리·반려만) |
| 모서리 | 8 작은 요소·입력 · 16 카드·사진·버튼 · 원형 칩·배지·아바타. 말풍선은 꼬리 쪽 한 모서리만 4 |
| 간격 | 4 단위(4·8·12·16·20·24·32·40). 좌우 여백 20, 섹션 사이 40, 입력칸 안쪽 여백 16 |
| 그림자 | 없음. 하단 고정 바·시트·탭 바만 흰 반투명(`rgba(255,255,255,0.82)`) + `backdrop-filter: blur(20px)` |
| 아이콘 | 24px, 선 1.75, 둥근 끝. 예외: 칸 안 작은 체크(20px 이하)는 선 2.5 |
| 버튼 높이 | 소비자 52 · 생산자 56(글자 17). 글자 버튼은 누르는 영역 48 |
| 입력칸 | 높이 48, 글자 16, 라벨 15 굵게, 안쪽 여백 16. 긴 글 입력은 줄 간격 1.6, 붙여넣기 칸 200 |
| 누르는 영역 | 최소 48(PRD N-02). 보이는 크기는 그대로 두고 여백으로 넓힌다: 사진 위 원형 40 → 48, 사진 빼기 X 32 → 48, 채팅 보내기 원 40 → 48, 송장 줄은 줄 전체 |
| 썸네일 | 104 탐색 목록 · 64 거래 요약(주문서·주문 내역·주문 상세·출하·생산자 목록) · 40 아바타. 소식 사진 7:4(350×200). 사진이 없으면 면색 + 보조색 아이콘(상품 감귤, 농가 집, 사람 이름 첫 글자) |
| 하단 탭 바 | 좌우·아래 12 띄운 둥근 바(높이 64, 글자 15), 선택 탭만 면 색 알약. 안 읽음 배지는 강조색 원형 24, 숫자 15 굵게 |
| 토스트 | 검정 알약 높이 48, 글자 17, 하단 바·탭 바 위 2초 |
| 화면 폭 | 휴대폰 390 기준. PC는 최대 폭 480 가운데 정렬, 바깥 `#F5F5F3`. 탭 바·하단 바·시트·토스트도 이 폭 안. 위·아래 여백에 기기 안전 영역(`env(safe-area-inset-*)`)을 더한다 |
| 화면 모드 | I1은 밝은 화면만(`color-scheme: light`) |

## 컴포넌트 (ds.html)

버튼(주요·테두리·글자·비활성 + 눌림·로딩·키보드 포커스), 입력 필드(기본·포커스 `#111111` 1.5·비활성·오류), 체크박스·라디오(24, 줄 전체가 누르는 영역), 상태 배지(칩은 D-day·품절만, 주문·상품 상태는 글자), 상품 행(썸네일 104, 상품명 17 최대 2줄, 농가·받는 시기 15, 가격 17 굵게 + D-day, 예약 수 15), 상품 카드, 소식 카드(좋아요 토글), 팔로우 토글(팔로우 ↔ 팔로잉), 사진 없음 자리 표시, 세그먼트(칸 48), 접힌 목록, 단계 막대(칸마다 단계/가격/날짜 세 줄, 화면 읽기 라벨 한 문장), 하단 탭(소비자·생산자), 하단 고정 바(요약 한 줄 + 보조 1 : 주요 2), 사진 위 버튼(검정 32% 원형 40, 누르는 영역 48), 사진 아래 안내 띠, 시트, 날짜 기간 선택 시트, 채팅 말풍선(농가 면 색·나 검정·AI 안내 테두리 + 배지), 빈 상태, 로딩 스켈레톤, 토스트, 떠 있는 작성 버튼("+ 소식", "+ 새 상품").

## 규칙

- **강조색은 화면당 주요 버튼 하나.** 나머지 위계는 크기·굵기·여백·사진으로 만든다. 강조색 위 흰 글자는 17px 600 이상에만 쓴다. 예외: 안 읽음 배지 숫자 15 굵게.
- **강조색 예외**: 안 읽음 배지, 반려 라벨, 팔로우하기 전의 "팔로우" 버튼 두 곳(SCR-03 농가 페이지, SCR-12 주문 완료의 팔로우 제안). 팔로잉이 되면 강조색을 뺀다.
- **강조 버튼 위치**: 화면 아래(하단 고정 바, 떠 있는 버튼, 시트)에만 둔다. SCR-03의 팔로우는 하단 바가 없는 화면이라 예외.
- **팔로우 토글**: 팔로우하면 면색 + 체크 + "팔로잉". 다시 누르면 확인 없이 끊고 토스트 "팔로우를 끊었어요". 이미 팔로우한 농가면 SCR-12의 팔로우 제안 카드를 숨긴다.
- **탭 바**: 하단 고정 바에 주 행동이 있는 작업 화면(주문서, 배송지 관리, 소개 고치기 등)은 탭 바를 숨긴다. 조회용 하위 화면(주문 내역 등)은 탭 바를 유지한다. 떠 있는 탭이 마지막 내용을 가리지 않게 아래 여백 96.
- **머리(헤더)**:

  | 화면 | 머리 |
  | --- | --- |
  | 탭 첫 화면 | 헤더 없이 왼쪽 큰 제목 34(현황은 사진 띠, 홈은 워드마크 + 검색) |
  | 목록 하위 화면 | 48 바(뒤로) + 아래 큰 제목 34 |
  | 작업 화면 | 48 바(뒤로 + 가운데 제목 17 굵게) |
  | 사진 화면 | 사진 위 원형 버튼(뒤로·공유) |
  | 상태 화면(로그인, 주문 완료, 승인 대기, 정지 등) | 큰 제목 |

  닫기 X는 아래에서 올라오는 전체 화면(배송지 입력, 소식 올리기)에만 쓰고, 옆으로 넘어가는 화면은 뒤로를 쓴다.
- **카드는 누르는 것만.** 정보 묶음은 여백과 얇은 구분선으로 나눈다(SCR-26 단계 묶음도 구분선 섹션). 보여 주기만 하는 값은 입력칸이 아니라 글자 줄로 쓴다.
- **같은 정보·사진은 한 화면에 한 번.**
- **시트**: 기본 화면 위에 검정 40%를 깔고, 흰 반투명 + blur 시트를 아래에서 올린다. 제목 22.
- **날짜 입력**: 받는 시기·단계 기간은 입력칸을 누르면 달력 시트. 시작일과 끝날을 차례로 누르고, 지난 날짜는 비활성. 단계끼리 겹치면 겹친 날을 오류색으로 표시하고 "이 기간으로"를 끈다.
- **토스트 쓰는 곳**: 소식 올림, 저장, 송장 저장, 배송지 저장·삭제, 예약 취소 완료, 팔로우 해제, 링크 복사. 네트워크 오류는 공통 토스트 "연결이 불안정해요 · 다시 시도". 화면 안 오류 상자가 있는 곳은 토스트를 띄우지 않는다.
- **소비자 상태 문구**: 소비자 앱은 "예약 완료 → 수확·포장 중 → 배송 중 → 배송 완료". API 상태값과 생산자 앱 문구(출하 준비·출하)는 그대로.
- **접근성**: 누르는 영역 48 이상. 시스템 글자 200%에서 단계 막대·하단 바·탭 바가 겹치지 않게 줄바꿈 허용. 아이콘만 있는 버튼은 `aria-label`, 단계 막대는 칸마다 한 문장 라벨.
- **생산자 앱**: 소비자와 같은 글자 단계와 부품을 쓴다. 다른 점은 할 일 숫자 48, 주요 버튼 56, 목록 줄 최소 56뿐. 현황·농가 탭에 떠 있는 "+ 소식", 상품 탭에 "+ 새 상품".

## 스펙과 다른 점

screens.md 1.0과 다르게 정한 것이다. SWPP-81에서 스펙 1.1에 반영한다.

1. **SCR-01 홈**: 공개 소식 미리보기 대신 "농가 둘러보기"(가로 스크롤 농가 카드). 헤더 오른쪽 검색 아이콘 → SCR-02 검색칸.
2. **상품 필드 추가**: `reservedCount`(n명 예약, 상품 행·카드)와 `brixRecordCount`(당도 기록 n회, 상품 상세 농가 줄)를 API 응답에 추가한다.
3. **비로그인 관문**: 로그인 화면으로 바로 가지 않고 안내 시트를 먼저 띄운다. 예약은 옵션 시트의 "주문서로"에서 띄우고, 로그인 뒤 고른 옵션·수량 그대로 주문서. 팔로우·채팅은 누른 자리에서 띄우고 로그인 뒤 그 행동을 이어서 한다.
4. **SCR-04 상품 상세**: 사진이 화면 맨 위까지 차고 사진 위에 뒤로·공유(농가 링크) 버튼. 사진 아래 "11월 10일~20일 도착 예정 ›" 띠. 하단 고정 바에 채팅하기(보조) + 예약하기(주요). 예약하기를 누르면 옵션·수량 시트가 먼저 뜬다. 배송비는 가격 아래 한 줄로 펼침. "최신 소식" 칸은 없다.
5. **SCR-10 배송지 입력**: 전체 화면(닫기 X)으로 분리. I1은 우편번호·주소·상세 주소를 직접 입력하고 "우편번호 찾기"는 없다.
6. **SCR-16 농가 채팅**: "틀렸어요" 버튼 없음(screens.md 결정 5와 같음, I2).
7. **SCR-21 승인 대기**: 새로고침 버튼 대신 들어올 때마다 자동 확인(당겨서 새로고침). "신청 내용 보기"(읽기 전용 시트)와 "로그아웃"을 둔다.
8. **SCR-28 질문함**: 목록에는 질문 줄만(질문, 넘긴 이유, 시각). 답은 줄을 눌러 들어가는 소비자별 채팅에서 입력한다.
9. **SCR-29 출하 처리**: 주문마다 고르기 체크. 하나 이상 고르면 하단 바에 "n건 출하로 바꾸기" → 출하 확인 시트(주문별 출하를 반복). 줄의 "택배사·송장 번호 넣기 ›"로 여는 시트에서 택배사(CJ대한통운·우체국택배·한진택배·롯데택배·로젠택배·기타)와 송장 번호(선택)를 넣는다. API에 `carrier`(택배사 코드) 추가.
10. **SCR-14 주문 상세(소비자)**: 상태 문구는 수확·포장 중 / 배송 중. 배송 중이면 "택배사 · 송장 번호 · 복사 · 배송 조회"(택배사 조회 페이지로 이동).
11. **SCR-30 농가**: 프로필은 줄 목록(농가 이름·지역·소개 ›), 누르면 값 하나만 고치는 화면. 농가 링크는 글자 한 줄 + 복사·보내기.
12. **SCR-22 현황**: 큰 제목 대신 농가 사진 띠(200)에 농가 이름과 "오늘 할 일 n". 할 일 3줄은 48 숫자. 예약 수량은 단계마다 옵션별로 보인다. "출하 처리" 버튼은 없고 할 일 "출하할 주문"이 대신한다.
13. **SCR-11 결제**: Mock 성공·실패 토글은 점선 상자에 "개발용 · 실제 서비스에는 없음" 표시.
14. **계정 완전 분리**: 소비자와 생산자는 계정이 따로다. 로그인은 앱별로 소비자 SCR-05(소비자 테스트 계정만), 생산자 SCR-19(생산자 테스트 계정만 + "농가로 가입 신청" 링크). SCR-20 가입 신청이 생산자 계정 만들기를 겸하고 대표자 이름을 함께 받는다. 소비자 SCR-17의 "농가로 시작하기"는 "생산자 앱은 따로 가입해요" 시트를 거쳐 생산자 앱 가입 신청으로 간다.

## 예시 데이터 (보고서 3절 시드 기준)

모든 화면과 Mock 시드는 이 표를 따른다. 오늘 = 2026년 10월 7일(수).

| 항목 | 값 |
| --- | --- |
| 상품 | 강씨네 귤밭(제주 서귀포, 팔로워 128명) · 하우스 감귤, 옵션 5kg / 10kg, 받는 시기 11월 10일~20일, 지연 환불 기한 11월 30일 |
| 1단계 (10월 1일~12일, 지금) | 5kg 29,000원 · 80박스 / 10kg 55,000원 · 20박스 |
| 2단계 (10월 13일~11월 5일) | 5kg 33,000원 · 60박스 / 10kg 62,000원 · 25박스 |
| 3단계 (11월 6일~9일) | 5kg 36,000원 · 40박스 / 10kg 68,000원 · 15박스 |
| 예약 | 37명, 40건. 5kg 34건 38박스(42박스 남음), 10kg 6건 6박스(14박스 남음) |
| 주문 상태 | 예약 완료 30건, 출하 준비 7건, 출하 3건 (합 40) |
| 김민지 주문 | FC-1007-0042, 5kg × 2, 10월 7일 예약, 예약 완료. 출하 준비 목록 예시는 10월 6일까지 들어온 주문만 쓴다 |
| 생산자 현황 | 답할 질문 3, 출하할 주문 7, 승인 대기 상품 1 → 오늘 할 일 11 |
| 당도 | 예상 12Brix, 실측 11.8Brix(10월 5일), 당도 기록 5회 |
| 테스트 계정 | 소비자 앱: 김민지, 이서준 · 생산자 앱: 강영수(승인), 오미숙(확인 중), 박순자(반려), 최태호(정지), 신규 생산자(농가 없음, 가입 신청 시험용). 두 앱 계정은 섞이지 않는다 |
| 요일 | 10월 5일 (월), 6일 (화), 7일 (수) |

## 화면 목록

### 소비자 앱

| 프레임 | 파일 | 크기 |
| --- | --- | --- |
| SCR-01 홈·발견 | [screens/scr-01.html](screens/scr-01.html) | 390×1300 |
| SCR-02 농가 목록 | [screens/scr-02.html](screens/scr-02.html) | 390×1040 |
| SCR-03 농가 페이지 | [screens/scr-03.html](screens/scr-03.html) | 390×1560 |
| SCR-04 · 시트 옵션·수량 | [screens/scr-04-sheet.html](screens/scr-04-sheet.html) | 390×844 |
| SCR-04 상품 상세 | [screens/scr-04.html](screens/scr-04.html) | 390×1320 |
| SCR-05 로그인 | [screens/scr-05.html](screens/scr-05.html) | 390×844 |
| SCR-10 주문서 | [screens/scr-10.html](screens/scr-10.html) | 390×1720 |
| SCR-11 결제 | [screens/scr-11.html](screens/scr-11.html) | 390×844 |
| SCR-12 주문 완료 | [screens/scr-12.html](screens/scr-12.html) | 390×1000 |
| SCR-13 주문 내역 | [screens/scr-13.html](screens/scr-13.html) | 390×1120 |
| SCR-14 주문 상세 | [screens/scr-14.html](screens/scr-14.html) | 390×1140 |
| SCR-15 채팅 목록 | [screens/scr-15.html](screens/scr-15.html) | 390×844 |
| SCR-16 농가 채팅 | [screens/scr-16.html](screens/scr-16.html) | 390×1080 |
| SCR-17 내 정보 | [screens/scr-17.html](screens/scr-17.html) | 390×1100 |
| SCR-18 소식 | [screens/scr-18.html](screens/scr-18.html) | 390×1340 |

### 생산자 앱

| 프레임 | 파일 | 크기 |
| --- | --- | --- |
| SCR-19 로그인 (생산자 앱) | [screens/p-scr-19.html](screens/p-scr-19.html) | 390×844 |
| SCR-20 가입 신청 | [screens/p-scr-20.html](screens/p-scr-20.html) | 390×1300 |
| SCR-21 승인 대기 | [screens/p-scr-21.html](screens/p-scr-21.html) | 390×844 |
| SCR-22 현황 | [screens/p-scr-22.html](screens/p-scr-22.html) | 390×1640 |
| SCR-23 상품 목록 | [screens/p-scr-23.html](screens/p-scr-23.html) | 390×1180 |
| SCR-24 AI 상품 초안 | [screens/p-scr-24.html](screens/p-scr-24.html) | 390×844 |
| SCR-24 · 초안 결과 | [screens/p-scr-24-result.html](screens/p-scr-24-result.html) | 390×1200 |
| SCR-25 상품 편집 | [screens/p-scr-25.html](screens/p-scr-25.html) | 390×2280 |
| SCR-26 단계·가격·물량 | [screens/p-scr-26.html](screens/p-scr-26.html) | 390×1640 |
| SCR-27 소식 올리기 | [screens/p-scr-27.html](screens/p-scr-27.html) | 390×1420 |
| SCR-28 질문함 | [screens/p-scr-28.html](screens/p-scr-28.html) | 390×844 |
| SCR-29 · 시트 출하 확인 | [screens/p-scr-29-sheet.html](screens/p-scr-29-sheet.html) | 390×844 |
| SCR-29 출하 처리 | [screens/p-scr-29.html](screens/p-scr-29.html) | 390×1180 |
| SCR-30 농가 프로필·링크 | [screens/p-scr-30.html](screens/p-scr-30.html) | 390×1180 |

### 상태 프레임·시트

| 프레임 | 파일 | 크기 |
| --- | --- | --- |
| SCR-01 · 네트워크 오류 | [screens/s-01-error.html](screens/s-01-error.html) | 390×1260 |
| SCR-01 · 로딩 | [screens/s-01-loading.html](screens/s-01-loading.html) | 390×844 |
| SCR-02 · 검색 결과 없음 | [screens/s-02-noresult.html](screens/s-02-noresult.html) | 390×844 |
| SCR-03 · 소식 선택 | [screens/s-03-news.html](screens/s-03-news.html) | 390×1600 |
| SCR-03 · 찾을 수 없는 농가 | [screens/s-03-notfound.html](screens/s-03-notfound.html) | 390×844 |
| SCR-03 · 팔로우 해제 토스트 | [screens/s-03-unfollowed.html](screens/s-03-unfollowed.html) | 390×1560 |
| SCR-03 · 팔로잉 | [screens/s-03-following.html](screens/s-03-following.html) | 390×1560 |
| SCR-04 · 판매 종료 | [screens/s-04-ended.html](screens/s-04-ended.html) | 390×844 |
| SCR-04 · 품절 | [screens/s-04-soldout.html](screens/s-04-soldout.html) | 390×1320 |
| SCR-05 · 비로그인 관문 | [screens/s-05-gate.html](screens/s-05-gate.html) | 390×844 |
| SCR-10 · 결제 중 단계가 바뀜 | [screens/s-10-stagechanged.html](screens/s-10-stagechanged.html) | 390×1820 |
| SCR-10 · 도서산간 추가 운임 | [screens/s-10-remote.html](screens/s-10-remote.html) | 390×1760 |
| SCR-10 · 동의 전 | [screens/s-10-noconsent.html](screens/s-10-noconsent.html) | 390×1720 |
| SCR-10 · 새 주소 입력 | [screens/s-10-address.html](screens/s-10-address.html) | 390×844 |
| SCR-10 · 첫 주문(배송지 없음) | [screens/s-10-noaddr.html](screens/s-10-noaddr.html) | 390×1720 |
| SCR-11 · 결제 실패 | [screens/s-11-fail.html](screens/s-11-fail.html) | 390×920 |
| SCR-12 · 상세 조회 실패 | [screens/s-12-detailfail.html](screens/s-12-detailfail.html) | 390×1000 |
| SCR-14 · 받는 시기 변경 | [screens/s-14-window.html](screens/s-14-window.html) | 390×1220 |
| SCR-14 · 배송 완료 | [screens/s-14-delivered.html](screens/s-14-delivered.html) | 390×1140 |
| SCR-14 · 배송 중 | [screens/s-14-shipped.html](screens/s-14-shipped.html) | 390×1180 |
| SCR-14 · 수확·포장 중 | [screens/s-14-preparing.html](screens/s-14-preparing.html) | 390×1140 |
| SCR-14 · 시트 예약 취소 확인 | [screens/s-14-cancelsheet.html](screens/s-14-cancelsheet.html) | 390×844 |
| SCR-14 · 환불됨 | [screens/s-14-refunded.html](screens/s-14-refunded.html) | 390×1140 |
| SCR-15 · 채팅 없음 | [screens/s-15-empty.html](screens/s-15-empty.html) | 390×844 |
| SCR-17 · 배송지 관리 | [screens/s-17-addresses.html](screens/s-17-addresses.html) | 390×844 |
| SCR-17 · 시트 농가로 시작하기 | [screens/s-17-producer.html](screens/s-17-producer.html) | 390×844 |
| SCR-17 · 시트 배송지 삭제 확인 | [screens/s-17-deletesheet.html](screens/s-17-deletesheet.html) | 390×844 |
| SCR-18 · 팔로우한 농가 없음 | [screens/s-18-nofollow.html](screens/s-18-nofollow.html) | 390×844 |
| SCR-19 · 생산자 정지 안내 | [screens/s-19-suspended.html](screens/s-19-suspended.html) | 390×844 |
| SCR-21 · 반려 | [screens/s-21-rejected.html](screens/s-21-rejected.html) | 390×844 |
| SCR-21 · 시트 신청 내용 | [screens/s-21-application.html](screens/s-21-application.html) | 390×844 |
| SCR-24 · AI 실패 | [screens/s-24-fail.html](screens/s-24-fail.html) | 390×900 |
| SCR-24 · AI 처리 중 | [screens/s-24-loading.html](screens/s-24-loading.html) | 390×844 |
| SCR-25 · 게시 요청 꺼짐 | [screens/s-25-disabled.html](screens/s-25-disabled.html) | 390×2400 |
| SCR-25 · 시트 기간 선택 | [screens/s-25-datesheet.html](screens/s-25-datesheet.html) | 390×844 |
| SCR-25 · 시트 받는 시기 변경 안내 | [screens/s-25-windowsheet.html](screens/s-25-windowsheet.html) | 390×844 |
| SCR-25 · 시트 저장 안 하고 나가기 | [screens/s-25-leavesheet.html](screens/s-25-leavesheet.html) | 390×844 |
| SCR-26 · 검증 오류 | [screens/s-26-error.html](screens/s-26-error.html) | 390×1700 |
| SCR-26 · 시트 기간 겹침 오류 | [screens/s-26-datesheet.html](screens/s-26-datesheet.html) | 390×844 |
| SCR-27 · 첨부 오류 | [screens/s-27-attacherror.html](screens/s-27-attacherror.html) | 390×1560 |
| SCR-28 · 답할 질문 없음 | [screens/s-28-empty.html](screens/s-28-empty.html) | 390×844 |
| SCR-28 · 소비자별 채팅 | [screens/s-28-chat.html](screens/s-28-chat.html) | 390×1000 |
| SCR-29 · 시트 택배사·송장 번호 입력 | [screens/s-29-invoice.html](screens/s-29-invoice.html) | 390×844 |
| SCR-29 · 출하할 주문 없음 | [screens/s-29-empty.html](screens/s-29-empty.html) | 390×844 |
| SCR-30 · 소개 고치기 | [screens/s-30-edit.html](screens/s-30-edit.html) | 390×844 |
| 공통 · 권한 오류 | [screens/s-403.html](screens/s-403.html) | 390×844 |

### 흐름도

| 프레임 | 파일 | 크기 |
| --- | --- | --- |
| F-1 생산자 가입·상품 등록 | [screens/f-1.html](screens/f-1.html) | 2980×1120 |
| F-2 소비자 예약 주문 | [screens/f-2.html](screens/f-2.html) | 2380×1120 |
| F-3 질문 · AI 답 · 농가 답장 | [screens/f-3.html](screens/f-3.html) | 1480×1120 |
| F-4 수확 · 출하 · 배송 · 구매 확정 | [screens/f-4.html](screens/f-4.html) | 1780×1120 |
| F-5 취소 · 환불 · 받는 시기 변경 | [screens/f-5.html](screens/f-5.html) | 1180×1120 |

### PC · 공유 미리보기 · 아이콘

| 프레임 | 파일 | 크기 |
| --- | --- | --- |
| PC 화면 · 최대 폭 480 | [screens/pc.html](screens/pc.html) | 1440×960 |
| 공유 미리보기 · 기본 | [screens/share-default.html](screens/share-default.html) | 1200×630 |
| 공유 미리보기 · 농가 링크 | [screens/share-farm.html](screens/share-farm.html) | 1200×630 |
| 앱 아이콘 · 파비콘 | [screens/icons.html](screens/icons.html) | 1400×1480 |

### 기타

| 프레임 | 파일 | 크기 |
| --- | --- | --- |
| 디자인 시스템 | [screens/ds.html](screens/ds.html) | 1400×4700 |
| 표지 · 화면 체크리스트 | [screens/cover.html](screens/cover.html) | 1240×1880 |

## 스펙 1.2 레이아웃

- 소비자 탭은 발견 / 소식 / 1:1 채팅 / 내 정보. 생산자는 현황 / 상품 / 채팅 / 농가이며 채팅 안에 소식방 / 1:1 채팅을 둔다.
- 소식방과 1:1은 작은 고정 헤더(뒤로·아바타·이름), 옅은 회색 대화 배경, 날짜 구분, 프로필 옆 흰 말풍선, 내 답장 우측 말풍선, 작은 시각, 하단 입력창으로 구성한다. 브랜드 주황은 주요 행동에만 사용한다. AI 답은 별도 배지·근거, 직접 응대 상태는 헤더에 표시한다.
- 메시지 연속 작성자의 아바타·이름 반복을 줄이고 말풍선은 최대 80% 폭, 긴 URL/한국어가 넘치지 않게 줄바꿈한다. 사진 원본 비율을 보존하고 확대 가능하게 한다. 새 메시지 도착 시 과거를 읽는 위치를 강제로 내리지 않는다.
- 현황은 농가·오늘 할 일, 상품별 판매/총 한도/잔여, 최근 예약 순으로 정돈한다. 과도한 48px 숫자 대신 22~34px 요약을 사용한다. 명·건·박스를 명시한다.
- 상품 편집에서 ‘판매 설정’(총 판매 박스·한 주문 상한·중지/재개)과 ‘예약 기간·가격’을 분리한다. 날짜 범위가 제목이며 1/2/3단계 칩은 없다. 현재 판매값/승인 대기 편집안을 명확히 표시한다.
- 중지는 보조 버튼+확인 시트, 재개는 가능한 경우만 활성. 상태는 색만으로 알리지 않고 텍스트를 함께 쓴다.
- 입력창/키보드/탭 바가 메시지나 저장 버튼을 가리지 않게 safe area와 실제 하단 높이를 반영한다. 대화 상세·편집·문의 화면에서는 탭 바를 숨긴다.
- 360/390/430/1440px에서 가로 넘침, 긴 상품명·큰 숫자·사진 여러 장·빈 상태·오류·로딩·키보드·이전 페이지를 확인한다. 기존 48px 터치 영역과 본문/입력 글자 최소값은 유지한다.

참고: [Bubble 공식 소개](https://www.dear-u.co/en/pages/business_bubble.php)의 대화 구성, [공식 화면 예시](https://www.dear-u.co/images/renew/sub/bubbleApp03_en.jpg). 자산·로고를 복제하지 않고 Farmclub의 비공개 답장 규칙을 적용한다. 판매 총 한도와 구매 한도 구분은 [Coupang 공식 상품 API](https://developers.coupang.com/ko/api/products/querying-product)의 별도 항목을 참고했다. 실제 기능 기준은 [1.2 계약](../spec/contracts-1.2.md)이다.

## 스펙 1.3 레이아웃

변경 화면은 기존 HTML·1.1 탭 배치보다 이 절과 [화면 구조 1.3](../spec/navigation-1.3.md)이 우선한다.

- 소비자 발견/내 주문/채팅/내 정보, 생산자 현황/상품/채팅/환경설정. 세 번째 채팅, 별도 채팅 FAB 없음.
- 채팅은 좌우 20, 원형 프로필 48, 행 간격 16, 이름·최근 메시지 각 한 줄, 시각·배지 우측 고정. 사진 없으면 이니셜. 소식방/1:1은 제목 아래 높이 48 세그먼트.
- 여러 농가 방 목록과 생산자 자기 방 모두 메신저 행. 방 헤더에 원형 프로필, 날짜 구분·말풍선·입력창·첨부. 첨부 소식 작성은 방 안에서 진입.
- 상품은 가로 스크롤 상태 필터·개수, 썸네일·상태·판매량·설정 버튼 순. 반려·오류만 오류색.
- 현황·프로필의 소식 FAB 제거. 환경설정은 농가 요약·메뉴 목록. 내 주문 루트는 뒤로 버튼 없는 큰 제목.
- 색·글자·터치 영역 토큰 유지. 하단 콘텐츠에 탭/입력창·안전 영역 여백을 확보한다.
