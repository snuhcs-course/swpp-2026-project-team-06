# Offline PDF-photo prototype tests (DEV-458/459); no model or production calls.
.PHONY: test-pdf-photos
test-pdf-photos: ## Offline PDF photo extraction, contact sheet and scoring regressions
	@$(LOCAL_DB_ONLY)
	$(SERVER) uv run pytest tests/test_pdf_photo_extract.py -q
	node --test scripts/test-pdf-photo-contact-sheet.mjs scripts/test-pdf-photo-score.mjs
