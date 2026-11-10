// I3 environment smoke check (DEV-165, I3-T03). Run after a fresh seed:
//   cd server && uv run python -m app.core.seed --reset && cd .. && node scripts/i3-env-smoke.mjs
// Runs only against localhost. Writes .artifacts/i3-env/smoke-<baseline>.json (no tokens or secrets).
// I3_SMOKE_SKIP_AI=1 skips the one live model call; that check is then reported as NOT_READY.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const api = process.env.FARMCLUB_API_URL ?? "http://localhost:8000";
if (!["localhost", "127.0.0.1", "::1"].includes(new URL(api).hostname)) {
  throw new Error(`I3 smoke runs only against localhost: ${api}`);
}

const git = (...args) => execFileSync("git", args, { cwd: root }).toString().trim();
const sha = git("rev-parse", "HEAD");
const dirty = git("status", "--porcelain") !== "";
// The baseline names the product code under test: the main commit this checkout is based on.
// Override with I3_BASELINE when a later build is evaluated (e.g. i3-b2-<sha>).
const productSha = git("merge-base", "HEAD", "origin/main");
const baseline = process.env.I3_BASELINE ?? `i3-b1-${productSha.slice(0, 7)}`;
const results = [];
const startedAt = new Date().toISOString();

async function call(method, url, { token, body, key } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (key) headers["Idempotency-Key"] = key;
  const res = await fetch(api + url, { method, headers, body: body && JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json };
}

async function check(id, description, fn) {
  try {
    const observed = await fn();
    const ok = observed.pass;
    delete observed.pass;
    results.push({ id, description, verdict: ok ? "PASS" : "FAIL", observed });
  } catch (error) {
    results.push({ id, description, verdict: "FAIL", observed: { error: String(error.message ?? error) } });
  }
}

const login = async (userId, app) => (await call("POST", "/api/auth/test-login", { body: { userId, app } })).json?.accessToken;
const items = (json) => (Array.isArray(json) ? json : json?.items ?? []);
async function producerOrders(token) {
  const all = [];
  let cursor = "";
  do {
    const { json } = await call("GET", `/api/orders/producer?limit=50${cursor ? `&cursor=${cursor}` : ""}`, { token });
    all.push(...items(json));
    cursor = json?.nextCursor ?? "";
  } while (cursor);
  return all;
}
async function aiAnswerCalls(admin) {
  const { json } = await call("GET", "/admin/ai-usage", { token: admin });
  return json?.features?.find((f) => f.feature === "ai_answer")?.total ?? null;
}

// Local-only operator token, signed with the local JWT secret (same command as scripts/admin-web/README.md).
const admin = execFileSync("uv", ["run", "python", "-m", "app.accounts.admin_token"], {
  cwd: path.join(root, "server"),
  stdio: ["ignore", "pipe", "ignore"],
})
  .toString()
  .trim();

const tokens = {};
await check("ENV-01", "API health", async () => {
  const { status, json } = await call("GET", "/health");
  return { pass: status === 200 && json?.status === "ok", status };
});
await check("ENV-02", "Seeded test accounts are listed per app", async () => {
  const c = items((await call("GET", "/api/auth/test-accounts?app=consumer")).json).map((a) => a.userId);
  const p = items((await call("GET", "/api/auth/test-accounts?app=producer")).json).map((a) => `${a.userId}:${a.farmStatus}`);
  const need = ["u-minji", "u-seojun"].every((u) => c.includes(u)) && p.includes("u-kang:APPROVED") && p.includes("u-misook:PENDING");
  return { pass: need, consumer: c, producer: p };
});
await check("ENV-03", "Mock login works for two consumers and two producers; operator has no test login", async () => {
  for (const [u, app] of [["u-minji", "consumer"], ["u-seojun", "consumer"], ["u-kang", "producer"], ["u-misook", "producer"]]) {
    tokens[u] = await login(u, app);
  }
  const adminTest = (await call("POST", "/api/auth/test-login", { body: { userId: "u-admin", app: "consumer" } })).status;
  const ok = Object.values(tokens).every(Boolean) && adminTest === 404 && Boolean(admin);
  return { pass: ok, loggedIn: Object.keys(tokens).filter((u) => tokens[u]), adminTestLogin: adminTest, operatorToken: Boolean(admin) };
});
await check("ENV-04", "Public farm list shows approved farms only", async () => {
  const farms = items((await call("GET", "/api/farms")).json).map((f) => f.farmId ?? f.id).sort();
  const ok = farms.includes("f-kang") && farms.includes("f-halla") && !["f-wimi", "f-reject", "f-stop"].some((f) => farms.includes(f));
  return { pass: ok, farms };
});
await check("ENV-05", "Consumer cannot call the operator API", async () => {
  const { status } = await call("GET", "/admin/exceptions", { token: tokens["u-minji"] });
  return { pass: status === 403, status };
});
await check("ENV-06", "Producer B cannot read or edit producer A's product", async () => {
  const read = (await call("GET", "/api/products/mine/p-house", { token: tokens["u-misook"] })).status;
  const edit = (await call("PATCH", "/api/products/p-house", { token: tokens["u-misook"], body: { name: "x" } })).status;
  return { pass: read === 403 && edit === 403, read, edit };
});
await check("ENV-07", "Consumer B cannot open consumer A's order", async () => {
  const { status } = await call("GET", "/api/orders/o-42", { token: tokens["u-seojun"] });
  return { pass: status === 404, status };
});
await check("ENV-08", "Order o-42 has the same status for its consumer and producer, and is hidden from producer B", async () => {
  const consumer = (await call("GET", "/api/orders/o-42", { token: tokens["u-minji"] })).json?.status;
  const producer = (await producerOrders(tokens["u-kang"])).find((o) => o.orderId === "o-42")?.status;
  const otherStatus = (await call("GET", "/api/orders/producer", { token: tokens["u-misook"] })).status;
  const other = otherStatus === 200 ? (await producerOrders(tokens["u-misook"])).some((o) => o.orderId === "o-42") : false;
  return { pass: Boolean(consumer) && consumer === producer && !other, consumer, producer, producerB: { status: otherStatus, sees: other } };
});
await check("ENV-09", "Operator sees the pending farm application and the exception list", async () => {
  const pending = items((await call("GET", "/admin/producers?kind=all", { token: admin })).json).map((f) => `${f.farmId}:${f.status}`);
  const exceptions = (await call("GET", "/admin/exceptions", { token: admin })).status;
  return { pass: pending.includes("f-wimi:PENDING") && exceptions === 200, pending, exceptions };
});
await check("ENV-10", "Farm A AI customer support is on and versioned", async () => {
  const { json } = await call("GET", "/api/farms/me/ai-settings", { token: tokens["u-kang"] });
  return { pass: json?.enabled === true && Number.isInteger(json?.version), enabled: json?.enabled, settingsVersion: json?.version };
});

const runId = new Date().toISOString().replace(/[-:.]/g, "");
await check("ENV-11", "Rule-answerable question is answered without a model call", async () => {
  const before = (await aiAnswerCalls(admin))?.calls;
  const { status, json } = await call("POST", "/api/messaging/chats/f-kang/messages", {
    token: tokens["u-seojun"],
    key: `i3-smoke-rule-${runId}`,
    body: { text: "하우스 감귤 배송비가 얼마인가요?", productId: "p-house" },
  });
  const after = (await aiAnswerCalls(admin))?.calls;
  const r = json?.reply ?? {};
  return { pass: status === 200 && r.senderType === "AI" && r.handoffStatus !== "FORWARDED" && after === before, status, reply: r.senderType, handoffStatus: r.handoffStatus ?? null, modelCalls: after - before };
});

if (process.env.I3_SMOKE_SKIP_AI === "1") {
  results.push({ id: "ENV-12", description: "One live model answer through the consumer chat path", verdict: "NOT_READY", observed: { reason: "I3_SMOKE_SKIP_AI=1" } });
} else {
  await check("ENV-12", "One live model answer through the consumer chat path", async () => {
    const before = await aiAnswerCalls(admin);
    const started = performance.now();
    const { status, json } = await call("POST", "/api/messaging/chats/f-kang/messages", {
      token: tokens["u-seojun"],
      key: `i3-smoke-model-${runId}`,
      body: { text: "이 귤은 받은 뒤에 어떻게 보관하면 좋을까요?", productId: "p-house" },
    });
    const latencyMs = Math.round(performance.now() - started);
    const after = await aiAnswerCalls(admin);
    const r = json?.reply ?? {};
    return {
      pass: status === 200 && r.senderType === "AI" && after.calls === before.calls + 1,
      status,
      reply: r.senderType,
      handoffStatus: r.handoffStatus ?? null,
      settingsVersion: r.settingsVersion ?? null,
      latencyMs,
      modelCalls: after.calls - before.calls,
      inputTokens: after.inputTokens - before.inputTokens,
      outputTokens: after.outputTokens - before.outputTokens,
      costUsd: Number((after.costUsd - before.costUsd).toFixed(6)),
    };
  });
}

const summary = results.reduce((acc, r) => ({ ...acc, [r.verdict]: (acc[r.verdict] ?? 0) + 1 }), {});
const out = { baseline, productSha, gitSha: sha, dirty, api, startedAt, finishedAt: new Date().toISOString(), summary, results };
const dir = path.join(root, ".artifacts", "i3-env");
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `smoke-${baseline}-${runId}.json`);
writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
for (const r of results) console.log(`${r.verdict.padEnd(9)} ${r.id} ${r.description}`);
console.log(`\n${JSON.stringify(summary)} → ${path.relative(root, file)}`);
process.exitCode = results.some((r) => r.verdict === "FAIL") ? 1 : 0;
