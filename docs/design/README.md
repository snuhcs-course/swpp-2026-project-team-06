# farmclub 화면 디자인 (I1)

확정일 2026-10-07. 원본은 Claude Design 캔버스 "farmclub 디자인"이고, 이 폴더는 그 캔버스를 정적 HTML로 내보낸 사본이다. 화면·문구·크기의 기준이며, 동작·API는 [screens.md](../spec/screens.md)를 따른다. 둘이 다르면 아래 "스펙과 다른 점"이 우선한다.

- `screens/*.html` — 프레임 하나가 파일 하나다. 브라우저로 열면 390×844 기준으로 보인다. 세로로 긴 화면은 프레임을 늘려 그렸다.
- `assets/` — 예시 사진(Unsplash 무료 라이선스, 자리 표시용). 실서비스에는 농가 사진을 쓴다.
- 시트 화면은 뒤 배경으로 기본 화면을 `iframe`으로 불러온다.

## 디자인 토큰

| 구분 | 값 |
| --- | --- |
| 글꼴 | `-apple-system, "SF Pro Text", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif` 한 가족. 숫자는 `font-variant-numeric: tabular-nums` |
| 글자 크기 | 34 큰 제목 · 22 섹션 제목·상품명 · 17 본문 · 15 보조 · 13 칩·탭·시각. 입력칸 16(아이폰 자동 확대 방지, 16 밑 금지) · 채팅 말풍선 15 · 생산자 할 일 숫자 48 |
| 굵기 | 400 · 600 · 700 |
| 큰 제목 자간 | 34·22는 -0.02em / -0.01em |
| 색 | 글자 `#111111` · 보조 글자 `#6B6B6B` · 바탕 `#FFFFFF` · 면 `#F5F5F3` · 구분선 `#E8E8E6` · 강조 `#C94F0C`(흰 글자 4.6:1) · 강조 눌림 `#A8420A` · 오류 `#B42318`(오류 글·테두리·반려만) |
| 모서리 | 8 작은 요소·입력 · 16 카드·사진·버튼 · 원형 칩·배지·아바타. 말풍선은 꼬리 쪽 한 모서리만 4 |
| 간격 | 8의 배수. 좌우 여백 20, 섹션 사이 40 |
| 그림자 | 없음. 하단 고정 바·시트·탭 바만 흰 반투명(`rgba(255,255,255,0.82)`) + `backdrop-filter: blur(20px)` |
| 아이콘 | 24px, 선 1.75, 둥근 끝. 예외: 칸 안 작은 체크(20px 이하)는 선 2.5 |
| 버튼 높이 | 소비자 52 · 생산자 56(글자 17). 글자 버튼은 최소 44 |
| 입력칸 | 높이 48, 글자 16, 라벨 15 굵게. 긴 글 입력은 줄 간격 1.6, 붙여넣기 칸 200 |
| 누르는 영역 | 최소 44. 채팅 보내기 버튼은 원 40에 터치 영역 44 |
| 하단 탭 바 | 좌우·아래 12 띄운 둥근 바(높이 64, 글자 13), 선택 탭만 면 색 알약. 안 읽음 배지는 강조색 원형 |

## 컴포넌트 (ds.html)

버튼(주요·테두리·글자·비활성), 입력 필드와 오류, 상태 배지(칩은 D-day·품절만, 주문·상품 상태는 글자), 상품 행(사진 88~104 정사각, 상품명 17 최대 2줄, 농가·받는 시기 15, 가격 17 굵게 + D-day, 예약 수 13), 상품 카드, 소식 카드(좋아요 토글), 세그먼트, 접힌 목록, 단계 막대(칸마다 단계/가격/날짜 세 줄), 하단 탭(소비자·생산자), 하단 고정 바(요약 한 줄 + 보조 1 : 주요 2), 사진 위 버튼(검정 32% 원형 40), 사진 아래 안내 띠, 시트, 채팅 말풍선(농가 면 색·나 검정·AI 안내 테두리 + 배지), 빈 상태, 로딩 스켈레톤, 토스트, 떠 있는 작성 버튼("+ 소식", "+ 새 상품").

## 규칙

- **강조색은 화면당 주요 버튼 하나.** 나머지 위계는 크기·굵기·여백·사진으로 만든다.
- **강조색 예외**: 안 읽음 배지, 반려 라벨, 농가 상세의 팔로우 버튼(하단 바 없는 화면의 유일한 주 행동). 소비자 SCR-03 농가 페이지와 SCR-12 주문 완료의 팔로우 버튼이 해당한다.
- **강조 버튼 위치**: 화면 아래(하단 고정 바, 떠 있는 버튼, 시트)에만 둔다.
- **탭 바**: 하단 고정 바에 주 행동이 있는 작업 화면(주문서, 배송지 관리, 소개 고치기 등)은 탭 바를 숨긴다. 조회용 하위 화면(주문 내역 등)은 탭 바를 유지한다. 떠 있는 탭이 마지막 내용을 가리지 않게 아래 여백 96.
- **머리**: 탭 첫 화면은 왼쪽 정렬 큰 제목 34(현황은 사진 띠). 할 일 화면은 48 높이 바(뒤로 + 가운데 제목 17 굵게). 상태 화면(로그인, 주문 완료, 승인 대기, 정지 등)은 큰 제목.
- **카드는 누르는 것만.** 정보 묶음은 여백과 얇은 구분선으로 나눈다. 보여 주기만 하는 값은 입력칸이 아니라 글자 줄로 쓴다.
- **같은 정보·사진은 한 화면에 한 번.**
- **시트**: 기본 화면 위에 검정 40%를 깔고, 흰 반투명 + blur 시트를 아래에서 올린다. 제목 22.
- **생산자 앱**: 소비자와 같은 글자 단계와 부품을 쓴다. 다른 점은 할 일 숫자 48, 주요 버튼 56, 목록 줄 최소 56뿐. 현황·농가 탭에 떠 있는 "+ 소식", 상품 탭에 "+ 새 상품".

## 스펙과 다른 점

screens.md 1.0과 다르게 정한 것이다. 팀이 스펙에 반영한다.

1. **SCR-01 홈**: 공개 소식 미리보기 대신 "농가 둘러보기"(가로 스크롤 농가 카드). 소식은 소식 탭에서 본다.
2. **상품 필드 추가**: `reservedCount`(n명 예약, 상품 행·카드)와 `brixRecordCount`(당도 기록 n회, 상품 상세 농가 줄)를 API 응답에 추가한다.
3. **비로그인 관문**: 로그인 화면으로 바로 가지 않고 안내 시트("로그인하고 팔로우해요" 등)를 먼저 띄운 뒤 로그인으로 보낸다.
4. **SCR-04 상품 상세**: 사진이 화면 맨 위까지 차고 사진 위에 뒤로·공유(농가 링크) 버튼. 사진 아래 "11월 10일~20일 도착 예정 ›" 띠(받는 시기 본문 항목 대신). 하단 고정 바에 채팅하기(보조) + 예약하기(주요). 예약하기를 누르면 옵션·수량 시트가 먼저 뜬다. 배송비는 가격 아래 한 줄로 펼침, 접힌 목록에서 뺀다.
5. **SCR-16 농가 채팅**: "틀렸어요" 버튼 없음(screens.md 결정 5와 같음, I2).
6. **SCR-28 질문함**: 목록에는 질문 줄만(질문, 넘긴 이유, 시각). 답은 줄을 눌러 들어가는 소비자별 채팅에서 입력한다.
7. **SCR-29 출하 처리**: 주문마다 고르기 체크. 하나 이상 고르면 하단 바에 "n건 출하로 바꾸기" → 출하 확인 시트. 송장 번호는 행의 "송장 번호 넣기 ›"를 눌러 여는 시트에서 넣는다(선택).
8. **SCR-30 농가**: 프로필은 줄 목록(농가 이름·지역·소개 ›), 누르면 값 하나만 고치는 화면. 농가 링크는 글자 한 줄 + 복사·보내기.
9. **SCR-22 현황**: 큰 제목 대신 농가 사진 띠(200)에 농가 이름과 "오늘 할 일 n". 할 일 3줄은 48 숫자.
10. **SCR-11 결제**: Mock 성공·실패 토글은 점선 상자에 "개발용 · 실제 서비스에는 없음" 표시.

## 예시 데이터

강씨네 귤밭(제주 서귀포, 팔로워 128명) · 하우스 감귤 5kg / 10kg · 지금 29,000원 / 다음 33,000원 / 마지막 36,000원 · 10kg 55,000원 · 1단계 10월 12일까지(D-5) · 5kg 1단계 80박스 중 38 예약, 42박스 남음 · 37명 예약 · 예상 12Brix, 실측 11.8Brix(10월 5일) · 받는 시기 11월 10일~20일 · 지연 환불 기한 11월 30일(예시) · 테스트 계정 김민지(소비자), 강영수(생산자 승인), 오미숙(생산자 승인 대기).

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
| SCR-05 로그인 (생산자 앱) | [screens/p-scr-05.html](screens/p-scr-05.html) | 390×844 |
| SCR-20 가입 신청 | [screens/p-scr-20.html](screens/p-scr-20.html) | 390×1180 |
| SCR-21 승인 대기 | [screens/p-scr-21.html](screens/p-scr-21.html) | 390×844 |
| SCR-22 현황 | [screens/p-scr-22.html](screens/p-scr-22.html) | 390×1380 |
| SCR-23 상품 목록 | [screens/p-scr-23.html](screens/p-scr-23.html) | 390×1180 |
| SCR-24 AI 상품 초안 | [screens/p-scr-24.html](screens/p-scr-24.html) | 390×844 |
| SCR-24 · 초안 결과 | [screens/p-scr-24-result.html](screens/p-scr-24-result.html) | 390×1200 |
| SCR-25 상품 편집 | [screens/p-scr-25.html](screens/p-scr-25.html) | 390×2120 |
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
| SCR-04 · 판매 종료 | [screens/s-04-ended.html](screens/s-04-ended.html) | 390×844 |
| SCR-04 · 품절 | [screens/s-04-soldout.html](screens/s-04-soldout.html) | 390×1320 |
| SCR-05 · 비로그인 관문 | [screens/s-05-gate.html](screens/s-05-gate.html) | 390×844 |
| SCR-05 · 생산자 정지 안내 | [screens/s-05-suspended.html](screens/s-05-suspended.html) | 390×844 |
| SCR-10 · 결제 중 단계가 바뀜 | [screens/s-10-stagechanged.html](screens/s-10-stagechanged.html) | 390×1820 |
| SCR-10 · 도서산간 추가 운임 | [screens/s-10-remote.html](screens/s-10-remote.html) | 390×1760 |
| SCR-10 · 동의 전 | [screens/s-10-noconsent.html](screens/s-10-noconsent.html) | 390×1720 |
| SCR-10 · 새 주소 입력 | [screens/s-10-address.html](screens/s-10-address.html) | 390×844 |
| SCR-10 · 첫 주문(배송지 없음) | [screens/s-10-noaddr.html](screens/s-10-noaddr.html) | 390×1720 |
| SCR-11 · 결제 실패 | [screens/s-11-fail.html](screens/s-11-fail.html) | 390×920 |
| SCR-12 · 상세 조회 실패 | [screens/s-12-detailfail.html](screens/s-12-detailfail.html) | 390×1000 |
| SCR-14 · 받는 시기 변경 | [screens/s-14-window.html](screens/s-14-window.html) | 390×1220 |
| SCR-14 · 배송 완료 | [screens/s-14-delivered.html](screens/s-14-delivered.html) | 390×1140 |
| SCR-14 · 시트 예약 취소 확인 | [screens/s-14-cancelsheet.html](screens/s-14-cancelsheet.html) | 390×844 |
| SCR-14 · 출하 | [screens/s-14-shipped.html](screens/s-14-shipped.html) | 390×1180 |
| SCR-14 · 출하 준비 | [screens/s-14-preparing.html](screens/s-14-preparing.html) | 390×1140 |
| SCR-14 · 환불됨 | [screens/s-14-refunded.html](screens/s-14-refunded.html) | 390×1140 |
| SCR-15 · 채팅 없음 | [screens/s-15-empty.html](screens/s-15-empty.html) | 390×844 |
| SCR-17 · 배송지 관리 | [screens/s-17-addresses.html](screens/s-17-addresses.html) | 390×844 |
| SCR-17 · 시트 배송지 삭제 확인 | [screens/s-17-deletesheet.html](screens/s-17-deletesheet.html) | 390×844 |
| SCR-18 · 팔로우한 농가 없음 | [screens/s-18-nofollow.html](screens/s-18-nofollow.html) | 390×844 |
| SCR-21 · 반려 | [screens/s-21-rejected.html](screens/s-21-rejected.html) | 390×844 |
| SCR-24 · AI 실패 | [screens/s-24-fail.html](screens/s-24-fail.html) | 390×900 |
| SCR-24 · AI 처리 중 | [screens/s-24-loading.html](screens/s-24-loading.html) | 390×844 |
| SCR-25 · 게시 요청 꺼짐 | [screens/s-25-disabled.html](screens/s-25-disabled.html) | 390×2240 |
| SCR-25 · 시트 받는 시기 변경 안내 | [screens/s-25-windowsheet.html](screens/s-25-windowsheet.html) | 390×844 |
| SCR-25 · 시트 저장 안 하고 나가기 | [screens/s-25-leavesheet.html](screens/s-25-leavesheet.html) | 390×844 |
| SCR-26 · 검증 오류 | [screens/s-26-error.html](screens/s-26-error.html) | 390×1700 |
| SCR-27 · 첨부 오류 | [screens/s-27-attacherror.html](screens/s-27-attacherror.html) | 390×1560 |
| SCR-28 · 답할 질문 없음 | [screens/s-28-empty.html](screens/s-28-empty.html) | 390×844 |
| SCR-28 · 소비자별 채팅 | [screens/s-28-chat.html](screens/s-28-chat.html) | 390×1000 |
| SCR-29 · 시트 송장 번호 입력 | [screens/s-29-invoice.html](screens/s-29-invoice.html) | 390×844 |
| SCR-29 · 출하할 주문 없음 | [screens/s-29-empty.html](screens/s-29-empty.html) | 390×844 |
| SCR-30 · 소개 고치기 | [screens/s-30-edit.html](screens/s-30-edit.html) | 390×844 |
| 공통 · 권한 오류 | [screens/s-403.html](screens/s-403.html) | 390×844 |

### 기타

| 프레임 | 파일 | 크기 |
| --- | --- | --- |
| F-1 생산자 가입·상품 등록 | [screens/f-1.html](screens/f-1.html) | 2980×1120 |
| F-2 소비자 예약 주문 | [screens/f-2.html](screens/f-2.html) | 2380×1120 |
| 디자인 시스템 | [screens/ds.html](screens/ds.html) | 1400×2900 |
| 표지 · 화면 체크리스트 | [screens/cover.html](screens/cover.html) | 1240×1880 |
