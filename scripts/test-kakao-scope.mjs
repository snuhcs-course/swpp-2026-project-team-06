// DEV-78 카카오 인가 요청 동의 항목(scope) — 소비자·생산자 앱의 웹·네이티브 네 곳이 같은 값을 보내는지 본다.
// 카카오 인가 요청의 scope는 동의 항목 ID를 쉼표로 잇는다(developers.kakao.com 카카오 로그인 REST API, 인가 코드 받기).
// 콘솔에서 필수 동의로 켠 항목은 account_email·phone_number 둘뿐이다. 이름(name)은 신청하지 않아 넣으면 로그인이 실패한다.
import assert from "node:assert/strict";
import { test } from "node:test";

const EXPECTED = ["account_email", "phone_number"];
const config = { enabled: true, clientId: "kakao-test-key", redirectPath: "/auth/kakao" };

function withBrowser(run) {
  const data = new Map();
  const storage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  const saved = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  globalThis.window = { location: { origin: "http://localhost:8081" } };
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get: () => storage });
  try {
    return run();
  } finally {
    delete globalThis.window;
    if (saved) Object.defineProperty(globalThis, "sessionStorage", saved);
    else delete globalThis.sessionStorage;
  }
}

function assertScope(raw, where) {
  const url = new URL(raw);
  const scope = url.searchParams.get("scope");
  assert.deepEqual(scope.split(","), EXPECTED, `${where}: 쉼표로 이은 두 항목`);
  assert.ok(!scope.includes(" "), `${where}: 공백 구분이 아니다`);
  assert.ok(!scope.split(",").includes("name"), `${where}: 이름은 요청하지 않는다`);
  // URLSearchParams는 쉼표를 %2C로 보낸다. 카카오는 쿼리 값을 디코딩해 읽는다
  assert.match(url.search, /[?&]scope=account_email%2Cphone_number(&|$)/, where);
}

test("AC-01-8 DEV-78: consumer web Kakao authorize URL asks for email and phone", async () => {
  const web = await import("../apps/consumer/src/lib/kakao.ts");
  assert.equal(web.KAKAO_SCOPE, EXPECTED.join(","));
  withBrowser(() => assertScope(web.beginKakaoLogin(config, "/", null), "consumer web"));
});

test("AC-01-8 DEV-78: consumer native Kakao authorize URL asks for email and phone", async () => {
  const native = await import("../apps/consumer/src/lib/kakao.native.ts");
  assert.equal(native.KAKAO_SCOPE, EXPECTED.join(","));
  assertScope(native.beginKakaoLogin(config, "/", null), "consumer native");
  native.takeKakaoReturn();
});

test("AC-01-16 DEV-78: producer web Kakao authorize URL asks for email and phone", async () => {
  const web = await import("../apps/producer/src/lib/kakao.ts");
  assert.equal(web.KAKAO_SCOPE, EXPECTED.join(","));
  withBrowser(() => assertScope(web.beginKakaoLogin(config), "producer web"));
});

test("AC-01-16 DEV-78: producer native Kakao authorize URL asks for email and phone", async () => {
  const native = await import("../apps/producer/src/lib/kakao.native.ts");
  assert.equal(native.KAKAO_SCOPE, EXPECTED.join(","));
  assertScope(native.beginKakaoLogin(config), "producer native");
  native.takeKakaoNonce();
});
