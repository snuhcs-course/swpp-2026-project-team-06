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
  // 국외 이전은 이전받는 자의 연락처(이메일)까지 적는다(제28조의8 제2항). 쓰지 않는 도구는 적지 않는다
  for (const contact of ["privacy@anthropic.com", "privacy@openrouter.ai", "privacyquestions@cloudflare.com", "privacy@railway.com", "privacy@vercel.com", "privacy@posthog.com"])
    assert.ok(html.includes(contact), contact);
  assert.ok(!html.includes("도입 예정"));
  // 앱 안 회원 탈퇴(DEV-94, 제38조 ④). 이메일 요청만 받던 문장은 남기지 않는다
  assert.ok(html.includes("회원 탈퇴는 소비자 앱 ‘내 정보’"));
  assert.ok(!html.includes("탈퇴 버튼이 없습니다"));
  // 서버·DB는 Railway asia-southeast1(싱가포르). railway status로 확인(10/23)
  assert.ok(html.includes("싱가포르(서버·데이터베이스 소재지)"));
  // 동의 없이 처리하는 정보는 법적 근거와 함께 구분해 적는다(제22조 제3항)
  assert.ok(html.includes('<th scope="col">처리 근거</th>'));
  assert.ok(html.includes("제22조 제3항"));
  assert.match(html, /<h2>제\d+조 \(생성형 AI 이용\)/);
  // 코드가 하지 않는 일(배송 완료 후 가림, 역할별 권한)은 약속하지 않는다
  assert.ok(!html.includes("배송 완료 후 판매자 화면"));
  assert.ok(!html.includes("역할별"));
  assert.ok(html.includes("주문한 상품의 판매자(농가)"));
  // 판매자 제공은 주문서의 별도 동의로(DEV-120, 제17조 ①·②)
  assert.ok(html.includes("‘개인정보 제3자 제공’ 항목으로 따로 동의"));
  assert.ok(html.includes("이메일 help@example.com"), "officer section falls back to the contact email");
});

test("DEV-113 R-01 R-07 R-11 R-12 R-14 R-28: terms state the broker notice and pre-order rules", () => {
  const html = pages.pageHtml(content.termsOfService);
  assert.ok(html.includes("통신판매중개자"));
  assert.ok(html.includes("통신판매의 당사자가 아닙니다"));
  for (const rule of ["무통장 입금만", "24시간 안에 입금하지 않으면", "언제든 취소할 수 있고, 전액 환불", "받은 뒤 24시간 안에", "3영업일", "8일이 지나면", "포인트·적립금·상품권"])
    assert.ok(html.includes(rule), rule);
  assert.ok(html.includes("<dt>상호</dt><dd>테스트상호 &lt;b&gt;</dd>"), "business info is escaped");
  // 사이버몰 표시: 호스팅서비스 제공자(전자상거래법 제10조, 시행령 제11조의4)
  assert.ok(html.includes("<dt>호스팅서비스 제공자</dt><dd>Vercel Inc.</dd>"));
  // 하자 신고 24시간은 권고이고 법정 청약철회 권리를 줄이지 않는다(제17조 제3항, 제35조)
  assert.ok(html.includes("청약철회 권리는 그대로"));
  // 관할은 소비자 주소지 지방법원 전속관할(제36조), 분쟁 처리 기간(제20조 제3항)
  assert.ok(html.includes("소비자의 주소를, 주소가 없으면 거소를 관할하는 지방법원의 전속관할"));
  assert.ok(html.includes("3영업일 안에 진행 상황을, 10영업일 안에 처리 결과"));
  assert.ok(html.includes("생성형 인공지능(AI)을 이용"));
  assert.ok(html.includes("연 15%의 지연배상금"));
  assert.ok(!html.includes("공급 계약"));
  // 구매 확정이 청약철회·하자 권리를 끊지 않는다(전자상거래법 제17조·제35조)
  assert.ok(html.includes("구매를 확정한 뒤에도 제9조의 법정 청약철회 권리"));
  assert.ok(!html.includes("<dt>대표자</dt>"), "blank values are left out");
});

test("DEV-113: index.html gets business info in <noscript>", () => {
  const replaced = pages.withNoscriptFooter("<body><noscript>You need to enable JavaScript.</noscript><div id=root></div></body>");
  assert.equal(replaced.match(/<noscript>/g).length, 1);
  assert.ok(replaced.includes('<a href="/privacy">'));
  assert.ok(replaced.includes("<dt>사업자등록번호</dt>"));
  assert.ok(replaced.includes("<dt>호스팅서비스 제공자</dt>"));
  const inserted = pages.withNoscriptFooter("<body><div id=root></div></body>");
  assert.match(inserted, /<noscript>.*<\/noscript><\/body>/s);
});

test("DEV-140·142: privacy policy lists the Kakao phone as required (no Kakao name), with purpose and prefill", () => {
  const html = pages.pageHtml(content.privacyPolicy);
  assert.match(html, /카카오 회원번호, 카카오계정 이메일, 전화번호\(필수\)/);
  assert.doesNotMatch(html, /카카오계정 이메일, 이름/);
  assert.match(html, /주문 상품 배송을 위한 연락처, 배송·주문 문의 연락, 생산자 가입 확인 전화/);
  assert.match(html, /미리 채우는 데 쓰며, 이용자가 직접 고칠 수 있습니다/);
  assert.doesNotMatch(html, /카카오에서 동의한 경우/);
  // DEV-142: 소비자 가입은 닉네임·휴대폰만, 이름·배송지는 첫 주문서에서 받는다
  assert.match(html, /첫 주문서의 연락처 칸/);
  assert.doesNotMatch(html, /\(선택\) 기본 배송지/);
});

test("DEV-113 AC-01-17: server, Mock and apps share one terms version", async () => {
  const { readFile } = await import("node:fs/promises");
  const server = (await readFile("server/app/accounts/schemas.py", "utf8")).match(/^CONSENT_VERSION = "([^"]+)"/m)?.[1];
  const mock = (await readFile("packages/api/src/mock/db.ts", "utf8")).match(/CONSENT_VERSION = "([^"]+)"/)?.[1];
  assert.ok(server, "server CONSENT_VERSION");
  assert.equal(mock, server);
  assert.equal(content.LEGAL_VERSION, server);
  // 화면의 시행일과 버전이 같은 날짜다
  const [y, m, d] = server.split("-").map(Number);
  assert.equal(content.privacyPolicy.effective, `${y}년 ${m}월 ${d}일`);
});
