// DEV-33 EAS 네이티브 빌드 설정과 플랫폼 분기. 네이티브 모듈 없이 Node에서 읽을 수 있는 것만 검사한다.
// - app.json·eas.json·public/.well-known·vercel.json(두 앱)
// - 웹 복귀 화면의 앱 전달(appReturnUrl)과 네이티브 kakao 모듈(메모리 저장, 복귀 주소, state 접두어)
// - 공용 패키지(packages/*)에 window·document·localStorage·sessionStorage의 멤버 접근이 웹 전용 파일 밖에 없는지
//   (URL.createObjectURL·FileReader·globalThis 경유는 보지 않는다. RN에서 revokeObjectURL은 no-op, FileReader는 지원)
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");
const json = (p) => JSON.parse(read(p));

const APPS = {
  consumer: { id: "kr.farmclub.consumer", scheme: "farmclub-consumer", host: "farmclub.kr" },
  producer: { id: "kr.farmclub.producer", scheme: "farmclub-producer", host: "farm.farmclub.kr" },
};

for (const [app, { id, scheme, host }] of Object.entries(APPS)) {
  test(`${app} app.json: 식별자·스킴·런타임 버전·네이티브 플러그인`, () => {
    const { expo } = json(`apps/${app}/app.json`);
    assert.equal(expo.ios.bundleIdentifier, id);
    assert.equal(expo.android.package, id);
    assert.equal(expo.scheme, scheme);
    assert.deepEqual(expo.runtimeVersion, { policy: "fingerprint" });
    assert.ok(expo.ios.associatedDomains.includes(`applinks:${host}`));
    assert.equal(expo.web.output, "single", "웹 출력은 그대로 SPA");
    const names = expo.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
    for (const p of ["expo-router", "expo-secure-store", "expo-web-browser", "expo-image-picker"])
      assert.ok(names.includes(p), `plugin ${p}`);
    // eas init·eas update:configure가 쓴 값(2026-10-23, 계정 snu-omm). 서로 같아야 한다
    const projectId = expo.extra?.eas?.projectId;
    assert.match(projectId, /^[0-9a-f-]{36}$/, "extra.eas.projectId");
    assert.equal(expo.updates?.url, `https://u.expo.dev/${projectId}`);
    assert.equal(expo.owner, "snu-omm");
    assert.equal(new Set(expo.ios.associatedDomains).size, expo.ios.associatedDomains.length, "associatedDomains 중복 없음");
  });

  test(`${app} eas.json: 프로필·채널·autoIncrement·서버 주소`, () => {
    const eas = json(`apps/${app}/eas.json`);
    assert.equal(eas.cli.appVersionSource, "remote");
    assert.equal(eas.build.development.developmentClient, true);
    for (const profile of ["preview", "production"]) {
      const b = eas.build[profile];
      assert.equal(b.channel, profile);
      assert.equal(b.autoIncrement, true);
      assert.equal(b.distribution, undefined, "스토어 형식(TestFlight·Play 내부 테스트 제출용)");
      assert.equal(b.env.EXPO_PUBLIC_API_URL, "https://api.farmclub.kr");
      assert.equal(b.env.EXPO_PUBLIC_API_MOCK, "0");
      assert.equal(b.env.EXPO_PUBLIC_CONSUMER_URL, "https://farmclub.kr");
      assert.equal(b.env.EXPO_PUBLIC_PRODUCER_URL, "https://farm.farmclub.kr");
      for (const v of Object.values(b.env)) assert.ok(!/phc_|EXPO_TOKEN|secret/i.test(v), "비밀값 없음");
    }
    assert.ok(eas.submit.preview && eas.submit.production);
    // 내부 테스트(I2): Expo 무료 계정만으로 Android APK·iOS 시뮬레이터 빌드
    const i = eas.build.internal;
    assert.equal(i.extends, "preview");
    assert.equal(i.channel, "preview", "APK·시뮬레이터 빌드도 eas update --channel preview를 받는다");
    assert.equal(i.distribution, "internal");
    assert.equal(i.android.buildType, "apk");
    assert.equal(i.ios.simulator, true);
  });

  test(`${app} public/.well-known: 앱 링크 파일이 JSON이고 식별자가 맞다, vercel.json이 JSON으로 응답`, () => {
    const links = json(`apps/${app}/public/.well-known/assetlinks.json`);
    assert.equal(links[0].target.package_name, id);
    assert.equal(links[0].target.sha256_cert_fingerprints.length, 1);
    const aasa = json(`apps/${app}/public/.well-known/apple-app-site-association`);
    const [appId] = aasa.applinks.details[0].appIDs;
    assert.ok(appId.endsWith(`.${id}`), appId);
    // 앱 링크로 여는 경로는 아직 없다(ADR 0013): 전부 제외. /auth/kakao를 열면 웹 시작 로그인이 앱으로 넘어온다
    assert.ok(aasa.applinks.details[0].components.every((c) => c.exclude === true));
    const manifest = json(`apps/${app}/public/manifest.webmanifest`);
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.scope, "/");
    const vercel = json(`apps/${app}/vercel.json`);
    const wk = vercel.headers.find((h) => h.source === "/.well-known/(.*)");
    assert.ok(wk, "headers에 /.well-known");
    assert.equal(wk.headers.find((h) => h.key === "Content-Type").value, "application/json");
    assert.ok(read(`apps/${app}/public/index.html`).includes('rel="manifest"'));
  });
}

test("AC-01-13 소비자 웹 복귀 화면: 앱에서 시작한 로그인만 앱 스킴으로 넘긴다", async () => {
  const web = await import("../apps/consumer/src/lib/kakao.ts");
  assert.equal(web.appReturnUrl({ code: "c1", state: "app-abc" }), "farmclub-consumer://auth/kakao?code=c1&state=app-abc");
  assert.equal(web.appReturnUrl({ error: "access_denied", state: "app-abc" }), "farmclub-consumer://auth/kakao?state=app-abc&error=access_denied");
  assert.equal(web.appReturnUrl({ code: "c1", state: "abc" }), null, "웹에서 시작한 로그인은 그대로");
  assert.equal(web.appReturnUrl({ code: "c1" }), null);
  assert.deepEqual(web.parseKakaoReturn("farmclub-consumer://auth/kakao?code=c%201&state=app-x#frag"), { code: "c 1", state: "app-x" });
  assert.deepEqual(web.parseKakaoReturn("farmclub-consumer://auth/kakao"), {});
});

test("AC-01-13 소비자 앱(네이티브) kakao: 복귀 주소는 서버 허용값, state는 app- 접두어, 복귀 정보는 한 번만", async () => {
  process.env.EXPO_PUBLIC_CONSUMER_URL = "https://farmclub.kr/";
  const native = await import("../apps/consumer/src/lib/kakao.native.ts");
  const config = { enabled: true, clientId: "kakao-test-key", redirectPath: "/auth/kakao" };
  assert.equal(native.kakaoRedirectUri(config), "https://farmclub.kr/auth/kakao");
  assert.equal(native.kakaoCallbackUri(), "https://farmclub.kr/auth/kakao");
  const url = native.beginKakaoLogin(config, "/products/p1", { action: "reserve", next: "/products/p1", data: {} });
  const q = new URL(url).searchParams;
  assert.equal(q.get("redirect_uri"), "https://farmclub.kr/auth/kakao");
  assert.equal(q.get("client_id"), "kakao-test-key");
  assert.ok(q.get("state").startsWith("app-"));
  const saved = native.takeKakaoReturn();
  assert.equal(saved.nonce, q.get("state"));
  assert.equal(saved.next, "/products/p1");
  assert.equal(saved.resume.action, "reserve");
  assert.equal(native.takeKakaoReturn(), null, "한 번만 꺼낸다");
  assert.equal(native.beginKakaoLogin({ ...config, clientId: null }, "/", null), null);
  assert.equal(native.appReturnUrl({ code: "c", state: "app-x" }), null, "앱 안에서는 넘길 곳이 없다");
});

test("AC-01-16 생산자 웹·앱 kakao: 같은 규칙(스킴 farmclub-producer, 복귀 주소 farm.farmclub.kr)", async () => {
  const web = await import("../apps/producer/src/lib/kakao.ts");
  assert.equal(web.appReturnUrl({ code: "c1", state: "app-abc" }), "farmclub-producer://auth/kakao?code=c1&state=app-abc");
  assert.equal(web.appReturnUrl({ code: "c1", state: "abc" }), null);
  process.env.EXPO_PUBLIC_PRODUCER_URL = "https://farm.farmclub.kr";
  const native = await import("../apps/producer/src/lib/kakao.native.ts");
  const config = { enabled: true, clientId: "kakao-test-key", redirectPath: "/auth/kakao" };
  const url = native.beginKakaoLogin(config);
  const q = new URL(url).searchParams;
  assert.equal(q.get("redirect_uri"), "https://farm.farmclub.kr/auth/kakao");
  assert.ok(q.get("state").startsWith("app-"));
  assert.equal(native.takeKakaoNonce(), q.get("state"));
  assert.equal(native.takeKakaoNonce(), null);
  assert.equal(native.kakaoCallbackUri(), "https://farm.farmclub.kr/auth/kakao");
});

// 웹 전용 전역을 직접 써도 되는 파일(그 밖에는 Platform 분기나 *.native.ts 쌍이 있어야 한다)
const WEB_ONLY_FILES = new Set([
  "packages/api/src/storage.ts", // localStorage 구현(쌍: storage.native.ts)
  "packages/analytics/src/client.ts", // posthog-js(쌍: client.native.ts)
  "packages/ui/src/web.ts", // CSS 도우미(Platform 분기)
]);
const files = (dir) =>
  readdirSync(path.join(root, dir)).flatMap((f) => {
    const rel = `${dir}/${f}`;
    if (statSync(path.join(root, rel)).isDirectory()) return files(rel);
    return /\.tsx?$/.test(f) && !/\.web\.tsx?$/.test(f) ? [rel] : [];
  });
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/`[^`]*`/g, "``").replace(/"[^"\n]*"/g, '""');

test("공용 패키지에 웹 전용 전역 직접 호출이 없다(결정 문서 ‘웹 전용 코드 격리’)", () => {
  const hits = [];
  for (const pkg of ["packages/api/src", "packages/ui/src", "packages/analytics/src"])
    for (const f of files(pkg)) {
      if (WEB_ONLY_FILES.has(f)) continue;
      const code = stripComments(read(f));
      const m = code.match(/(?<![\w.$])(window|document|localStorage|sessionStorage)\s*[.[]/);
      if (m) hits.push(`${f}: ${m[0]}`);
    }
  assert.deepEqual(hits, []);
});

test("네이티브 쌍이 있는 파일은 같은 이름을 내보낸다(양방향: tsc는 .ts만, Metro는 플랫폼별로 해석한다)", () => {
  const pairs = [
    ["apps/consumer/src/lib/kakao.ts", "apps/consumer/src/lib/kakao.native.ts"],
    ["apps/producer/src/lib/kakao.ts", "apps/producer/src/lib/kakao.native.ts"],
    ["packages/api/src/storage.ts", "packages/api/src/storage.native.ts"],
    ["packages/api/src/objectUrl.ts", "packages/api/src/objectUrl.native.ts"],
    ["packages/analytics/src/client.ts", "packages/analytics/src/client.native.ts"],
    ["packages/ui/src/pickPhoto.ts", "packages/ui/src/pickPhoto.native.ts"],
    ["apps/consumer/src/lib/kakaoAuth.ts", "apps/consumer/src/lib/kakaoAuth.native.ts"],
    ["apps/producer/src/lib/kakaoAuth.ts", "apps/producer/src/lib/kakaoAuth.native.ts"],
    ["apps/producer/src/lib/pick.ts", "apps/producer/src/lib/pick.native.ts"],
    ["apps/producer/src/lib/sourceFiles.ts", "apps/producer/src/lib/sourceFiles.native.ts"],
  ];
  const names = (f) => new Set([...read(f).matchAll(/^export (?:async )?(?:function|const|type) (\w+)/gm)].map((m) => m[1]));
  for (const [web, native] of pairs) {
    const w = names(web), n = names(native);
    for (const x of w) assert.ok(n.has(x), `${native}에 ${x} 없음`);
    for (const x of n) assert.ok(w.has(x), `${web}에 ${x} 없음(네이티브 전용 export는 공용 코드가 못 쓴다)`);
  }
});
