// DEV-494 재동의(약관 버전 변경) 대기 중 요청 폭주 회귀 테스트.
// 소비자 앱에서 재동의가 필요한 계정이면 탭 레이아웃의 채팅 배지 effect가 `[user]`에 걸려 있어
// 배지 요청 403 ONBOARDING_REQUIRED → 세션이 내 정보 다시 읽기(새 객체) → effect 다시 실행 → 또 403 …이
// 초당 약 10번 돌았다(로컬 서버·에뮬레이터 실측). 고친 것:
//   1. 세션은 내용이 같은 내 정보를 같은 객체로 둔다(keepUser).
//   2. 탭 배지는 관문(비밀번호 변경·온보딩·재동의) 중에는 읽지 않고, effect 의존값은 원시값만 쓴다(accountGated).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const { keepUser, accountGated } = require("../.expo/mock-build/packages/api/src/userState.js");

const me = (extra = {}) => ({ userId: "u-1", role: "CONSUMER", nickname: "귤", consentRequired: true, ...extra });

test("DEV-494 keepUser: 같은 내용이면 이전 객체를 그대로, 바뀌면 새 객체", () => {
  const a = me();
  assert.equal(keepUser(a, me()), a, "403마다 다시 읽어도 같은 객체라 [user] effect가 다시 돌지 않는다");
  const b = me({ consentRequired: false });
  assert.equal(keepUser(a, b), b);
  assert.equal(keepUser(null, a), a);
  assert.equal(keepUser(a, null), null);
});

test("DEV-494 accountGated: 관문 중이면 배지 같은 주기 요청을 쉰다", () => {
  assert.equal(accountGated(null), false);
  assert.equal(accountGated(me({ consentRequired: false })), false);
  assert.equal(accountGated(me()), true);
  assert.equal(accountGated(me({ consentRequired: false, needsOnboarding: true })), true);
  assert.equal(accountGated(me({ consentRequired: false, mustChangePassword: true })), true);
});

test("DEV-494 고리 흉내: 403마다 내 정보를 다시 읽어도 배지 effect는 한 번만 돈다", () => {
  // effect는 의존값이 바뀔 때만 다시 돈다(React와 같은 비교: Object.is)
  const run = (deps, rounds) => {
    let user = null, prev = null, runs = 0, requests = 0;
    const refresh = () => { user = keepUser(user, me()); };
    refresh();
    for (let i = 0; i < rounds; i++) {
      const d = deps(user);
      if (!prev || d.some((v, k) => !Object.is(v, prev[k]))) {
        runs++;
        prev = d;
        if (!accountGated(user)) { requests++; refresh(); } // 고친 배지: 관문 중엔 요청 없음
      }
    }
    return { runs, requests };
  };
  const fixed = run((u) => [u?.userId ?? null, !!u && !accountGated(u)], 50);
  assert.deepEqual(fixed, { runs: 1, requests: 0 });
});

// 탭 레이아웃의 배지 effect가 user 객체 자체에 걸리면 다시 고리가 생긴다
function effectDeps(rel) {
  const src = readFileSync(path.join(root, rel), "utf8");
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out = [];
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "useEffect" && n.arguments[1] &&
      ts.isArrayLiteralExpression(n.arguments[1]))
      out.push(n.arguments[1].elements.map((e) => e.getText(sf)));
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

test("DEV-494 두 앱 탭 레이아웃의 effect는 user 객체를 의존값으로 쓰지 않는다", () => {
  for (const rel of ["apps/consumer/src/app/(tabs)/_layout.tsx", "apps/producer/src/app/(tabs)/_layout.tsx"]) {
    const deps = effectDeps(rel);
    assert.ok(deps.length > 0, rel);
    for (const d of deps) assert.ok(!d.includes("user"), `${rel}: [${d.join(", ")}]`);
    assert.match(readFileSync(path.join(root, rel), "utf8"), /accountGated\(user\)/, `${rel}: 관문 중 배지 쉼`);
  }
});

test("DEV-494 두 앱 세션은 다시 읽은 내 정보를 keepUser로 넣는다", () => {
  for (const rel of ["apps/consumer/src/lib/session.tsx", "apps/producer/src/lib/session.tsx"]) {
    const src = readFileSync(path.join(root, rel), "utf8");
    assert.match(src, /setUser\(\(old\) => keepUser\(old, u\)\)/, rel);
    assert.doesNotMatch(src, /setUser\(u\)/, rel);
  }
});
