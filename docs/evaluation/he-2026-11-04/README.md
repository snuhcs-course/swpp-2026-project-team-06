# farmclub Heuristic Evaluation 안내 (2026-11-04)

farmclub은 감귤 농가(생산자)와 소비자를 잇는 산지 직거래·선주문 서비스입니다. 앱은 **소비자 앱**과 **생산자(농가) 앱** 두 개이고, 모두 운영 서버(`https://api.farmclub.kr`)에 연결됩니다. 아래 계정은 평가용 테스트 계정이며, 실제 결제·송금은 일어나지 않습니다.

## 1. 앱 여는 법

| 어디서 | 소비자 앱 | 생산자 앱 |
| --- | --- | --- |
| 팀 Android 기기 | Chrome에서 아래 주소를 연 뒤 ⋮ → ‘설치 및 바로가기 만들기’ → 홈 화면의 `farmclub` 아이콘 | 같은 방법, 홈 화면의 `farmclub 농가` 아이콘 |
| 노트북 브라우저 | https://farmclub.kr/login?evaluator=1 | https://farm.farmclub.kr/login?evaluator=1 |

- 로그인 화면에서 **테스트 계정을 골라** 들어갑니다. ‘카카오로 시작하기’는 개인 카카오 계정으로 운영 서버에 가입되므로 **쓰지 말아 주세요**.
- 반드시 위 주소(`?evaluator=1` 포함)로 들어가야 테스트 계정 목록이 보입니다. Android는 Chrome에서 이 주소를 한 번 열면 기기에 기억되어 홈 화면 아이콘(PWA)으로 열어도 목록이 보입니다(DEV-198).
- **APK 앱은 쓰지 말아 주세요.** 키보드가 입력칸을 가리고(DEV-205) 생산자 첫 화면이 반쪽으로 밀리는(DEV-206) 네이티브 문제가 있어 웹(PWA)으로 평가합니다.
- (참고) APK 설치 파일(Expo internal 빌드): GitHub Release <https://github.com/snuhcs-course/swpp-2026-project-team-06/releases/tag/apk-internal-2026-10-23>(두 앱 APK + SHA-256, Expo 링크는 30일 뒤 만료라 여기 보관). 원본 빌드 페이지: 소비자 <https://expo.dev/accounts/snu-omm/projects/farmclub-consumer/builds/28528091-faa4-4141-bfc2-b431bfd52e13>, 생산자 <https://expo.dev/accounts/snu-omm/projects/farmclub-producer/builds/db07a7db-4ac7-4fe2-8d12-77a906fd0213>. 설치 뒤 **두 번 실행**해야 최신 화면(업데이트)이 적용됩니다.

## 2. 테스트 계정

| 앱 | 계정 (화면에 보이는 이름) | 상태 | 이런 평가에 |
| --- | --- | --- | --- |
| 소비자 | 김민지 | 시드 주문·대화가 들어 있는 계정 | 둘러보기, 주문 내역, 농가와 대화 |
| 소비자 | 이서준 | 같은 소비자 역할 | 동시에 평가하는 사람이 있을 때 |
| 생산자 | 강영수 · 강씨네 귤밭 | 승인된 농가 | 주문 관리, 상품·소식 올리기, 손님 대화 |
| 생산자 | 신규 생산자 | 농가 없음 | 처음 가입·농가 신청 흐름 (**한 명만**, 한 번 신청하면 다른 상태가 됩니다) |
| 생산자 | 오미숙 · 위미 감귤농장 / 박순자 · 하례 귤밭 | 신청 반려 | 반려 안내·재신청 화면 |
| 생산자 | 최태호 · 신례 감귤원 | 판매 정지 | 정지 안내 화면 |

계정은 평가자끼리 **같이 씁니다**. 다른 평가자가 남긴 주문·대화가 보일 수 있습니다.

## 3. 해 볼 만한 흐름

**소비자 앱**
1. 홈에서 농가·상품 둘러보기 → 농가 팔로우, 소식 보기
2. 상품 상세 → 선주문(옵션·수량) → 주문서 동의 → 무통장 입금 안내 → ‘입금했어요’ (실제 송금 없음)
3. 주문 내역에서 상태 확인, 취소·문의
4. 상품 페이지에서 농가에 질문하기 → ‘AI 안내’ 답변 또는 농가 전달 안내 확인 — **한라네 과수원 상품에서** 물어보세요. 김민지–강씨네 귤밭 대화방은 농가 직접 응대 상태라 AI 안내가 나오지 않습니다
5. 대화 탭 → farmclub 고객센터 문의

**생산자 앱 (강영수)**
1. 주문 관리: 새 주문, 입금 확인(시뮬레이션), 수확 시작(상품 › 기간·가격의 기간 카드, 또는 주문 현황 ‘예약’ 탭 맨 위 줄), 출하·송장 입력
2. 새 상품: 자료 올리기 → AI로 상세 채우기 → 미리보기 → 판매 요청
3. 소식 보내기, 손님 대화 답하기와 AI 응답 설정
4. 화면 오른쪽 위 ‘?’ 도움말 투어

## 4. 알려진 제한

- 결제는 무통장 입금 **안내까지만** 있고, 입금 확인은 농가·운영자가 버튼으로 처리합니다(실제 계좌 이체 없음).
- 휴대폰이 Wi-Fi에 연결되지 않으면 홈이 ‘소식을 불러오지 못했어요’만 보입니다(오프라인 안내 문구 없음, 알려진 문제).
- 카카오톡 앱으로 바로 로그인 전환은 기기에 따라 되지 않을 수 있습니다(평가에는 테스트 계정 사용).
- 사전 점검에서 찾은 문제는 같은 폴더의 `he-claude-2026-11-03.md`(웹), `he-claude-phone-2026-11-03.md`(APK), `he-claude-pwa-2026-11-03.md`(PWA)에 있습니다. 평가 결과·재현 조사·후속 이슈는 `results.md`에 있습니다.

---

## 팀용: 준비·정리 체크리스트

**평가 전 (11/3 밤 ~ 11/4 수업 전)**
- [x] DEV-200 머지 뒤 EAS `preview` 환경에 `EXPO_PUBLIC_EVALUATOR_LOGIN=1` 등록 → 두 앱 `eas update --channel preview --environment preview` (Expo snu-omm 권한, PR #373 본문 명령; 11/3, 소비자 그룹 `9b5610a6`, 생산자 그룹 `2a06c9d1`)
- [x] 팀 Galaxy에서 Chrome으로 두 주소를 열고 홈 화면에 추가 → PWA에서 테스트 계정 목록, 김민지·강영수로 로그인, 홈·농가 로딩 확인 (11/3, `he-claude-pwa-2026-11-03.md`)
- [ ] 노트북 2대: 위 두 주소를 각각 열어 두고 로그인 확인
- [ ] 운영 데이터 확인(읽기만): `GET https://api.farmclub.kr/api/auth/test-accounts?app=consumer|producer`에 위 계정, `GET /api/farms`에 농가 4곳
- [ ] eTL ZIP(11/3 23:59): APK 두 개(위 Expo 빌드 페이지에서 내려받기) + 이 안내(PDF/MD)

**평가 뒤 (사람이 실행, 운영 변경)**

순서: 오미숙 되돌리기와 HE 테스트 소식 삭제는 테스트 로그인이 필요하므로 `MOCK_LOGIN_ENABLED`를 끄기 **전에** 한다. 아래 `API=https://api.farmclub.kr`.

- [x] EAS `preview` 환경에서 `EXPO_PUBLIC_EVALUATOR_LOGIN` 삭제 → 일반 `eas update` (11/4, 두 앱, DEV-200 기록)
  - 삭제: 두 앱 폴더에서 `npx eas-cli@latest env:delete preview --variable-name EXPO_PUBLIC_EVALUATOR_LOGIN --variable-environment preview --scope project --non-interactive`. `production`·`development` 환경에는 원래 없었다(`env:list`로 확인).
  - 업데이트: `npx eas-cli@latest update --channel preview --environment preview --platform android --message "main 231faa9: after HE 11/4, evaluator login off (DEV-200)" --non-interactive` (main `231faa9`, 불러온 변수는 `API_MOCK`·`API_URL`·`CONSUMER_URL`·`PRODUCER_URL` 네 개)
  - 소비자: 그룹 `2bbd031c-22d1-4ce6-bada-dcff8a33a139`, Android 업데이트 `01a1a683-3842-7229-a1bf-d9b0255373ac`, runtime `3a006b6a0ebbf1f12ffea1380f1f9677d8d0acf9`(APK `28528091`와 같음)
  - 생산자: 그룹 `337c065c-c932-4427-b8a8-ec5476f8d162`, Android 업데이트 `01a1a683-d882-72c1-9fe6-3f6860f8e8bb`, runtime `405e3732dcb072f835ac35bb1a01a0307e69fa10`(APK `db07a7db`와 같음)
  - 확인: `npx eas-cli@latest update:list --branch preview --limit 3`에서 맨 위가 위 그룹. 팀 기기 APK를 **두 번 실행**하면 로그인 화면에 테스트 계정 목록 없이 카카오만 보인다(사람이 기기에서 확인).
- [ ] ‘오미숙 · 위미 감귤농장’을 반려(사유 “테스트”)에서 ‘확인 중’으로 되돌리기 (DEV-209, PR #395 “사람이 할 일” 1)
  - 반려를 확인 중으로 되돌리는 관리자 API는 없어서, 앱의 ‘다시 신청하기’와 같은 재신청 API를 쓴다(`PENDING`, 사유·결정 시각 비움).
    ```bash
    API=https://api.farmclub.kr
    TOKEN=$(curl -s -X POST "$API/api/auth/test-login" -H 'Content-Type: application/json' \
      -d '{"userId":"u-misook","app":"producer"}' | jq -r .accessToken)
    curl -s "$API/api/auth/producer-application" -H "Authorization: Bearer $TOKEN" | jq '{status, rejectReason}'   # 전: REJECTED, "테스트"
    curl -s "$API/api/auth/producer-application" -H "Authorization: Bearer $TOKEN" \
      | jq '{ownerName, farmName, region, mainItems, phone}' > misook.json
    curl -s -X POST "$API/api/auth/producer-application" -H "Authorization: Bearer $TOKEN" \
      -H 'Content-Type: application/json' -d @misook.json | jq '{status, rejectReason}'                    # 후: PENDING, null
    rm misook.json
    ```
  - 화면으로 하려면 https://farm.farmclub.kr/login?evaluator=1 → 오미숙 → ‘다시 신청하기’ → 신청.
  - 확인: 오미숙으로 다시 들어가면 ‘확인 중이에요’. 관리자 웹 `/producers` ‘확인 중’ 탭에 위미 감귤농장.
- [ ] HE 중 보낸 「HE 테스트 소식입니다…」 삭제 (DEV-210, PR #396 배포 뒤)
  - 생산자 앱 https://farm.farmclub.kr/login?evaluator=1 → 강영수 → 아래 ‘채팅’ 탭 → 위 ‘소식방’ → 그 소식 말풍선 옆 ⋯(소식 메뉴) → ‘삭제’. HE 중 평가자가 보낸 다른 테스트 소식도 같은 방법으로 지운다.
  - 확인: 소비자 앱(김민지) 강씨네 귤밭 소식방과 채팅 목록 미리보기에 그 소식이 없다. API로는 `curl -s "$API/api/messaging/rooms/f-kang/messages" -H "Authorization: Bearer $TOKEN" | jq` (`$TOKEN`은 위처럼 `u-minji`·`consumer`로 받은 값)에 그 글이 없다.
- [ ] ‘강씨네 귤밭’ 다시 숨기기 (DEV-198, DEV-98)
  - 관리자 웹 https://admin.farmclub.kr → 공용 비밀번호로 로그인 → 왼쪽 ‘테스트 농가’(`/farms`) → ‘공개 중’ 탭 → 강씨네 귤밭 ‘숨기기’ → 미리보기(출하 전 테스트 주문·입금 알림 건수, 거부 사유가 있으면 멈추고 공유) → ‘숨기기’ 한 번 더.
  - 확인: 같은 화면 ‘숨김’ 탭에 강씨네 귤밭. `curl -s "$API/api/farms?limit=50" | jq '[.items[].name]'`에 ‘강씨네 귤밭’이 없다. https://farmclub.kr 홈·농가 목록에도 없다.
- [ ] 필요하면 운영 `MOCK_LOGIN_ENABLED` 끄기 (끄면 평가 주소는 ‘지금은 로그인할 수 없어요’)
  - Railway 대시보드 → 운영 API 서비스(`server/`, `api.farmclub.kr`) → Variables → `MOCK_LOGIN_ENABLED`를 `false`로 바꾸고 Deploy → 배포가 끝날 때까지 기다린다. CLI로는 그 서비스에 연결된 `server/`에서 `railway variables --set MOCK_LOGIN_ENABLED=false`.
  - 확인: `curl -s -o /dev/null -w '%{http_code}\n' "$API/api/auth/test-accounts?app=consumer"` → `404`. https://farmclub.kr/login?evaluator=1 에 ‘지금은 로그인할 수 없어요’.
- [ ] 평가 중 생긴 테스트 계정 주문·대화 정리 여부 결정 (운영 DB 작업은 사람만)
