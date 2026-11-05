## DEV-97 채팅 보내기 `productId`

- 이슈: [DEV-97](https://linear.app/sswp6/issue/DEV-97) · 기준 절: `server/tasks.md#dev-97`
- 범위: `src/endpoints.ts`(`messaging.send` 마지막 인자 `productId?`), `src/mock/conversations.ts`(`send`: 그 농가의 판매 중 상품이 아니면 404, 주문이 없을 때만 AI 근거로 넘김), `scripts/test-ai-feedback.mjs`
- [x] 엔드포인트·Mock, `npm run test:mock` 16/16

