// DEV-113 (R-16, policy.md 5·6장): 사업자 정보는 값 있는 항목만, 약관·처리방침 정적 HTML은 필수 항목과 규칙 문구를 담는다
import assert from "node:assert/strict";
import { test } from "node:test";

// 사업자 정보는 import 때 환경 변수에서 읽는다. 가짜 값으로 두고 import한다(일부는 비워 빠지는지 본다)
Object.assign(process.env, {
  EXPO_PUBLIC_BUSINESS_NAME: "테스트상호 <b>",
  EXPO_PUBLIC_BUSINESS_REGISTRATION_NO: "000-00-00000",
  EXPO_PUBLIC_BUSINESS_OWNER: "  ",
  EXPO_PUBLIC_BUSINESS_EMAIL: "help@example.com",
});
delete process.env.EXPO_PUBLIC_PRIVACY_OFFICER;
const content = await import("../packages/ui/src/legalContent.ts");
const pages = await import("./legal-pages.mjs");

test("DEV-113 R-16: business lines keep only filled values in display order", () => {
  assert.deepEqual(content.businessLines(), [
    ["상호", "테스트상호 <b>"],
    ["사업자등록번호", "000-00-00000"],
    ["이메일", "help@example.com"],
  ]);
  assert.deepEqual(content.businessLines({}), []);
  assert.equal(content.businessCheckUrl({ registrationNo: "123-45-67890" }), "https://www.ftc.go.kr/bizCommPop.do?wrkr_no=1234567890");
  assert.equal(content.businessCheckUrl({ registrationNo: "12-3" }), null);
  assert.deepEqual(content.officerLines({}), ["테스트 서비스 기간이라 아직 등록 전입니다."]);
  assert.deepEqual(content.officerLines({ privacyOfficer: "담당자", email: "a@b.c" }), ["개인정보 보호책임자 담당자", "이메일 a@b.c"]);
});

test("DEV-113: privacy policy covers the items the Personal Information Protection Act requires", () => {
  const html = pages.pageHtml(content.privacyPolicy);
  for (const heading of [
    "처리 목적",
    "처리하는 개인정보 항목",
    "보유·이용 기간",
    "제3자 제공",
    "처리의 위탁",
    "국외 이전",
    "파기 절차",
    "정보주체의 권리",
    "안전성 확보 조치",
    "개인정보 보호책임자",
    "처리방침의 변경",
  ])
    assert.match(html, new RegExp(`<h2>제\\d+조 \\([^)]*${heading}`), heading);
  for (const vendor of ["Anthropic", "OpenRouter", "Cloudflare", "Railway", "Vercel", "PostHog", "Sentry", "Langfuse"])
    assert.ok(html.includes(vendor), vendor);
  assert.ok(html.includes("주문한 상품의 판매자(농가)"));
  assert.ok(html.includes("이메일 help@example.com"), "officer section falls back to the contact email");
});

test("DEV-113 R-01 R-07 R-11 R-12 R-14 R-28: terms state the broker notice and pre-order rules", () => {
  const html = pages.pageHtml(content.termsOfService);
  assert.ok(html.includes("통신판매중개자"));
  assert.ok(html.includes("통신판매의 당사자가 아닙니다"));
  for (const rule of ["무통장 입금만", "24시간 안에 입금하지 않으면", "언제든 취소할 수 있고, 전액 환불", "받은 뒤 24시간 안에", "3영업일", "8일이 지나면", "포인트·적립금·상품권"])
    assert.ok(html.includes(rule), rule);
  assert.ok(html.includes("<dt>상호</dt><dd>테스트상호 &lt;b&gt;</dd>"), "business info is escaped");
  assert.ok(!html.includes("<dt>대표자</dt>"), "blank values are left out");
});

test("DEV-113: index.html gets business info in <noscript>", () => {
  const replaced = pages.withNoscriptFooter("<body><noscript>You need to enable JavaScript.</noscript><div id=root></div></body>");
  assert.equal(replaced.match(/<noscript>/g).length, 1);
  assert.ok(replaced.includes('<a href="/privacy">'));
  assert.ok(replaced.includes("<dt>사업자등록번호</dt>"));
  const inserted = pages.withNoscriptFooter("<body><div id=root></div></body>");
  assert.match(inserted, /<noscript>.*<\/noscript><\/body>/s);
});
