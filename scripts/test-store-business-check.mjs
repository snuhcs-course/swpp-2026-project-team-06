// DEV-476 (policy.md 6장): 스토어용 EAS 빌드는 사업자 정보가 비면 멈추고, 로컬·Mock·CI·development 빌드는 그대로 둔다.
// 값은 가짜(‘x’)만 쓴다. 실제 사업자 정보는 어디에도 적지 않는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const consumer = require("../apps/consumer/app.config.js");
const producer = require("../apps/producer/app.config.js");
const appJson = JSON.parse(readFileSync(new URL("../apps/consumer/app.json", import.meta.url), "utf8")).expo;

const FILLED = Object.fromEntries(consumer.REQUIRED.map((name) => [name, "x"]));
const build = (profile, extra = {}) => ({ EAS_BUILD: "true", EAS_BUILD_PROFILE: profile, ...extra });
const quiet = () => {};

test("DEV-476: both apps share the same build check, byte for byte", () => {
  assert.equal(
    readFileSync(new URL("../apps/consumer/app.config.js", import.meta.url), "utf8"),
    readFileSync(new URL("../apps/producer/app.config.js", import.meta.url), "utf8"),
  );
  // 다른 파일을 불러오면 fingerprint(런타임 버전)가 바뀐다
  assert.doesNotMatch(readFileSync(new URL("../apps/consumer/app.config.js", import.meta.url), "utf8"), /require\(/);
});

test("DEV-476: store profiles on the EAS build server stop when business info is empty", () => {
  for (const profile of ["production", "preview", "internal"]) {
    assert.throws(() => consumer.assertStoreBusinessInfo(build(profile), quiet), /빌드를 멈춥니다/, profile);
    assert.throws(() => producer.assertStoreBusinessInfo(build(profile), quiet), /빌드를 멈춥니다/, profile);
  }
  // 하나만 비어도, 공백만 있어도 멈춘다. 오류에는 빠진 이름만 나온다
  const oneBlank = build("production", { ...FILLED, EXPO_PUBLIC_PRIVACY_OFFICER: "  " });
  assert.throws(() => consumer.assertStoreBusinessInfo(oneBlank, quiet), (e) => {
    assert.match(e.message, /EXPO_PUBLIC_PRIVACY_OFFICER/);
    assert.doesNotMatch(e.message, /EXPO_PUBLIC_BUSINESS_NAME/);
    return true;
  });
});

test("DEV-476: any EAS profile but development is checked, so new or renamed store profiles cannot slip through", () => {
  // 허용 목록이 아니라 제외 목록(development만). 모르는 이름·대소문자 변형·빈 프로필도 멈춘다
  for (const profile of ["onestore", "production-apk", "Production", "PREVIEW", "store", ""]) {
    assert.throws(() => consumer.assertStoreBusinessInfo(build(profile), quiet), /빌드를 멈춥니다/, profile);
    assert.throws(() => producer.assertStoreBusinessInfo(build(profile), quiet), /빌드를 멈춥니다/, profile);
  }
  for (const profile of ["development", "Development", " development "])
    assert.equal(consumer.assertStoreBusinessInfo(build(profile), quiet).applies, false, profile);
  assert.deepEqual(consumer.EXEMPT_PROFILES, ["development"]);
  // 안내는 EAS 환경 이름을 단정하지 않는다(preview 프로필도 production 환경을 쓸 수 있다)
  assert.throws(() => consumer.assertStoreBusinessInfo(build("preview"), quiet), (e) => {
    assert.match(e.message, /이 프로필이 쓰는 EAS 환경/);
    assert.doesNotMatch(e.message, /--environment (preview|production)\b/);
    return true;
  });
});

test("DEV-476: a store build with every required value passes; a missing mail-order number only warns", () => {
  const warnings = [];
  const result = consumer.assertStoreBusinessInfo(build("production", FILLED), (m) => warnings.push(m));
  assert.equal(result.applies, true);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.warnings, ["EXPO_PUBLIC_BUSINESS_MAIL_ORDER_NO"]);
  assert.equal(warnings.length, 1);
  // 경고에 값이 섞이지 않는다
  assert.doesNotMatch(warnings[0], /\bx\b/);

  const none = [];
  consumer.assertStoreBusinessInfo(build("internal", { ...FILLED, EXPO_PUBLIC_BUSINESS_MAIL_ORDER_NO: "x" }), (m) => none.push(m));
  assert.deepEqual(none, []);
});

test("DEV-476: local, Mock, CI, development builds and eas update are not checked (only the build server sets EAS_BUILD)", () => {
  for (const env of [
    {}, // 로컬 expo start·export, 웹 Mock
    { CI: "1", EXPO_PUBLIC_API_MOCK: "1" }, // CI
    { EAS_BUILD_PROFILE: "production" }, // eas build가 내 컴퓨터에서 설정을 미리 읽을 때
    build("development"),
    { EAS_BUILD: "false", EAS_BUILD_PROFILE: "production" },
  ]) {
    const result = consumer.assertStoreBusinessInfo(env, quiet);
    assert.equal(result.applies, false, JSON.stringify(env));
  }
});

test("DEV-476: the config function returns app.json unchanged", () => {
  const saved = { ...process.env };
  try {
    delete process.env.EAS_BUILD;
    assert.equal(consumer({ config: appJson }), appJson);
    process.env.EAS_BUILD = "true";
    process.env.EAS_BUILD_PROFILE = "production";
    for (const name of consumer.REQUIRED) delete process.env[name];
    assert.throws(() => consumer({ config: appJson }), /빌드를 멈춥니다/);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
