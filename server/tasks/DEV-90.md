## DEV-90 production source analysis and evidence reconciliation (2026-10-19)

- Issue: https://linear.app/sswp6/issue/DEV-90
- Branch: `jinumeral/dev-90-dev-enable-production-source-analysis-worker-and-reconcile`
- Contract: FEAT-03/04/07, AC-SRC-1~11, M-11/13/18, N-05/06.
- Status: In Progress; the user approved the plan, deployment, deck edits and spec/Linear reconciliation.

### Goal and allowed paths
Deploy a dedicated production worker with pinned OCR models; validate image/long-image/PDF analysis, edit, save and apply. Preserve the target PPTX file ID/design and add at most two slides.

- `server/{Dockerfile.worker,railway-worker.json,README.md,spec.md,tasks.md}` and `server/app/source_analysis/spec.md`.
- `.github/workflows/deploy-railway.yml` to deploy the worker from the same CI-verified main commit as the API.
- `docs/spec/{source-integration.md,source-editor.md,source-analysis.md}`, `docs/spec/functional/{FEAT-03-ai-product-draft.md,FEAT-07-product-detail.md}`, `docs/wiki/Source-Analysis.md`, `docs/spec/validation/source-production-2026-10-19.json`.
- Ignored `.artifacts/dev90/**` for deployment/evidence scripts, screenshots, video and PPTX; no committed secrets.
- Railway source worker/API settings, Linear DEV-56~58/DEV-90 and the user-specified Drive deck/media.

### Decisions
- Keep Gemini/OpenRouter and the existing cumulative $5 feature cap. Build OCR extras and checksum-verified models into a dedicated worker image; preserve the existing API image and wire contracts.
- Inspect the latest migration first. Never initialize/seed production or change real customer products. Use the explicitly approved test farm and clearly named demo products; no real payments.
- Deployment and farmer acceptance/accuracy are distinct. Keep historical records with a current-state summary. Do not mark incomplete verification as passed.
- No merge without human approval. User-authorized worker deployment can use the tested branch image, with deployment provenance recorded.
- 10/19 follow-up: the user requested merging before the final deployment/capture. After final review/CI, use the main commit for both services and replace the branch-deployment demo evidence. Keep worker autodeployment in the existing CI-gated Railway workflow so later API releases cannot silently leave its source worker behind.

### Work
- [x] Worker build/config, draft PR and local isolated-DB regression.
- [x] Production worker/API activation, three material types and private persistence/apply. Recovery documented; no production flag-toggle regression performed during this check.
- [ ] Deck/video/screenshots and complete visual/playback QA; preserve the latest user/team slide set without adding slides.
- [ ] Spec/wiki/Linear current state, limitations and verification evidence synchronized.

### Record
- 10/19: R2 HEAD and OpenRouter key authentication passed. API source flag false; no independent worker. Mock15 passed. Source pytest blocked before execution by stopped local PostgreSQL; prepare an isolated local database.

- 10/19 validation: isolated source pytest117, typecheck4 workspaces, mock15, source browser17 passed. Production image/long/PDF SUCCEEDED; private save/reload/apply3/3, public DRAFT404. Actual producer UI edit/section hide/restore/save/reopen/apply passed. Ledger20 paid calls/$0.032994/unsettled0. PDF completeness and farmer acceptance remain incomplete.
- 10/19 DEV-92 created for observed basic-info blur/upload version race. Production selling not exercised: test farm has no deposit account. Main CI deploy workflow now includes the same-commit worker rollout and exact deployment-ID polling. Deck work remains in progress outside the repository.

- 10/19 main2ed8b28 deployed by Actions39261814494: API1473f970/workerf72b6735 SUCCESS, OCR engine ready/PID1 worker, main CI367 server/API7/browser45 passed2 skipped. Follow-up DEV-92 fixes the observed save/upload race before final media capture. The user/team expanded the shared PPTX to15 slides; no agent-added slide. Final delivery and updated recording are tracked in DEV-90/92 and the existing Drive file.

