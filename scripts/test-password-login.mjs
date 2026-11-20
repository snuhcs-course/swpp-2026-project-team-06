// DEV-363 (FEAT-01 AC-01-22~32): Mock이 서버와 같은 아이디·비밀번호 규칙을 따르는지 확인한다.
// 공개 가입은 없다(PM 11/18). 운영자가 만든 계정(Mock에는 관리자 화면이 없어 저장소에 넣는다)으로
// 임시 비밀번호 로그인 → 비밀번호 변경 관문 → 필수 동의 관문 → 사용, 로그인 한 문구, 10번 실패 잠금(429),
// 비밀번호 변경·토큰 끊기, 탈퇴 시 아이디 해제. 원문 비밀번호가 Mock 저장소에 남지 않는지도 본다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

import {
  passwordError,
  usernameError,
  normalizeUsername,
  retryMinutes,
} from "../.expo/mock-build/packages/api/src/passwordRules.js";

// 서버 없이 Mock 전송(브라우저 Mock과 같은 코드)을 바로 부른다. 저장소는 메모리
const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const mockDb = require("../.expo/mock-build/packages/api/src/mock/db.js");
const { mockPasswordHash } = require("../.expo/mock-build/packages/api/src/mock/auth.js");
let stored = null;
mockDb.configureMockStorage({ read: () => stored, write: (v) => (stored = v) });

const CONSENT_VERSION = "2026-11-20";
const CONSENTS = ["TERMS", "PRIVACY", "AGE14"].map((kind) => ({ kind, version: CONSENT_VERSION }));
const TEMP = "Tmp7KpQr2Xyz";
const PASSWORD = "Gamgyul-Sweet-77";
const NEW_PASSWORD = "Hallabong-Brix-14";

test("AC-01-22: shared username/password rules match the server", () => {
  assert.equal(normalizeUsername("  Mandarin7 "), "mandarin7");
  assert.notEqual(normalizeUsername("Kakaofan1"), "kakaofan1");
  assert.equal(usernameError("mandarin7"), null);
  for (const bad of ["abc", "1abc", "ab_cd", "a".repeat(21), "admin", ""]) assert.ok(usernameError(bad), bad);
  assert.equal(passwordError(PASSWORD, "mandarin7"), null);
  for (const bad of ["short7!", "x".repeat(129), "        ", "Mandarin7", "password123"])
    assert.ok(passwordError(bad, "mandarin7"), bad);
  assert.equal(retryMinutes(900), 15);
  assert.equal(retryMinutes(undefined), 1);
});

test("AC-01-22~32: Mock operator-created account: temp password → change → consents, lockout, withdrawal", async () => {
  mockDb.reset();
  let n = 0;
  async function api(method, url, token, body) {
    const r = await mockTransport({
      method,
      path: url,
      body,
      headers: { "Idempotency-Key": `pw-${++n}`, ...(token ? { Authorization: "Bearer " + token } : {}) },
    });
    return { status: r.status, body: r.body, text: JSON.stringify(r.body ?? null) };
  }
  // 운영자가 만든 계정(서버 POST /admin/id-accounts와 같은 모양)
  const db = mockDb.db();
  db.users["u-pw-1"] = {
    userId: "u-pw-1",
    name: "",
    role: "CONSUMER",
    farmId: null,
    nickname: "귤친구",
    phone: "010-3456-7890",
    consents: [],
    username: "mandarin7",
    passwordHash: mockPasswordHash(TEMP),
    mustChangePassword: true,
  };
  mockDb.save();

  // 공개 가입은 없다
  assert.equal((await api("POST", "/api/auth/signup", null, { app: "consumer" })).status, 404);
  assert.equal((await api("POST", "/api/auth/username-check", null, { app: "consumer" })).status, 404);

  // AC-01-26·27: 한 문구, 10번 틀리면 잠금
  const bad = await api("POST", "/api/auth/login", null, { app: "consumer", username: "mandarin7", password: "wrong-pass-1" });
  const ghost = await api("POST", "/api/auth/login", null, { app: "consumer", username: "nobody99", password: TEMP });
  assert.equal(bad.status, 401);
  assert.deepEqual(bad.body, ghost.body);
  assert.equal(bad.body.message, "아이디 또는 비밀번호가 맞지 않아요");
  for (let i = 0; i < 9; i++)
    await api("POST", "/api/auth/login", null, { app: "consumer", username: "mandarin7", password: "wrong-pass-1" });
  const locked = await api("POST", "/api/auth/login", null, { app: "consumer", username: "mandarin7", password: TEMP });
  assert.equal(locked.status, 429);
  assert.equal(locked.body.code, "RATE_LIMITED");
  assert.ok(locked.body.details.retryAfter > 0);
  mockDb.db().loginFailures = {};
  mockDb.save();

  // AC-01-31: 임시 비밀번호로 들어오면 비밀번호 변경만
  const first = await api("POST", "/api/auth/login", null, { app: "consumer", username: "MANDARIN7", password: TEMP });
  assert.equal(first.status, 200, first.text);
  assert.equal(first.body.user.mustChangePassword, true);
  assert.equal(first.body.user.isTestAccount, false);
  const t1 = first.body.accessToken;
  assert.equal((await api("GET", "/api/orders", t1)).body.details.reason, "PASSWORD_CHANGE_REQUIRED");
  const wrong = await api("POST", "/api/auth/me/password", t1, { currentPassword: "nope-nope-1", newPassword: PASSWORD });
  assert.equal(wrong.status, 400);
  assert.ok(wrong.body.details.fields.currentPassword);
  const changed = await api("POST", "/api/auth/me/password", t1, { currentPassword: TEMP, newPassword: PASSWORD });
  assert.equal(changed.status, 200, changed.text);
  assert.equal((await api("GET", "/api/auth/me", t1)).status, 401); // 그 전 토큰은 끊긴다
  const t2 = changed.body.accessToken;

  // AC-01-23: 필수 동의 전에는 온보딩만(소비자 ONBOARDING_REQUIRED)
  const me = (await api("GET", "/api/auth/me", t2)).body;
  assert.equal(me.consentRequired, true);
  assert.equal(me.needsOnboarding, true);
  const gated = await api("GET", "/api/orders", t2);
  assert.equal(gated.status, 403);
  assert.equal(gated.body.details.reason, "ONBOARDING_REQUIRED");
  assert.equal((await api("GET", "/api/home", t2)).status, 200);
  assert.equal((await api("POST", "/api/auth/me/consents", t2, { consents: CONSENTS })).status, 200);
  assert.equal((await api("GET", "/api/orders", t2)).status, 200);

  assert.ok(!stored.includes(TEMP) && !stored.includes(PASSWORD), "Mock 저장소에 원문 비밀번호가 없다");

  // AC-01-32: 탈퇴하면 아이디·해시가 지워진다
  assert.equal((await api("POST", "/api/auth/me/withdraw", t2)).status, 204);
  const after = await api("POST", "/api/auth/login", null, { app: "consumer", username: "mandarin7", password: PASSWORD });
  assert.equal(after.status, 401);
  assert.ok(!Object.values(mockDb.db().users).some((u) => u.username === "mandarin7"));
});

test("AC-01-23: Mock producer ID account consents before the farm application", async () => {
  mockDb.reset();
  const db = mockDb.db();
  db.users["u-pw-2"] = {
    userId: "u-pw-2",
    name: "농가 사용자",
    role: "PRODUCER",
    farmId: null,
    phone: "",
    consents: [],
    username: "farmer01",
    passwordHash: mockPasswordHash(PASSWORD),
    mustChangePassword: false,
  };
  mockDb.save();
  const login = await mockTransport({
    method: "POST",
    path: "/api/auth/login",
    body: { app: "producer", username: "farmer01", password: PASSWORD },
    headers: {},
  });
  assert.equal(login.status, 200);
  const token = login.body.accessToken;
  const apply = await mockTransport({
    method: "POST",
    path: "/api/auth/producer-application",
    body: { ownerName: "한라봉", farmName: "한라 감귤밭", region: "제주", mainItems: "감귤", phone: "010-1111-2222" },
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(apply.status, 403);
  assert.equal(apply.body.details.reason, "CONSENT_REQUIRED");
});
