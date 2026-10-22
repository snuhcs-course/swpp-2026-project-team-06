// 생산자 앱 카카오 왕복 state(apps/producer/src/lib/kakao.ts) — 일회용 state 저장·꺼내기와 인가 주소 (AC-01-16, DEV-74, DEV-118)
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KAKAO_AUTHORIZE_URL,
  beginKakaoLogin,
  kakaoRedirectUri,
  takeKakaoNonce,
} from "../apps/producer/src/lib/kakao.ts";

const config = { clientId: "kakao-test-key", redirectPath: "/auth/kakao" };
const origin = "http://localhost:8082";

// 브라우저 대신 window.location·sessionStorage만 흉내 낸다
function memoryStorage(fail = {}) {
  const data = new Map();
  return {
    getItem(k) {
      if (fail.get) throw new Error("get");
      return data.has(k) ? data.get(k) : null;
    },
    setItem(k, v) {
      if (fail.set) throw new Error("set");
      data.set(k, String(v));
    },
    removeItem(k) {
      data.delete(k);
    },
  };
}

function withBrowser(storage, run) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  globalThis.window = { location: { origin } };
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    get: typeof storage === "function" ? storage : () => storage,
  });
  try {
    return run();
  } finally {
    delete globalThis.window;
    if (saved) Object.defineProperty(globalThis, "sessionStorage", saved);
    else delete globalThis.sessionStorage;
  }
}

test("AC-01-16: producer redirect URI is this app's /auth/kakao", () => {
  withBrowser(memoryStorage(), () => {
    assert.equal(kakaoRedirectUri(config), `${origin}/auth/kakao`);
  });
});

test("AC-01-16: login start stores a one-time state that matches the authorize URL", () => {
  withBrowser(memoryStorage(), () => {
    const url = new URL(beginKakaoLogin(config));
    assert.equal(`${url.origin}${url.pathname}`, KAKAO_AUTHORIZE_URL);
    assert.equal(url.searchParams.get("client_id"), config.clientId);
    assert.equal(url.searchParams.get("redirect_uri"), `${origin}/auth/kakao`);
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("scope"), "account_email");
    const state = url.searchParams.get("state");
    assert.ok(state);
    // 돌아와서 한 번 꺼내면 지워진다(같은 복귀 주소를 다시 열어도 재사용 불가)
    assert.equal(takeKakaoNonce(), state);
    assert.equal(takeKakaoNonce(), null);
  });
});

test("AC-01-16: each login start issues a new state", () => {
  withBrowser(memoryStorage(), () => {
    const a = new URL(beginKakaoLogin(config)).searchParams.get("state");
    const b = new URL(beginKakaoLogin(config)).searchParams.get("state");
    assert.notEqual(a, b);
    assert.equal(takeKakaoNonce(), b);
  });
});

test("AC-01-11: no Kakao key means no login URL", () => {
  withBrowser(memoryStorage(), () => {
    assert.equal(beginKakaoLogin({ ...config, clientId: "" }), null);
    assert.equal(takeKakaoNonce(), null);
  });
});

test("AC-01-16: unusable sessionStorage fails closed instead of throwing", () => {
  // 저장소 없음(서버 렌더링·구형 브라우저)
  withBrowser(undefined, () => {
    assert.equal(beginKakaoLogin(config), null);
    assert.equal(takeKakaoNonce(), null);
  });
  // 접근 자체가 막힘(사파리 사생활 보호 등)
  withBrowser(
    () => {
      throw new Error("SecurityError");
    },
    () => {
      assert.equal(beginKakaoLogin(config), null);
      assert.equal(takeKakaoNonce(), null);
    },
  );
  // 쓰기·읽기 실패(저장 공간 초과 등)
  withBrowser(memoryStorage({ set: true }), () => {
    assert.equal(beginKakaoLogin(config), null);
  });
  withBrowser(memoryStorage({ get: true }), () => {
    assert.equal(takeKakaoNonce(), null);
  });
});
