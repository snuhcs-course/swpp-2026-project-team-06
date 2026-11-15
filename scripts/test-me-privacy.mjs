// DEV-316 (FEAT-01 AC-01-7, FEAT-08 AC-08-5, screens.md SCR-17·SCR-30): 내 정보·설정 첫 화면에서 개인정보 빼기.
// apps/consumer/src/lib/meSummary.ts — 머리는 닉네임만(없어도 실명으로 대신하지 않음), 배송지 행은 주소 대신 개수.
// 첫 화면 소스가 실명·휴대폰·이메일·주소·계좌번호를 그리지 않는지도 본다(하위 화면은 그대로 보여 줌).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  NICKNAME_PROMPT,
  NO_NICKNAME,
  addressSummary,
  meHeading,
} from "../apps/consumer/src/lib/meSummary.ts";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");
/** 주석을 뺀 소스(주석에 필드 이름이 나와도 걸리지 않게) */
const code = (p) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const kakao = { isTestAccount: false, needsOnboarding: false };

test("test_DEV_316_heading_shows_nickname_only", () => {
  assert.equal(meHeading({ ...kakao, nickname: "귤러버", name: "김민지" }), "귤러버");
  assert.equal(meHeading({ ...kakao, nickname: "  귤러버 " }), "귤러버");
});

test("test_DEV_316_no_nickname_never_falls_back_to_real_name", () => {
  // 실명 필드를 넘겨도(화면이 user 전체를 넘기는 경우) 머리 글에 쓰지 않는다
  // 닉네임 없는 카카오 계정은 서버가 needsOnboarding=true로 준다(가입 마치기가 닉네임을 받음)
  assert.equal(meHeading({ ...kakao, needsOnboarding: true, nickname: null, name: "김민지" }), NICKNAME_PROMPT);
  assert.equal(meHeading({ ...kakao, needsOnboarding: true, nickname: "   ", name: "김민지" }), NICKNAME_PROMPT);
  assert.equal(meHeading({ isTestAccount: true, nickname: null, name: "김민지" }), NO_NICKNAME);
});

test("test_AC_08_5_address_row_shows_count_not_address", () => {
  assert.equal(addressSummary(0), "저장한 배송지가 없어요");
  assert.equal(addressSummary(1), "저장한 배송지 1개");
  assert.equal(addressSummary(50), "저장한 배송지 50개");
});

test("test_DEV_316_consumer_me_first_screen_does_not_render_personal_fields", () => {
  const src = code("apps/consumer/src/app/(tabs)/me/index.tsx");
  for (const field of ["user.name", "user.phone", "user.email", "recipientPhone", "recipientName"])
    assert.ok(!src.includes(field), `내 정보 첫 화면이 ${field}를 그린다`);
  // 배송지 주소(`.address`, `addresses`는 목록 이름이라 제외)
  assert.ok(!/\.address\b/.test(src), "내 정보 첫 화면이 배송지 주소를 그린다");
  assert.match(src, /meHeading\(user\)/);
  assert.match(src, /addressSummary\(/);
  // 하위 화면은 지금처럼 전체 값을 보여 준다
  const profile = code("apps/consumer/src/app/(tabs)/me/profile.tsx");
  assert.match(profile, /user\.phone/);
  assert.match(profile, /user\.email/);
});

test("test_DEV_316_producer_first_screens_do_not_render_account_number", () => {
  const farm = code("apps/producer/src/app/(tabs)/farm/index.tsx");
  // 계좌가 있는지 판단에는 쓰지만 글자로 그리지는 않는다
  assert.ok(!/\$\{data\.accountNumber\}/.test(farm), "농가 프로필 첫 화면이 계좌번호를 그린다");
  assert.ok(!farm.includes("accountHolder"), "농가 프로필 첫 화면이 예금주를 그린다");
  assert.match(farm, /계좌를 등록했어요/);
  const settings = code("apps/producer/src/app/(tabs)/settings.tsx");
  for (const field of ["accountNumber", "accountHolder", "user.name", "user?.name", ".phone", ".email", "contactPhone"])
    assert.ok(!settings.includes(field), `설정 첫 화면이 ${field}를 그린다`);
  // 하위 화면(입금 계좌)은 세 칸을 그대로 보여 주고 고친다
  const account = code("apps/producer/src/app/(tabs)/farm/account.tsx");
  for (const field of ["accountNumber", "accountHolder", "bankName"]) assert.ok(account.includes(field));
});
