# Working demo (DEV-134). Logic lives in demo/cmd/*.mjs; see demo/README.md.
# Local only: recording uses the local stack (`make demo`). Production recording is `npm run demo:record -- --target prod --yes`, not a make target.

##@ Demo
.PHONY: demo demo-record demo-stitch demo-site demo-publish

demo: ## Local demo stack: reseed + FastAPI + both apps (+ admin page with ADMIN_WEB_PASSWORD)
	npm run demo

demo-record: ## Record demo segments on the local stack (SEGMENTS="p1 a1" for some, default all)
	npm run demo:record -- --target local $(SEGMENTS)

demo-stitch: ## Join recorded segments into story/consumer/producer/admin videos + demo/manifest.json
	npm run demo:stitch

demo-site: ## Regenerate demo/site step lists, lengths and footer from demo/scenario.mjs + manifest
	npm run demo:site

demo-publish: ## Check videos and show the Release upload (CONFIRM=1 uploads with gh)
	npm run demo:publish -- $(if $(filter 1,$(CONFIRM)),,--dry-run)
