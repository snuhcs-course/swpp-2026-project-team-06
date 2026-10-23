// FEAT-01 I2 (DEV-32): Mock이 서버와 같은 온보딩·배송지 규칙을 따르는지 확인한다(AC-01-12~15)
// DEV-113: 약관 버전 재동의(AC-01-17)와 생산자 동의(AC-01-18)도 서버와 같다
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { once } from "node:events";

// 서버 accounts.schemas.CONSENT_VERSION과 같은 값(test-legal.mjs가 셋이 같은지 본다)
const CONSENT_VERSION = "2026-10-24";

test("AC-01-12~15: Mock onboarding gate, consents and 50-address limit", async () => {
  const dir = mkdtempSync(path.resolve(".expo/onboarding-test-"));
  const port = 18084,
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
        "Idempotency-Key": `onb-${++n}`,
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  }
  try {
    const kakao = await api("POST", "/api/auth/kakao", null, {
      code: "mock",
      redirectUri: "http://localhost:8081/auth/kakao",
      app: "consumer",
    });
    assert.equal(kakao.status, 200);
    // 새 사용자는 계정 없이 가입 토큰만 받고, 필수 약관에 동의해야 계정이 생긴다(DEV-132, AC-01-19)
    assert.equal(kakao.body.user, null);
    const signupToken = kakao.body.signup.signupToken;
    const required = ["TERMS", "PRIVACY", "AGE14"].map((kind) => ({ kind, version: CONSENT_VERSION }));
    const noAge = await api("POST", "/api/auth/kakao/signup", null, {
      signupToken,
      consents: required.filter((c) => c.kind !== "AGE14"),
    });
    assert.equal(noAge.status, 400);
    assert.ok(noAge.body.details.fields.consents);
    const badToken = await api("POST", "/api/auth/kakao/signup", null, { signupToken: "forged", consents: required });
    assert.equal(badToken.status, 400);
    assert.ok(badToken.body.details.fields.signupToken);
    const signed = await api("POST", "/api/auth/kakao/signup", null, { signupToken, consents: required });
    assert.equal(signed.status, 200);
    const t = signed.body.accessToken;
    assert.equal(signed.body.user.needsOnboarding, true);
    assert.equal(signed.body.user.consentRequired, false);
    assert.equal(signed.body.user.isTestAccount, false);
    // 이미 가입했으면 카카오 로그인이 바로 로그인된다
    const again = await api("POST", "/api/auth/kakao", null, {
      code: "mock",
      redirectUri: "http://localhost:8081/auth/kakao",
      app: "consumer",
    });
    assert.equal(again.body.user.userId, signed.body.user.userId);

    // 농가에 닿는 쓰기는 온보딩 전 403 ONBOARDING_REQUIRED (좋아요는 PUT)
    for (const [method, url, body] of [
      ["PUT", "/api/farms/f-kang/follow"],
      ["PUT", "/api/messaging/news/n-1/reaction"],
      ["POST", "/api/messaging/chats", { farmId: "f-kang" }],
      ["POST", "/api/messaging/rooms/f-kang/messages", { text: "안녕하세요" }],
    ]) {
      const r = await api(method, url, t, body);
      assert.equal(r.status, 403, url);
      assert.equal(r.body.details.reason, "ONBOARDING_REQUIRED", url);
    }
    // 조회·배송지는 된다
    assert.equal((await api("GET", "/api/auth/me/addresses", t)).status, 200);

    assert.equal(
      (await api("PATCH", "/api/auth/me", t, { nickname: "귤", name: "김", phone: "1" })).status,
      400,
    );
    // 옛 약관 버전 동의로는 끝나지 않는다(DEV-113, AC-01-17)
    const consents = await api("POST", "/api/auth/me/consents", t, {
      consents: ["TERMS", "PRIVACY", "AGE14"].map((kind) => ({ kind, version: "2026-10-18" })),
    });
    assert.equal(consents.status, 200);
    assert.equal(consents.body.length, 3);
    const me = await api("PATCH", "/api/auth/me", t, {
      nickname: "귤러버",
      name: "박현",
      phone: "010-2345-6789",
    });
    assert.equal(me.status, 200);
    assert.equal(me.body.needsOnboarding, true);
    assert.equal(me.body.consentRequired, true);
    assert.equal((await api("PUT", "/api/farms/f-kang/follow", t)).status, 403);
    await api("POST", "/api/auth/me/consents", t, {
      consents: ["TERMS", "PRIVACY", "AGE14"].map((kind) => ({ kind, version: CONSENT_VERSION })),
    });
    const agreed = await api("GET", "/api/auth/me", t);
    assert.equal(agreed.body.needsOnboarding, false);
    assert.equal(agreed.body.consentRequired, false);

    // 주문은 개인정보 제3자 제공(판매자) 동의까지 5개가 모두 있어야 한다(DEV-120, 서버 AC-08-7과 같은 규칙)
    const four = { deliveryWindow: true, delayRefund: true, shortage: true, cancelPolicy: true };
    const order = (consents) =>
      api("POST", "/api/orders", t, {
        productId: "p-house",
        optionId: "opt-5",
        quantity: 1,
        recipientName: "박현",
        recipientPhone: "010-2345-6789",
        postalCode: "06236",
        address: "서울 강남구 테헤란로 1",
        consents,
        consentVersion: "policy-2026-10-23",
      });
    const noThirdParty = await order(four);
    assert.equal(noThirdParty.status, 400);
    assert.ok(noThirdParty.body.details.fields.consents);
    assert.equal((await order({ ...four, thirdParty: true })).status, 200);
    assert.equal((await api("PUT", "/api/farms/f-kang/follow", t)).status, 200);

    // 생산자 앱 카카오(DEV-74): 농가 없는 생산자 → 온보딩 없음 → 가입 신청 → 확인 중
    const farm = await api("POST", "/api/auth/kakao", null, {
      code: "mock",
      redirectUri: "http://localhost:8082/auth/kakao",
      app: "producer",
    });
    assert.equal(farm.status, 200);
    // 생산자도 약관·개인정보에 동의해야 계정이 생긴다(AC-01-18·19)
    assert.equal(farm.body.user, null);
    const farmSignup = await api("POST", "/api/auth/kakao/signup", null, {
      signupToken: farm.body.signup.signupToken,
      consents: ["TERMS", "PRIVACY"].map((kind) => ({ kind, version: CONSENT_VERSION })),
    });
    assert.equal(farmSignup.status, 200);
    farm.body = farmSignup.body;
    assert.equal(farm.body.user.role, "PRODUCER");
    assert.equal(farm.body.user.farmStatus, "NONE");
    assert.equal(farm.body.user.needsOnboarding, false);
    // 가입 뒤 약관 버전이 바뀐 것처럼 옛 버전으로 돌리면 생산자 API가 막힌다
    await api("POST", "/api/auth/me/consents", farm.body.accessToken, {
      consents: ["TERMS", "PRIVACY"].map((kind) => ({ kind, version: "2026-10-18" })),
    });
    const application = {
      ownerName: "김새농",
      farmName: "카카오 농장",
      region: "제주 서귀포시",
      mainItems: "감귤",
      phone: "010-9876-5432",
    };
    const blocked = await api("POST", "/api/auth/producer-application", farm.body.accessToken, application);
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.details.reason, "CONSENT_REQUIRED");
    const farmConsents = await api("POST", "/api/auth/me/consents", farm.body.accessToken, {
      consents: ["TERMS", "PRIVACY"].map((kind) => ({ kind, version: CONSENT_VERSION })),
    });
    assert.equal(farmConsents.status, 200);
    const applied = await api("POST", "/api/auth/producer-application", farm.body.accessToken, application);
    assert.equal(applied.status, 200);
    assert.equal(applied.body.status, "PENDING");
    const farmMe = await api("GET", "/api/auth/me", farm.body.accessToken);
    assert.equal(farmMe.body.name, "김새농");

    // 테스트 계정은 온보딩 대상이 아니다
    const minji = await api("POST", "/api/auth/test-login", null, { userId: "u-minji", app: "consumer" });
    assert.equal(minji.body.user.needsOnboarding, false);
    assert.equal(minji.body.user.consentRequired, false);

    // 배송지 50개, 51번째는 409, 기본을 지우면 가장 최근 것이 기본
    const addr = (i) => ({
      recipientName: "박현",
      recipientPhone: "010-2345-6789",
      postalCode: "63584",
      address: `제주 서귀포시 통합로 ${i}`,
    });
    for (let i = 0; i < 50; i++)
      assert.equal((await api("POST", "/api/auth/me/addresses", t, addr(i))).status, 200);
    const over = await api("POST", "/api/auth/me/addresses", t, addr(99));
    assert.equal(over.status, 409);
    assert.equal(over.body.details.reason, "ADDRESS_LIMIT");
    const list = (await api("GET", "/api/auth/me/addresses", t)).body;
    const def = list.find((a) => a.isDefault);
    assert.equal(
      (await api("PATCH", `/api/auth/me/addresses/${def.addressId}`, t, { recipientPhone: "x" })).status,
      400,
    );
    assert.equal((await api("DELETE", `/api/auth/me/addresses/${def.addressId}`, t)).status, 204);
    const after = (await api("GET", "/api/auth/me/addresses", t)).body;
    assert.equal(after.length, 49);
    assert.equal(after.filter((a) => a.isDefault).length, 1);
    assert.equal(after[after.length - 1].isDefault, true);
  } finally {
    const exit = once(child, "exit");
    child.kill();
    await exit;
  }
});
