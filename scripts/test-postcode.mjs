// DEV-314 (FEAT-08, screens.md 결정 27, AC-08-4): 배송지 입력의 ‘우편번호 찾기’(카카오 우편번호 서비스)
// apps/consumer/src/lib/postcode.ts. 고른 결과에서 5자리 우편번호와 주소(도로명 먼저, 없으면 지번)를 꺼내고,
// 형식이 틀리면 입력칸을 바꾸지 않는다(null → 직접 입력). 채운 값으로도 도서산간 판정이 직접 입력과 같다.
// AddressForm은 웹에서만 버튼을 보이고(postcodeSearch.ts), 앱(.native.ts)은 숨긴다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  POSTCODE_SCRIPT_URL,
  isRemoteArea,
  postcodeFields,
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

test("test_DEV_314_script_and_platforms: 공식 스크립트, 웹만 버튼, 직접 입력 유지", () => {
  // 키 없는 공식 주소. 질의 문자열을 붙이면 서비스가 잘못된 호출로 본다
  assert.equal(POSTCODE_SCRIPT_URL, "https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js");
  const native = read("apps/consumer/src/lib/postcodeSearch.native.ts");
  assert.match(native, /postcodeSearchAvailable = false/);
  const web = read("apps/consumer/src/lib/postcodeSearch.ts");
  assert.match(web, /postcodeSearchAvailable = true/);
  assert.match(web, /\.embed\(/, "팝업 대신 레이어로 연다");
  const form = read("apps/consumer/src/lib/AddressForm.tsx");
  assert.match(form, /postcodeSearchAvailable \?/);
  assert.match(form, /label="우편번호 찾기"/);
  assert.match(form, /detailRef\.current\?\.focus\(\)/);
  // 기존 검증은 그대로
  assert.match(form, /우편번호 5자리를 입력해 주세요/);
});
