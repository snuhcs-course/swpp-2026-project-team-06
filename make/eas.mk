# Native builds on EAS (DEV-483). Logic lives in scripts/eas.mjs; see README "Native apps with EAS".
# The recipes find the repository root with git, so `make -C <repo root> apk` works from any folder.
# What gets uploaded is decided by the root .easignore (scripts/test-easignore.mjs checks it).

EAS_SCRIPT = node "$$(git rev-parse --show-toplevel)/scripts/eas.mjs"

##@ Native apps (EAS)
.PHONY: apk eas-env

apk: ## Internal Android APK on EAS, consumer then producer (APP=consumer|producer for one, DRY_RUN=1 to only check)
	$(EAS_SCRIPT) apk $(APP) $(if $(filter 1,$(DRY_RUN)),--dry-run)

eas-env: ## EAS environment variable names for both apps, never values (ENV=preview default, APP= for one)
	$(EAS_SCRIPT) env $(APP) --environment $(or $(ENV),preview)
