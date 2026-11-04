## DEV-97 상품 페이지에서 연 채팅에 상품 전달

- 이슈: [DEV-97](https://linear.app/sswp6/issue/DEV-97) · 브랜치 `zahra/dev-97-chat-product-context` · 기준 절: `server/tasks.md#dev-97` · 상태: 완료(#197)
- 범위: `src/app/(tabs)/products/[productId].tsx`(채팅하기·확인 시트 ‘시작하기’ 경로에 `productId`), `src/app/(tabs)/chats/[farmId].tsx`(경로의 `productId`를 보내기에)
- 10/20 결정: 화면·문구 변경 없음(Figma 해당 없음). 주문 문맥이 있으면 서버가 주문을 우선한다.
- [x] 두 화면 수정, `npm run typecheck` 4개 통과

