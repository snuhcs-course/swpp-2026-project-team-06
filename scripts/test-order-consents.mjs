// DEV-138 (FEAT-08 AC-08-1, R-03, DEV-120): 주문서 예약 전 동의 항목은 packages/api의 ORDER_CONSENT_KEYS 하나가 원본이다.
// 서버는 Python이라 목록을 공유하지 않으므로, 서버 Consents 필드·검사·오류 문구가 이 목록과 같은지 여기서 본다.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const consents = await import("../packages/api/src/orderConsents.ts");
const { ORDER_CONSENT_KEYS } = consents;
const snake = (k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

test("DEV-138 AC-08-1: server Consents fields match ORDER_CONSENT_KEYS in order", async () => {
  const src = await readFile("server/app/orders/schemas.py", "utf8");
  const body = src.match(/^class Consents\(CamelModel\):\n([\s\S]*?)\n(?=\S)/m)?.[1];
  assert.ok(body, "class Consents in server/app/orders/schemas.py");
  const fields = [...body.matchAll(/^ {4}(\w+): bool\b/gm)].map((m) => m[1]);
  assert.deepEqual(fields, ORDER_CONSENT_KEYS.map(snake));
});

test("DEV-138 AC-08-1: server checks every consent and says the right count", async () => {
  const src = await readFile("server/app/orders/service.py", "utf8");
  const check = src.match(/c = body\.consents\n\s+if not \(([\s\S]*?)\):/)?.[1];
  assert.ok(check, "consent check in server/app/orders/service.py");
  const checked = [...check.matchAll(/c\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...checked].sort(), ORDER_CONSENT_KEYS.map(snake).sort());
  assert.ok(src.includes(`예약 전 확인 ${ORDER_CONSENT_KEYS.length}개에 모두 동의해 주세요`));
});

test("DEV-138 AC-08-1: count helpers follow the key list", () => {
  const none = consents.orderConsents(false);
  const all = consents.orderConsents(true);
  assert.deepEqual(Object.keys(none), [...ORDER_CONSENT_KEYS]);
  assert.equal(consents.agreedCount(none), 0);
  assert.equal(consents.agreedCount(all), ORDER_CONSENT_KEYS.length);
  assert.equal(consents.allOrderConsents(all), true);
  // 하나라도 빠지면 예약할 수 없다
  for (const k of ORDER_CONSENT_KEYS) {
    const partial = { ...all, [k]: false };
    assert.equal(consents.agreedCount(partial), ORDER_CONSENT_KEYS.length - 1);
    assert.equal(consents.allOrderConsents(partial), false, k);
  }
  assert.equal(consents.allOrderConsents(undefined), false);
});
