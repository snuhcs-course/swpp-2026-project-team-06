// DEV-378 (FEAT-01 AC-01-35): 로그인 화면은 카카오 설정 조회를 시간 제한 안에서만 기다린다.
// 넘으면 실패로 끝나 화면이 "설정 못 읽음" 분기(아이디 칸 펼침, 링크 없음)로 간다. 제때 온 값·오류는 그대로 넘긴다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LOGIN_CONFIG_TIMEOUT_MS, withTimeout } from "../packages/ui/src/timeout.ts";

test("AC_01_35 login config wait is a few seconds", () => {
  assert.ok(LOGIN_CONFIG_TIMEOUT_MS >= 2000 && LOGIN_CONFIG_TIMEOUT_MS <= 10000);
});

test("AC_01_35 a config that never answers fails after the limit", async () => {
  const started = Date.now();
  await assert.rejects(withTimeout(new Promise(() => {}), 50), /timeout/);
  assert.ok(Date.now() - started >= 45);
});

test("AC_01_35 a config that answers in time passes through", async () => {
  const cfg = { enabled: true, clientId: "x", redirectPath: "/auth/kakao" };
  assert.deepEqual(await withTimeout(Promise.resolve(cfg), 50), cfg);
});

test("AC_01_35 a config error passes through unchanged", async () => {
  const err = Object.assign(new Error("server"), { status: 500 });
  await assert.rejects(withTimeout(Promise.reject(err), 50), (e) => e === err);
});
