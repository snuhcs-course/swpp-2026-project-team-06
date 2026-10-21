# packages/analytics spec

> 지키는 규칙: N-05 · 결정: ADR 0005(PostHog), stack.md TQ-01(US Cloud)
> 이벤트 이름·속성 원본: docs/spec/tech-design/README.md "트래킹 플랜" (여기에 다시 쓰지 않는다)

## 역할
두 웹앱(소비자·생산자)이 PostHog로 화면 이벤트·세션 녹화·히트맵을 보내는 공용 패키지. 확정 사실(결제·취소 등)은 서버(`server/app/analytics`)가 보낸다.

## 구조
- `src/index.ts`: posthog-js 초기화, `useAnalytics(app, user, ready)`(pageview·identify·reset), `track(event, props)`
- `src/privacy.ts`: posthog-js 없이 도는 개인정보 규칙(가릴 경로, 녹화 글자 가리기, 속성 허용 목록, URL 쿼리 지우기). `scripts/test-analytics.mjs`가 검사한다

## 계약
- 빌드 변수 `EXPO_PUBLIC_POSTHOG_KEY`(없으면 꺼짐), `EXPO_PUBLIC_POSTHOG_HOST`(기본 `https://us.i.posthog.com`). 배포는 레포 변수 `APP_POSTHOG_KEY`·`APP_POSTHOG_HOST`
- 앱은 `SessionProvider`에서 `useAnalytics`를 한 번 부르고, 화면은 `track`만 쓴다
- 화면 일부만 녹화에서 가릴 때는 글자에 `<T masked>`(packages/ui), 영역에 `data-ph-private` 속성(`privateArea`를 View에 펼침)

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 |
| --- | --- | --- | --- |
| 2026-10-18 | 키가 없거나 웹이 아니면 초기화하지 않는다 | 로컬·Mock·CI·Playwright에서 외부 전송 없음 | DEV-71 |
| 2026-10-18 | 화면 전환 pageview는 Expo Router `usePathname`으로 직접 보낸다(`capture_pageview: false`) | 앱 경로 단위로 퍼널을 만든다 | DEV-71 |
| 2026-10-18 | identify는 내부 `userId`만, 사람 속성은 `app`·`role`·`isTestAccount`만 | N-05 | DEV-71 |
| 2026-10-18 | 녹화는 입력칸 전부, 개인정보 경로(`PRIVATE_PATHS`)의 글자 전부, `data-ph-private` 영역의 글자를 가린다. 네트워크·콘솔 녹화 끔 | N-05. RNW는 `className`을 받지 않아 `ph-no-capture` 대신 속성을 쓰고, Sheet는 portal이라 경로 기준을 함께 쓴다 | DEV-71 |
| 2026-10-18 | 자동 수집은 요소 글자·속성을 보내지 않는다(`mask_all_text`·`mask_all_element_attributes`), URL 쿼리는 `before_send`에서 지운다(히트맵 `$heatmap_data`의 URL 키 포함) | 클릭한 카드의 주소·이름, 검색어·복귀 경로가 섞이지 않게 | DEV-71 |
| 2026-10-18 | 소비자 앱 퍼널 끝은 ‘입금을 마쳤어요’(`deposit_reported`). 입금 확인(`order_paid`)은 서버가 보낸다 | DEV-68 무통장 입금 | DEV-71 |
| 2026-10-18 | `track` 속성은 트래킹 플랜 키만 남긴다(`cleanProps`) | 타입을 우회한 개인정보 차단 | DEV-71 |
| 2026-10-21 | 내 정보·주문·주문서·입금 안내는 경로째 가리지 않고 법적으로 개인정보인 글자만(판매자 공개 표시 항목·사유는 열어 둠) `T masked`(packages/ui)·`privateArea`로 가린다. 경로 패턴은 `*`로 한 칸을 맞춘다 | 경로째 가리면 메뉴·버튼까지 `***`가 돼 test2 녹화를 읽을 수 없었다 | DEV-104 |
