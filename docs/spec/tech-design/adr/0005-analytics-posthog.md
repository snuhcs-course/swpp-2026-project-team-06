# 0005 지표: PostHog, I1부터

- 상태: 결정 (2026-10-07)
- 관련: PRD 4장, N-05

## 결정
PostHog Cloud(무료)를 I1부터 쓴다. 화면 이벤트는 앱에서, 결제·취소·구매 확정 같은 확정 사실은 서버에서 보낸다. 이벤트에 개인정보와 메시지 본문을 넣지 않고 내부 사용자 ID만 쓴다.

## 결과
- 주문 전환율, 이른 단계 주문 비중, 팔로우 → 주문, 답장률, AI 자체 해결률, AI 초안 게시율, 출하 전 취소율을 대시보드로 본다.
- 리전은 US Cloud(`https://us.i.posthog.com`)로 정했다(2026-10-18, TQ-01, DEV-71).
- 앱은 `packages/analytics`가 키가 있을 때만 켠다. 세션 녹화는 입력칸과 개인정보가 보이는 화면·메시지 영역의 글자를 가린다(트래킹 플랜).
- 2026-11-26 갱신(DEV-436): iOS·Android 앱도 보낸다. 키는 EAS `production` 환경에만 넣어 스토어 배포 앱만 켜지고 `internal`·`preview` 빌드는 꺼진다.
- 2026-11-27 고침(DEV-436): 원스토어에 올린 앱이 `internal` 프로필 APK(preview 채널, 소비자 v12·농가 v9)여서 키를 `preview` 환경에도 넣고 `eas update --channel preview`로 켠다. 같은 채널의 팀 테스트 APK도 보내므로 분석에서는 `isTestAccount`로 뺀다. 스토어 앱을 production 프로필 빌드로 바꾸면 `preview` 키를 지운다. 앱은 세션 녹화를 하지 않는다. 처리방침은 2026-11-27 고지·바로 시행(PM 결정: 사업 운영 전 테스트 단계).
- 2026-11-28 갱신(DEV-498): 서버의 예상 못 한 오류(500)도 `$exception`으로 보낸다(`server/app/analytics`, 응답 뒤 백그라운드, 실패해도 응답 불변, 키가 없으면 꺼짐, 메시지 정리는 앱과 같음).
- 2026-11-28 갱신(DEV-496): 오류 추적도 PostHog로 한다(Sentry를 따로 두지 않음). 웹·앱의 잡히지 않은 JS 예외·Promise 거부를 `$exception`으로, 앱 JS 스레드 5초 이상 멈춤을 `app_not_responding`으로 보낸다. `before_send`가 오류 메시지의 이메일·4자리 이상 숫자·URL 쿼리를 지운다. 이유: 이미 수탁자인 PostHog로 새 의존성·새 수탁자 없이, 네이티브 모듈 없이(JS만) 원스토어 앱에 `eas update`로 내보낼 수 있다. 네이티브 크래시는 다음 스토어 빌드 때 `@posthog/react-native-plugin`으로 검토한다.
