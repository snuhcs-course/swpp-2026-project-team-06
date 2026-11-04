## DEV-71 소비자 주문 목록 파생 값 정리 (GitHub #71, PR #72)

- 이슈: GitHub [#71](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/71) · PR #72(llovablanche, 2026-10-11) · 상태: 리뷰 대기
- 주의: PR 제목의 `DEV-71`은 GitHub 이슈 번호를 따른 것이고, Linear `DEV-71`(PostHog 연결, Done)과는 다른 작업이다.
- 기능·인수 조건: 없음(리팩터). SCR-13 주문 내역 화면의 동작·문구·라우팅 변경 없음.
- 범위: `apps/consumer/src/app/(tabs)/orders/index.tsx` 한 파일
- 결정: 탭별 개수를 렌더 중 매번 `list.data.filter`로 세던 것을 `groupCounts` 한 번으로, 빈 상태 문구의 그룹 라벨을 `selectedGroupLabel` 한 번으로. `list.data`를 지역 변수 `data`로 잡아 콜백 안 null 좁힘 유지.
- 기록: 11/03 PM 지시로 박현이 마무리. `origin/main`(f78f898) 병합(충돌 없음), `apps/consumer` `npx tsc --noEmit` 통과, `npm run test:mock` 63/63. 파생 값만 바뀌어 화면 결과는 같다(탭 개수 `groupCounts?.[v] ?? "—"` = 이전 `list.data ? count : "—"`, 빈 상태 라벨 `?? ""` = 이전 `!.label`).

