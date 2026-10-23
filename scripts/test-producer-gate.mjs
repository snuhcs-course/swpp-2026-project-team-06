// 생산자 앱 세션 관문(apps/producer/src/lib/gate.ts) — 카카오 복귀 뒤 농가 상태별 첫 화면 (AC-01-3, AC-01-16, DEV-108)
import assert from "node:assert/strict";
import { test } from "node:test";
import { homeFor } from "../apps/producer/src/lib/gate.ts";

const producer = (farmStatus) => ({
  userId: "u-test",
  name: "테스트",
  role: "PRODUCER",
  farmId: farmStatus === "NONE" ? null : "f-test",
  farmStatus,
});

const homes = [
  ["APPROVED", "/"],
  ["PENDING", "/pending"],
  ["REJECTED", "/pending"],
  ["NONE", "/apply"],
  ["SUSPENDED", "/suspended"],
];

test("AC-01-16: logged-in producers never stay on /auth/kakao or /login", () => {
  for (const [status, home] of homes) {
    const g = homeFor(producer(status));
    assert.equal(g.home, home, status);
    for (const p of ["/auth/kakao", "/login"])
      assert.equal(g.allowed(p), false, `${status} ${p}`);
    assert.equal(g.allowed(home), true, `${status} home`);
  }
});

test("AC-01-3: signed-out users only reach /login and /auth/kakao", () => {
  const g = homeFor(null);
  assert.equal(g.home, "/login");
  assert.equal(g.allowed("/login"), true);
  assert.equal(g.allowed("/auth/kakao"), true);
  for (const p of ["/", "/apply", "/pending", "/products"])
    assert.equal(g.allowed(p), false, p);
});

test("AC-01-3: approved farms reach app screens but not pre-approval screens", () => {
  const g = homeFor(producer("APPROVED"));
  for (const p of ["/", "/products", "/chats", "/ship"]) assert.equal(g.allowed(p), true, p);
  for (const p of ["/apply", "/pending", "/suspended"]) assert.equal(g.allowed(p), false, p);
});
