.PHONY: test-engagement
test-engagement: ## DEV-465 customer engagement: server, mock and type checks
	@$(LOCAL_DB_ONLY)
	$(SERVER) uv run pytest tests/test_customer_engagement.py
	npm run test:mock
	npm run typecheck
