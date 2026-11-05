## DEV-51 대화 중심 Figma v6 명세 동기화

- 범위: docs/spec/**, docs/wiki/**, docs/design/README.md, README.md. 앱/공용 구현 범위와 기록은 apps/consumer/tasks.md의 DEV-51 절.
- 결정: conversation-ui-1.6.md를 현재 프론트 기준으로 삼고 FEAT/IA/screens/구현 spec/영문 요약을 함께 갱신. 이전 평가 이미지와 결정 기록은 보관 자료로 표시.
- [x] 홈 가로 목록, 농가 소식방 직접 진입, 같은 방 답장, 역할별 판매 품목 접힘, 고정 구매/탭, 생산자 현황·출하 계약 반영
- [x] 중복 AC 식별자 정리: 공개 권한 AC-12-11, 복귀 AC-15-7. 이전 테스트 결과는 당시 식별자로 보존
- [x] 수확 시작 UI 제거와 RESERVED→PREPARING 자동 전이 없음, 기존 서버 계약 유지 명시
- [x] 최종 검증 범위·로컬 결과 기록. 최신 실서버 CI 결과는 PR #98에 기록
