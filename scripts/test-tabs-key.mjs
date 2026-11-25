// DEV-481: 소비자 탭 레이아웃 key. 계정이 바뀔 때만 바뀌고, 저장된 토큰을 auth/me로 확인하는 것으로는 안 바뀐다.
import assert from "node:assert/strict";
import { test } from "node:test";

import { TabsKey } from "../apps/consumer/src/lib/tabsKey.ts";

test("DEV_481 relaunch with a saved token: the first confirmation of A keeps the key (taps before auth/me survive)", () => {
  const tabs = new TabsKey();
  const first = tabs.key;
  assert.equal(tabs.confirm("user-a"), first);
});

test("DEV_481 confirming A again (after a transient auth/me failure) keeps the key", () => {
  const tabs = new TabsKey();
  const before = tabs.confirm("user-a");
  // 실패는 TabsKey에 아무것도 알리지 않는다(세션이 user만 숨김). 다시 읽어 확인
  assert.equal(tabs.confirm("user-a"), before);
});

test("DEV_481 A confirmed, then B confirmed without an auth event (another browser tab switched accounts) → +1", () => {
  const tabs = new TabsKey();
  const a = tabs.confirm("user-a");
  assert.equal(tabs.confirm("user-b"), a + 1);
  // B를 다시 확인해도 더 바뀌지 않는다
  assert.equal(tabs.confirm("user-b"), a + 1);
});

test("DEV_481 token replaced with a notice, then B confirmed → changes once, not twice", () => {
  const tabs = new TabsKey();
  const a = tabs.confirm("user-a");
  const replaced = tabs.authChanged("token-b");
  assert.equal(replaced, a + 1);
  assert.equal(tabs.confirm("user-b"), replaced);
});

test("DEV_481 guest logs in → new key (tab state of the guest is dropped), then confirming the user keeps it", () => {
  const tabs = new TabsKey();
  const guest = tabs.key;
  const signedIn = tabs.authChanged("token-a");
  assert.notEqual(signedIn, guest);
  assert.equal(tabs.confirm("user-a"), signedIn);
});

test("DEV_481 logout after a confirmed user → new key", () => {
  const tabs = new TabsKey();
  const signedIn = tabs.confirm("user-a");
  assert.notEqual(tabs.authChanged(null), signedIn);
});

test("DEV_481 account switch A → logout → B changes the key at each auth event, and confirming B adds nothing", () => {
  const tabs = new TabsKey();
  tabs.authChanged("token-a");
  const a = tabs.confirm("user-a");
  const out = tabs.authChanged(null);
  assert.notEqual(out, a);
  const b = tabs.authChanged("token-b");
  assert.notEqual(b, out);
  assert.equal(tabs.confirm("user-b"), b);
});

test("DEV_481 token replaced for the same user (password change) → new key, as before", () => {
  const tabs = new TabsKey();
  const before = tabs.confirm("user-a");
  const after = tabs.authChanged("token-a2");
  assert.notEqual(after, before);
  assert.equal(tabs.confirm("user-a"), after);
});

test("DEV_481 expired token on launch (401 before any confirmed user) keeps the key, like the old guest key did", () => {
  const tabs = new TabsKey();
  const launch = tabs.key;
  assert.equal(tabs.authChanged(null), launch);
});

test("DEV_481 a 401 after the user was confirmed (token expired while using) → new key", () => {
  const tabs = new TabsKey();
  const before = tabs.confirm("user-a");
  assert.notEqual(tabs.authChanged(null), before);
  // 지운 뒤 한 번 더 지움 알림이 와도(로그아웃 버튼 + 401) 더 바뀌지 않는다
  const after = tabs.key;
  assert.equal(tabs.authChanged(null), after);
});

test("DEV_481 confirmation belongs to one token: confirmed A, then login B unconfirmed, then B cleared → key kept", () => {
  const tabs = new TabsKey();
  tabs.confirm("user-a");
  const b = tabs.authChanged("token-b");
  // B는 아직 확인 전. B 토큰이 지워져도 B 화면을 확인한 적이 없으니 그대로
  assert.equal(tabs.authChanged(null), b);
});
