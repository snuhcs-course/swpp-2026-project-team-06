# Source-analysis worker deployment (DEV-90)

The API uses `Dockerfile`. A separate Railway service, `farmclub-source-worker`, uses
`Dockerfile.worker`; it has no public domain or HTTP healthcheck. Its PID1 is
`python -m app.source_analysis.worker`, not another API server.

The worker image installs the locked `ocr` extra, provisions the three weights in
`app/source_analysis/ocr-manifest.json` with checksum verification, and checks the
applied Alembic head and OCR engine before polling. Runtime never downloads models.
API startup remains responsible for migrations; do not seed production.

The existing CI-gated Railway workflow deploys both API and worker from its checked
main commit when source analysis is enabled. It polls the worker's returned deployment
ID rather than accepting an older successful deployment. The manual procedure below
is for initial provisioning/recovery; normal releases use that main workflow.

## Configuration

Use Railway references to `farmclub-api` for `DATABASE_URL`, `APP_ENV`, `JWT_SECRET`,
`OPENROUTER_API_KEY`, `SOURCE_ANALYSIS_PROVIDER`, `SOURCE_ANALYSIS_MODEL`,
`SOURCE_STORAGE`, the four `SOURCE_R2_*` credentials and `SOURCE_BUDGET_USD`.
Keep Gemini/OpenRouter and the cumulative feature cap of $5; do not reset its ledger.

Set these worker-specific variables:

- `SOURCE_ANALYSIS_ENABLED=true`
- `RAILWAY_DOCKERFILE_PATH=Dockerfile.worker` (explicit builder selection)
- `SOURCE_OCR_MODEL_DIR=/opt/farmclub/ocr`
- `SOURCE_OCR_MODEL_SHA256=9f64ef4f9d20e41cb506a6015af66d4b0da3939b23286f89a0ff32f98d122049`

The hash is the checked-in manifest hash, not a credential. Recalculate it when
the manifest changes. The worker must use private R2, never container-local storage.

## CLI deployment

From a reviewed/tested commit, stage only tracked server files in a fresh directory
outside the checkout. Do not copy `.env`, `.venv`, private artifacts or test data.

```sh
stage_dir=$(mktemp -d)
git archive HEAD server | tar -x -C "$stage_dir" --strip-components=1
cp "$stage_dir/Dockerfile.worker" "$stage_dir/Dockerfile"
cp "$stage_dir/railway-worker.json" "$stage_dir/railway.json"
railway up "$stage_dir" --path-as-root --project <project-id> \
  --service farmclub-source-worker --environment production --detach
```

The staged default Dockerfile is intentionally the worker file as well as setting
the explicit variable: an empty service otherwise selects the API Dockerfile.
`railway-worker.json` describes the worker build/restart settings. A GitHub-backed
service must select that config file and the server root in Railway settings.

Inspect the exact returned deployment ID: default `railway logs` can show an older
successful deployment while a new image is still building. Confirm the build uses
`uv sync --frozen --no-dev --extra ocr`, the OCR provisioning step succeeds, runtime
reports the Alembic head, and PID1 is the worker. Verify concurrent image/PDF jobs,
not just deployment status. The 2026-10-19 production image completed three material
types and private save/reload/apply; see the committed validation JSON.

## Activation and recovery

Start and verify the worker first, then set the API's `SOURCE_ANALYSIS_ENABLED=true`
and wait for its successful deployment. The public config endpoint must return true.

To recover, deploy the API with `SOURCE_ANALYSIS_ENABLED=false`; DEV-84 routes new
products and detail editing to the existing manual workflow. Set the worker false
as well when stopping processing. Preserve DB, source objects and spend reservations.
Do not erase uncertain reservations or automatically retry paid calls.

Operational success does not certify extraction completeness or farmer acceptance.
Producers still review numbers and conflicts. DEV-92 waits for basic-info blur saving before new file/text upload and preserves
manual input. If basic-info saving fails, upload is blocked and the retained file
can be retried explicitly after correcting the input or connection.
