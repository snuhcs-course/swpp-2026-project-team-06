// DEV-314 (FEAT-08, screens.md 결정 27, AC-08-4): 배송지 입력의 ‘우편번호 찾기’(카카오 우편번호 서비스)
// apps/consumer/src/lib/postcode.ts. 고른 결과에서 5자리 우편번호와 주소(도로명 먼저, 없으면 지번)를 꺼내고,
// 형식이 틀리면 입력칸을 바꾸지 않는다(null → 직접 입력). 채운 값으로도 도서산간 판정이 직접 입력과 같다.
// 웹은 레이어(postcodeSearch.ts), 앱은 전체 화면 웹뷰(postcodeSearch.native.tsx)가 같은 규칙으로 칸을 채운다.
// 앱 웹뷰 메시지(parsePostcodeMessage)는 깨진 JSON·빈 값·5자리가 아닌 우편번호를 걸러 낸다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  POSTCODE_SCRIPT_URL,
  isRemoteArea,
  parsePostcodeMessage,
  postcodeFields,
  postcodeWebViewHtml,
} from "../apps/consumer/src/lib/postcode.ts";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

/** 서비스는 값이 없으면 빈 문자열을 준다 */
const result = (over = {}) => ({
  zonecode: "06236",
  roadAddress: "서울 강남구 테헤란로 152",
  jibunAddress: "서울 강남구 역삼동 737",
  autoRoadAddress: "",
  autoJibunAddress: "",
  userSelectedType: "R",
  ...over,
});

test("test_DEV_314_road_address_first: 도로명 주소와 5자리 우편번호를 채운다", () => {
  assert.deepEqual(postcodeFields(result()), {
    postalCode: "06236",
    address: "서울 강남구 테헤란로 152",
  });
  // 사용자가 지번을 골라도 도로명이 있으면 도로명을 쓴다
  assert.equal(postcodeFields(result({ userSelectedType: "J" })).address, "서울 강남구 테헤란로 152");
});

test("test_DEV_314_jibun_fallback: 도로명이 비면 서비스가 채운 도로명, 그다음 지번 주소", () => {
  assert.equal(
    postcodeFields(result({ roadAddress: "", autoRoadAddress: "서울 강남구 테헤란로 150" })).address,
    "서울 강남구 테헤란로 150",
  );
  assert.equal(postcodeFields(result({ roadAddress: "" })).address, "서울 강남구 역삼동 737");
  assert.equal(
    postcodeFields(result({ roadAddress: "", jibunAddress: "", autoJibunAddress: "서울 강남구 역삼동 736" }))
      .address,
    "서울 강남구 역삼동 736",
  );
  // 공백만 있는 값은 빈 값으로 본다
  assert.equal(postcodeFields(result({ roadAddress: "   " })).address, "서울 강남구 역삼동 737");
});

test("test_DEV_314_zonecode_five_digits: 우편번호가 5자리 숫자가 아니면 채우지 않는다", () => {
  for (const zonecode of ["", "1234", "123456", "135-080", "abcde", undefined]) {
    assert.equal(postcodeFields(result({ zonecode })), null, `zonecode=${zonecode}`);
  }
  assert.equal(postcodeFields(result({ zonecode: " 06236 " })).postalCode, "06236");
  // 채운 값은 AddressForm의 기존 검증(5자리)을 그대로 통과한다
  assert.match(postcodeFields(result()).postalCode, /^\d{5}$/);
});

test("test_DEV_314_empty_result: 주소가 하나도 없거나 결과가 없으면 null", () => {
  assert.equal(
    postcodeFields(result({ roadAddress: "", jibunAddress: "", autoRoadAddress: "", autoJibunAddress: "" })),
    null,
  );
  assert.equal(postcodeFields(null), null);
  assert.equal(postcodeFields(undefined), null);
});

test("test_AC_08_4_remote_area_from_postcode: 찾기로 채운 제주·울릉 값도 도서산간으로 판정한다", () => {
  const jeju = postcodeFields(result({ zonecode: "63309", roadAddress: "제주특별자치도 제주시 첨단로 242" }));
  assert.equal(isRemoteArea(jeju.postalCode, jeju.address), true);
  const ulleung = postcodeFields(
    result({ zonecode: "40240", roadAddress: "경상북도 울릉군 울릉읍 울릉순환로 2" }),
  );
  assert.equal(isRemoteArea(ulleung.postalCode, ulleung.address), true);
  const seoul = postcodeFields(result());
  assert.equal(isRemoteArea(seoul.postalCode, seoul.address), false);
  // 직접 입력한 같은 값과 결과가 같다
  assert.equal(isRemoteArea("63309", "제주특별자치도 제주시 첨단로 242"), true);
});

test("test_AC_08_4_remote_rule_matches_server: 화면 판정 규칙이 서버 규칙과 같다", () => {
  const server = read("server/app/orders/service.py");
  const lib = read("apps/consumer/src/lib/postcode.ts");
  const postal = server.match(/_REMOTE_POSTAL = re\.compile\(r"([^"]+)"\)/)[1];
  const address = server.match(/_REMOTE_ADDRESS = re\.compile\(r"([^"]+)"\)/)[1];
  assert.ok(lib.includes(`/${postal}/.test(postalCode)`), postal);
  assert.ok(lib.includes(`/${address}/.test(address)`), address);
});

test("test_DEV_314_script_and_platforms: 공식 스크립트, 웹은 레이어·앱은 웹뷰, 직접 입력 유지", () => {
  // 키 없는 공식 주소. 질의 문자열을 붙이면 서비스가 잘못된 호출로 본다
  assert.equal(POSTCODE_SCRIPT_URL, "https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js");
  const web = read("apps/consumer/src/lib/postcodeSearch.ts");
  assert.match(web, /\.embed\(/, "팝업 대신 레이어로 연다");
  assert.doesNotMatch(web, /preloadPostcode|useEffect\(\(\) => \{\s*loadPostcode/, "누르기 전에는 카카오 스크립트를 부르지 않는다(처리방침 제2조)");
  assert.doesNotMatch(web, /react-native-webview/, "웹 번들은 웹뷰를 가져오지 않는다");
  const native = read("apps/consumer/src/lib/postcodeSearch.native.tsx");
  assert.match(native, /from "react-native-webview"/);
  assert.match(native, /postcodeWebViewHtml\(\)/);
  assert.match(native, /parsePostcodeMessage\(/);
  assert.match(native, /onRequestClose=\{\(\) => finish\(null\)\}/, "Android 뒤로는 채우지 않고 닫는다");
  // 두 파일의 입구 모양이 같다
  for (const src of [web, native]) assert.match(src, /export function usePostcodeSearch\(handlers: PostcodeHandlers\)/);
  const form = read("apps/consumer/src/lib/AddressForm.tsx");
  assert.match(form, /usePostcodeSearch\(/);
  assert.match(form, /label="우편번호 찾기"/);
  assert.match(form, /detailRef\.current\?\.focus\(\)/);
  // 기존 검증은 그대로
  assert.match(form, /우편번호 5자리를 입력해 주세요/);
});

const message = (over = {}) =>
  JSON.stringify({
    type: "complete",
    zonecode: "63309",
    roadAddress: "제주특별자치도 제주시 첨단로 242",
    jibunAddress: "제주특별자치도 제주시 영평동 2181",
    ...over,
  });

test("test_DEV_314_native_message_select: 앱 웹뷰 결과를 웹과 같은 규칙으로 채운다", () => {
  assert.deepEqual(parsePostcodeMessage(message()), {
    kind: "select",
    fields: { postalCode: "63309", address: "제주특별자치도 제주시 첨단로 242" },
  });
  // 도로명이 비면 지번
  assert.deepEqual(parsePostcodeMessage(message({ roadAddress: "" })).fields.address, "제주특별자치도 제주시 영평동 2181");
  const picked = parsePostcodeMessage(message()).fields;
  assert.equal(isRemoteArea(picked.postalCode, picked.address), true);
});

test("test_DEV_314_native_message_invalid: 5자리가 아니거나 주소가 없으면 invalid(안내 후 직접 입력)", () => {
  for (const zonecode of ["", "1234", "123456", "abcde", 63309, null]) {
    assert.deepEqual(parsePostcodeMessage(message({ zonecode })), { kind: "invalid" }, `zonecode=${zonecode}`);
  }
  assert.deepEqual(parsePostcodeMessage(message({ roadAddress: "", jibunAddress: "" })), { kind: "invalid" });
  // 필드가 빠진 complete
  assert.deepEqual(parsePostcodeMessage(JSON.stringify({ type: "complete" })), { kind: "invalid" });
  assert.deepEqual(parsePostcodeMessage(JSON.stringify({ type: "complete", zonecode: "63309" })), { kind: "invalid" });
  // 문자열이 아닌 주소 값은 빈 값으로 본다
  assert.deepEqual(parsePostcodeMessage(message({ roadAddress: 1, jibunAddress: {} })), { kind: "invalid" });
});

test("test_DEV_314_native_message_malformed: 깨진 JSON·모르는 메시지는 무시, error·ready는 구분", () => {
  for (const raw of ["", "{", "not json", "null", "42", '"complete"', "[]", JSON.stringify({ zonecode: "63309" }), JSON.stringify({ type: "other" }), undefined, 7]) {
    assert.deepEqual(parsePostcodeMessage(raw), { kind: "ignore" }, `raw=${String(raw)}`);
  }
  assert.deepEqual(parsePostcodeMessage(JSON.stringify({ type: "error" })), { kind: "load" });
  assert.deepEqual(parsePostcodeMessage(JSON.stringify({ type: "ready" })), { kind: "ready" });
});

test("test_DEV_314_native_html: 웹뷰 HTML은 같은 공식 스크립트를 embed하고 결과·실패를 postMessage로 보낸다", () => {
  const html = postcodeWebViewHtml();
  assert.ok(html.includes(`s.src=${JSON.stringify(POSTCODE_SCRIPT_URL)}`));
  assert.match(html, /\.embed\(document\.getElementById\("wrap"\)/);
  assert.match(html, /ReactNativeWebView\.postMessage\(JSON\.stringify\(m\)\)/);
  for (const key of ["zonecode", "roadAddress", "jibunAddress"]) assert.match(html, new RegExp(`${key}:d\\.${key}`));
  assert.match(html, /type:"complete"/);
  assert.match(html, /s\.onerror=function\(\)\{post\(\{type:"error"\}\)/);
  assert.match(html, /post\(\{type:"ready"\}\)/);
});
