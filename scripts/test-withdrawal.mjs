// DEV-94 (AC-01-20): Mock이 서버와 같은 회원 탈퇴 규칙을 따르는지 확인한다
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { once } from "node:events";

// 서버 accounts.schemas.CONSENT_VERSION과 같은 값(test-legal.mjs가 셋이 같은지 본다)
const CONSENT_VERSION = "2026-10-24";

test("AC-01-20: Mock withdrawal blocks open orders, erases the account and frees the Kakao id", async () => {
  const dir = mkdtempSync(path.resolve(".expo/withdrawal-test-"));
  const port = 18085,
    base = "http://127.0.0.1:" + port;
  const child = spawn(process.execPath, ["scripts/mock-server.mjs"], {
    env: { ...process.env, FARMCLUB_MOCK_PORT: String(port), FARMCLUB_MOCK_DIR: dir },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  await Promise.race([
    once(child.stdout, "data"),
    once(child, "exit").then(() => {
      throw new Error("Mock server exited");
    }),
  ]);
  let n = 0;
  async function api(method, url, token, body) {
    const r = await fetch(base + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `wd-${++n}`,
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  }
  // 카카오 새 사용자는 필수 약관에 동의해야 계정이 생긴다(DEV-132)
  const kakao = async () => {
    const r = await api("POST", "/api/auth/kakao", null, {
      code: "mock",
      redirectUri: "http://localhost:8081/auth/kakao",
      app: "consumer",
    });
    if (!r.body.signup) return r;
    return api("POST", "/api/auth/kakao/signup", null, {
      signupToken: r.body.signup.signupToken,
      consents: ["TERMS", "PRIVACY", "AGE14"].map((kind) => ({ kind, version: CONSENT_VERSION })),
    });
  };
  const followers = async () =>
    (await api("GET", "/api/farms/f-kang", null)).body.followerCount;
  try {
    const first = await kakao();
    const t = first.body.accessToken;
    const uid = first.body.user.userId;
    await api("PATCH", "/api/auth/me", t, { nickname: "귤러버", name: "박현", phone: "010-2345-6789" });
    const before = await followers();
    assert.equal((await api("PUT", "/api/farms/f-kang/follow", t)).status, 200);
    assert.equal(await followers(), before + 1);

    // 끝나지 않은 주문이 있으면 막힌다
    const order = await api("POST", "/api/orders", t, {
      productId: "p-house",
      optionId: "opt-5",
      quantity: 1,
      recipientName: "박현",
      recipientPhone: "010-2345-6789",
      postalCode: "06236",
      address: "서울 강남구 테헤란로 1",
      consents: { deliveryWindow: true, delayRefund: true, shortage: true, cancelPolicy: true, thirdParty: true },
      consentVersion: "policy-2026-10-23",
    });
    assert.equal(order.status, 200);
    const blocked = await api("POST", "/api/auth/me/withdraw", t);
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.details.reason, "WITHDRAW_BLOCKED");
    assert.deepEqual(blocked.body.details.orderNos, [order.body.orderNo]);

    await api("POST", `/api/orders/${order.body.orderId}/deposit`, t, {});
    assert.equal((await api("POST", `/api/orders/${order.body.orderId}/cancel`, t)).status, 200);
    assert.equal((await api("POST", "/api/auth/me/withdraw", t)).status, 204);
    assert.equal((await api("GET", "/api/auth/me", t)).status, 401);
    assert.equal(await followers(), before);

    // 같은 카카오로 다시 오면 새 사용자(가입 동의부터, 지난 주문·팔로우 없음)
    const probe = await api("POST", "/api/auth/kakao", null, {
      code: "mock",
      redirectUri: "http://localhost:8081/auth/kakao",
      app: "consumer",
    });
    assert.equal(probe.body.user, null);
    const again = await kakao();
    assert.equal(again.body.user.userId, uid);
    assert.equal(again.body.user.nickname, null);
    assert.equal(again.body.user.needsOnboarding, true);
    const mine = await api("GET", "/api/orders", again.body.accessToken);
    assert.equal((mine.body.items ?? mine.body).length, 0);

    // 테스트 계정은 탈퇴할 수 없다
    const minji = await api("POST", "/api/auth/test-login", null, { userId: "u-minji", app: "consumer" });
    const denied = await api("POST", "/api/auth/me/withdraw", minji.body.accessToken);
    assert.equal(denied.status, 403);
    assert.equal(denied.body.details.reason, "TEST_ACCOUNT");
  } finally {
    const exit = once(child, "exit");
    child.kill();
    await exit;
  }
});
