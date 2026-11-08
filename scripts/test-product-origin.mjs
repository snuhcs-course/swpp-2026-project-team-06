// DEV-258: 상품 상세 원산지 줄(원산지표시법 시행규칙 별표 3 2호가목1)의 전제. 원산지가 비면(공백만 있어도)
// 판매 요청(첫 공급 물량 승인 요청)과 게시된 상품 저장을 막는다. 서버 tests/test_catalog.py와 같은 규칙.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const { db, reset, configureMockStorage } = require("../.expo/mock-build/packages/api/src/mock/db.js");
configureMockStorage({ read: () => null, write: () => {} });
let seq = 0;
const api = (method, path, token, body) =>
  mockTransport({
    method,
    path,
    body,
    headers: { Authorization: token ? `Bearer ${token}` : "", "Idempotency-Key": `origin-test-${++seq}` },
  });
async function producer() {
  reset();
  const r = await api("POST", "/api/auth/test-login", null, { userId: "u-kang", app: "producer" });
  assert.equal(r.status, 200, JSON.stringify(r));
  return r.body.accessToken;
}

test("AC-04-8 DEV-258: blank origin blocks the first sales request in the Mock", async () => {
  const p = await producer();
  db().products["p-origin"] = {
    ...structuredClone(db().products["p-house"]),
    productId: "p-origin",
    status: "DRAFT",
    approvedSupplyGrams: 0,
    salesLimitGrams: 0,
    version: 1,
  };
  db().products["p-origin"].info.origin = "   ";
  const r = await api("POST", "/api/products/p-origin/capacity-requests", p, {
    requestedTotalGrams: 100000,
    version: 1,
  });
  assert.equal(r.status, 400, JSON.stringify(r));
  assert.ok("원산지" in r.body.details.fields, JSON.stringify(r.body));
  assert.equal(db().products["p-origin"].status, "DRAFT");
  const mine = await api("GET", "/api/products/mine/p-origin", p);
  assert.ok(mine.body.missingFields.includes("원산지"));
});

test("AC-04-8 DEV-258: a published product cannot be saved with a blank origin in the Mock", async () => {
  const p = await producer();
  const before = await api("GET", "/api/products/mine/p-house", p);
  assert.equal(before.body.status, "PUBLISHED");
  const r = await api("PATCH", "/api/products/p-house", p, {
    version: before.body.version,
    info: { origin: " " },
  });
  assert.equal(r.status, 400, JSON.stringify(r));
  assert.ok("원산지" in r.body.details.fields, JSON.stringify(r.body));
  assert.equal(db().products["p-house"].info.origin, "제주 서귀포");
});
