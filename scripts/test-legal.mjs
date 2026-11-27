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
  // 배송지 저장은 미리 체크된 칸이라 동의가 아니라 계약 이행으로 처리한다
  assert.doesNotMatch(html, /저장을 고를 때 받음/);
  assert.match(html, /배송지를 기본으로 저장/);
});

test("DEV-113 AC-01-17: server, Mock and apps share one terms version", async () => {
  const { readFile } = await import("node:fs/promises");
  const server = (await readFile("server/app/accounts/schemas.py", "utf8")).match(/^CONSENT_VERSION = "([^"]+)"/m)?.[1];
  const mock = (await readFile("packages/api/src/mock/db.ts", "utf8")).match(/CONSENT_VERSION = "([^"]+)"/)?.[1];
  assert.ok(server, "server CONSENT_VERSION");
  assert.equal(mock, server);
  assert.equal(content.LEGAL_VERSION, server);
  // 버전은 동의 항목이 바뀐 시행일이다. 문구만 바뀐 변경(DEV-122)은 시행일만 늦추고 버전은 그대로 둔다.
  // 버전 날짜는 처리방침 변경 기록에 있고, 처리방침 시행일보다 늦지 않다
  const [y, m, d] = server.split("-").map(Number);
  const html = pages.pageHtml(content.privacyPolicy);
  assert.ok(html.includes(`${y}년 ${m}월 ${d}일 변경:`), "version date is a recorded change");
  const toIso = (k) => k.replace(/(\d+)년 (\d+)월 (\d+)일/, (_, a, b, c) => `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`);
  assert.ok(server <= toIso(content.privacyPolicy.effective), "version is not after the privacy effective date");
  // 시행일이 버전보다 늦으면 시행일 날짜의 변경 기록이 재동의하지 않는다고 적는다
  if (toIso(content.privacyPolicy.effective) !== server)
    assert.match(html, new RegExp(`${content.privacyPolicy.effective} 변경:[^<]*다시 동의를 받지 않습니다`));
});

test("DEV-150: privacy policy names the consumer farmclub support room and bumps the version", () => {
  const html = pages.pageHtml(content.privacyPolicy);
  assert.match(html, /생산자·소비자의 farmclub 문의 대화방\(운영팀 상담\)/);
  assert.match(html, /2026년 10월 29일 변경: 소비자도 앱 안에서 farmclub 운영팀에 문의할 수 있도록/);
  assert.equal(content.LEGAL_VERSION, "2026-11-20"); // DEV-363이 올림(PM 11/18)
});

test("DEV-121: terms Art. 14 says the company gives the origin labeling notice, without bumping the consent version", () => {
  const html = pages.pageHtml(content.termsOfService);
  assert.match(html, /회사는 「농수산물의 원산지 표시 등에 관한 법률」 제6조제6항에 따라 판매자에게 원산지 표시제도를 생산자 앱 첫 화면에 게시하는 방법으로 안내합니다/);
  // 시행 7일 전 고지(약관 제4조), 변경 기록에 재동의하지 않는 이유
  assert.equal(content.termsOfService.effective, "2026년 11월 13일");
  assert.match(html, /2026년 11월 13일 변경: 제14조에 회사가 판매자에게 원산지 표시제도를 안내한다는 문장을 더했습니다[^<]*다시 동의를 받지 않습니다/);
  assert.equal(content.LEGAL_VERSION, "2026-11-20"); // DEV-363이 올림(PM 11/18)
});

test("DEV-122: PostHog transfer lists every item of Article 28-8(2) and the basis is no longer legitimate interest", () => {
  const html = pages.pageHtml(content.privacyPolicy);
  // 이용 통계·세션 녹화의 근거는 정당한 이익(제15조 제1항 제6호)이 아니다
  assert.doesNotMatch(html, /정당한 이익/);
  assert.doesNotMatch(html, /제15조 제1항 제6호/);
  assert.match(html, /이용 통계·세션 녹화는 [^<]*계약 이행\(제15조 제1항 제4호\)/);
  // 국외 이전 근거는 제3호 가목(처리방침 공개)으로 조문까지 적는다(시행령 제31조 제1항 제2호)
  assert.ok(html.includes("제28조의8 제1항 제3호 가목"));
  // 제28조의8 제2항: 항목, 국가·시기·방법, 이전받는 자와 연락처, 목적·보유 기간, 거부 방법·효과
  const row = html.match(/<tr><td>PostHog, Inc\. \(privacy@posthog\.com\)<\/td>(.*?)<\/tr>/s)?.[1];
  assert.ok(row, "PostHog row in the transfer table");
  assert.ok(row.includes("<td>미국</td>"));
  for (const item of ["접속 IP 주소", "세션 녹화", "*로 가려", "서비스 내부 회원 ID", "이름·연락처·주소·메시지 본문은 보내지 않음"]) assert.ok(row.includes(item), item);
  // DEV-436: 웹 화면과 앱 마켓에 배포한 앱에서만 보낸다. 원스토어 앱이 preview 채널 internal 빌드라 같은 빌드의 팀 테스트 기기도 보낸다
  assert.ok(row.includes("공식 주소(farmclub.kr, farm.farmclub.kr)의 웹 화면과 앱 마켓(원스토어 등)에 배포한 iOS·Android 앱에서만 보냄"));
  // DEV-299: 보관 기간은 PostHog 실제 설정(이벤트 최대 7년, 녹화 30일). 무료 요금제 1년이 아니다
  assert.ok(row.includes("PostHog의 보관 기준에 따라 이용 기록은 수집한 날부터 최대 7년"));
  assert.match(row, /30일/);
  assert.doesNotMatch(row, /1년/);
  assert.doesNotMatch(row, /무료 요금제/);
  assert.doesNotMatch(row, /보관 설정 기간/);
  assert.ok(html.includes("이전 시기와 방법: 서비스를 이용할 때마다"));
  assert.match(html, /PostHog로의 이전\(이용 통계·세션 녹화\)은 서비스 안에 따로 끄는 설정이 아직 없습니다/);
  assert.ok(html.includes("막아도 서비스 이용에는 지장이 없습니다"));
  // 처리위탁 표에도 PostHog가 있다(제26조 제2항)
  assert.ok(html.includes("<td>PostHog, Inc.</td><td>이용 통계 분석(웹·앱)과 세션 녹화 분석(웹)</td>"));
  // 자동 수집 장치: 공식 주소에서만, 세션 녹화 포함, 쿠키 차단만으로 전송이 멈추지 않을 수 있음
  assert.match(html, /공식 주소\(farmclub\.kr, farm\.farmclub\.kr\)의 웹 화면에서는 이용 통계 도구 PostHog/);
  assert.ok(html.includes("쿠키·저장소를 막아도 PostHog 전송은 이어질 수 있으니"));
  // 변경 기록과 시행일(시행 7일 전 고지, 제14조)
  assert.ok(html.includes("2026년 11월 13일 변경: PostHog(미국)로의 국외 이전"));
  // DEV-314의 우편번호 찾기 고지는 시행일을 늦추지 않고 그 변경분만 11-19부터 시행했다. 문서 시행일은 DEV-363 개정(11-20)
  assert.equal(content.privacyPolicy.effective, "2026년 11월 20일");
  assert.equal(content.LEGAL_VERSION, "2026-11-20"); // DEV-363이 올림(PM 11/18)
});

test("DEV-314: privacy policy tells that the postcode search keyword goes to Kakao, without a version bump", () => {
  const html = pages.pageHtml(content.privacyPolicy);
  assert.ok(html.includes("배송지 입력의 ‘우편번호 찾기’는 카카오(다음) 우편번호 서비스를 씁니다."));
  assert.match(html, /입력한 검색어\(도로명·건물명·지번 등\)와 접속 정보\(IP 주소, 기기·브라우저 정보 등\)는 회사 서버를 거치지 않고 카카오가 받아[^<]*회사는 검색어를 받거나 저장하지 않습니다/);
  assert.match(html, /직접 입력할 수도 있습니다\(2026년 11월 19일부터 시행\)/);
  // 고지 문구만 바뀌어 동의 버전은 그대로. 문서 시행일(11-13, DEV-122 개정)은 늦추지 않고 이 변경분만 고지 7일 뒤 시행
  assert.match(html, /2026년 11월 19일 변경: 배송지 입력의 ‘우편번호 찾기’[^<]*다시 동의를 받지 않습니다/);
  assert.ok(html.includes("2026년 11월 19일 변경분(제2조 ‘우편번호 찾기’ 안내)은 2026년 11월 19일부터"));
  assert.equal(content.privacyPolicy.effective, "2026년 11월 20일"); // DEV-363 개정
  assert.equal(content.LEGAL_VERSION, "2026-11-20"); // DEV-363이 올림(PM 11/18)
});

test("DEV-342: the 11/17 depositor-name wording takes effect on the deploy date, without a version bump", () => {
  const privacy = pages.pageHtml(content.privacyPolicy);
  const terms = pages.pageHtml(content.termsOfService);
  assert.match(privacy, /입금자명\(농가 화면에 보이는 이름\(닉네임 등\) 앞 3글자와 숫자로 만든 짧은 입금 코드\)/);
  assert.match(privacy, /2026년 11월 17일 변경: [^<]*다시 동의를 받지 않습니다/);
  assert.ok(privacy.includes("2026년 11월 17일 변경분(제2조 입금자명)은 2026년 11월 17일부터 시행했습니다."));
  assert.match(terms, /입금자명은 입금 안내에 나오는 짧은 입금 코드/);
  assert.doesNotMatch(terms, /입금자명은 주문 번호로 적습니다/);
  assert.match(terms, /2026년 11월 17일 변경: 제7조[^<]*다시 동의를 받지 않습니다/);
  assert.ok(terms.includes("다만 2026년 11월 17일 변경분(제7조 입금자명)은 2026년 11월 17일부터 시행합니다."));
  assert.equal(content.LEGAL_VERSION, "2026-11-20"); // DEV-363이 올림(PM 11/18)
});

test("DEV-363: privacy policy lists operator-made ID accounts and bumps the version so members re-consent (PM 11/18)", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = pages.pageHtml(content.privacyPolicy);
  assert.match(html, /아이디 계정\(회사가 만든 심사·테스트용 계정\)/);
  assert.match(html, /아이디, 비밀번호\(복원할 수 없는 방식으로 암호화해 저장\)/);
  assert.match(html, /아이디 계정의 아이디·암호화한 비밀번호<\/td><td>회원 탈퇴 시까지/);
  assert.match(html, /마지막 시도 후 1일이 지난 기록은 이후 로그인 시도 때 순차적으로 삭제합니다/);
  assert.match(html, /로그인 시도가 없으면 다음 정리 시점까지 보관합니다/);
  assert.match(html, /아이디 계정의 비밀번호는 복원할 수 없는 방식\(argon2id\)으로 암호화해 저장/);
  assert.doesNotMatch(html, /비밀번호는 받지 않습니다\(카카오 로그인\)/);
  assert.match(html, /2026년 11월 20일 변경: 회사가 앱 마켓 심사·서비스 테스트를 위해 만드는 아이디 계정[^<]*기존 회원은 다음 이용 때 다시 동의를 받습니다/);
  assert.equal(content.privacyPolicy.effective, "2026년 11월 20일");
  assert.equal(content.LEGAL_VERSION, "2026-11-20");
  const server = (await readFile("server/app/accounts/schemas.py", "utf8")).match(/^CONSENT_VERSION = "([^"]+)"/m)?.[1];
  assert.equal(server, "2026-11-20");
});

// DEV-423 (AC-01-36): 로그인 없이 열리는 계정 삭제 안내(Google Play 계정 삭제 URL). 앱마다 한 장, 처리방침·탈퇴 시트와 같은 말
test("DEV-423 AC-01-36: consumer account deletion page names the app, developer, steps, email and kept records", () => {
  const html = pages.accountDeletionHtml("CONSUMER");
  assert.ok(html.includes("<title>계정 삭제 안내 · farmclub</title>"));
  assert.ok(html.includes('<header><a href="/">farmclub</a></header>'));
  assert.ok(html.includes("<h1>계정 삭제 안내</h1>"));
  // 개발자 이름은 상호 빌드 변수(이스케이프)
  assert.ok(html.includes('<p class="effective">farmclub 앱 · 개발자 테스트상호 &lt;b&gt;</p>'));
  assert.ok(html.includes("앱과 웹(farmclub.kr)은 같은 계정이라"));
  // 단계의 화면 이름은 실제 화면 글자(아래 소스 확인 test)
  for (const name of ["‘내 정보’", "‘회원 탈퇴’", "‘다음’", "‘탈퇴할게요’"]) assert.ok(html.includes(`<b>${name}</b>`), name);
  assert.equal(html.match(/<li><span>/g).length, 4);
  // 결정 (c): 테두리 '로그인하기', 소비자는 로그인 뒤 바로 ‘내 정보’
  assert.ok(html.includes('<a class="btn" href="/login?next=/me">로그인하기</a>'));
  assert.ok(html.includes("받은 날부터 10일 안에 처리 결과를 알려 드려요."));
  // 연락처는 처리방침 제12조와 같은 규칙(값 있는 것만). 이 테스트는 이메일만 있다
  assert.ok(html.includes('<dl class="ask"><div><dt>이메일</dt><dd>help@example.com</dd></div></dl>'));
  assert.ok(html.includes("로그인할 수 없으면 이메일로 삭제를 요청해 주세요."));
  // 본인 확인 방법은 처리방침에 없어 적지 않는다(승인 때 결정)
  assert.doesNotMatch(html, /휴대폰 번호를 함께 적어/);
  for (const line of content.WITHDRAW_REMOVED.CONSUMER) assert.ok(html.includes(`<li>${line}</li>`), line);
  // 아래 표에 접속 기록·PostHog·오류 기록도 있어 '거래 기록·주문 문의·동의 기록만'이라 하지 않는다
  assert.ok(html.includes("거래 기록·주문 문의·동의 기록 등 아래 표의 정보만 회원과 분리해 보관하고"));
  assert.ok(html.includes("농가에게는 ‘탈퇴한 회원’으로 보여요."));
  assert.ok(html.includes("<li>입금 대기·예약·출하 준비·배송 중인 주문이 있으면 그 주문이 끝난 뒤 탈퇴할 수 있어요.</li>"));
  assert.ok(html.includes('근거는 <a href="/privacy">개인정보 처리방침</a> 제3조에 있어요.'));
  assert.ok(html.includes("닉네임·이름·휴대폰 번호는 ‘내 정보’에서 고칠 수 있고"));
  // 결정 (b): 하단 링크 줄에 '계정 삭제'. JS 없이 읽힌다
  assert.ok(html.includes('<a href="/account-deletion">계정 삭제</a>'));
  assert.ok(html.includes("<dt>호스팅서비스 제공자</dt><dd>Vercel Inc.</dd>"));
  assert.doesNotMatch(html, /<script/);
});

test("DEV-423 AC-01-36: producer account deletion page uses the producer app name, Settings steps and farm order rule", () => {
  const html = pages.accountDeletionHtml("PRODUCER");
  assert.ok(html.includes("<title>계정 삭제 안내 · farmclub 농가</title>"));
  assert.ok(html.includes('<header><a href="/">farmclub 농가</a></header>'));
  assert.ok(html.includes("farmclub 농가 앱 · 개발자 테스트상호 &lt;b&gt;"));
  assert.ok(html.includes("웹(farm.farmclub.kr)"));
  for (const name of ["‘설정’", "‘계정’", "‘회원 탈퇴’", "‘다음’", "‘탈퇴할게요’"]) assert.ok(html.includes(`<b>${name}</b>`), name);
  // 승인 전·반려는 '설정' 탭이 없어 신청 확인 화면 맨 아래 '회원 탈퇴'에서 4단계로 바로 간다
  assert.ok(html.includes("을 눌러요(가입 신청 확인 중이거나 반려됐으면 신청 확인 화면 맨 아래 <b>‘회원 탈퇴’</b>를 누르고 4단계로).</span></li>"));
  // 생산자 로그인은 next를 받지 않는다
  assert.ok(html.includes('<a class="btn" href="/login">로그인하기</a>'));
  assert.doesNotMatch(html, /‘내 정보’/);
  assert.doesNotMatch(html, /‘환경설정’/);
  for (const line of content.WITHDRAW_REMOVED.PRODUCER) assert.ok(html.includes(`<li>${line}</li>`), line);
  // 생산자 탈퇴는 농가를 이름을 둔 채 숨긴다(SUSPENDED). 소비자에게 '탈퇴한 회원'으로 보이지 않는다
  assert.ok(html.includes("소비자의 지난 주문에는 농가 이름이 그대로 남아요."));
  assert.doesNotMatch(html, /탈퇴한 회원/);
  // 생산자는 자기 주문이 아니라 농가 상품의 주문이 막는다(server accounts/service.py)
  assert.ok(html.includes("<li>농가 상품에 입금 대기·예약·출하 준비·배송 중인 주문이 있으면"));
  assert.ok(html.includes("‘설정’의 ‘농가 프로필·공유 링크’에서 고칠 수 있어요."));
});

test("DEV-423 AC-01-36: blank business values fall back to the operator name and the privacy policy's not-yet-registered line", () => {
  const page = content.accountDeletionPage("CONSUMER", {});
  assert.equal(page.byline, "farmclub 앱 · 개발자 farmclub 운영자");
  assert.deepEqual(page.contacts, []);
  assert.equal(page.notRegistered, content.officerLines({})[0]);
  // 이메일이 없어도 처리방침 제12조처럼 연락처·책임자가 있으면 그것을 보이고, 문장은 '연락처로'
  const phoneOnly = { phone: "010-0000-0000", privacyOfficer: "담당자" };
  const byPhone = content.accountDeletionPage("CONSUMER", phoneOnly);
  assert.deepEqual(byPhone.contacts.map(([l, v]) => `${l} ${v}`), content.officerLines(phoneOnly));
  assert.match(byPhone.noLogin, /연락처로 삭제를 요청해 주세요/);
  assert.match(byPhone.partial, /위 연락처로 삭제를 요청해 주세요/);
  assert.equal(content.accountDeletionPage("PRODUCER", {}).byline, "farmclub 농가 앱 · 개발자 farmclub 운영자");
  assert.equal(content.accountDeletionPage("PRODUCER", { name: "" }).byline, "farmclub 농가 앱 · 개발자 farmclub 운영자");
});

test("DEV-423 AC-01-36: kept rows are the privacy policy Art. 3 rows that outlive withdrawal", () => {
  // 처리방침 본문이라 글자를 고정한다. 안내용으로 고치면 처리방침 제3조가 조용히 바뀌므로 여기서 걸린다
  // (바꿔야 하면 처리방침 시행일·제14조 변경 이력과 함께 이 값도 고친다)
  const law = "전자상거래 등에서의 소비자보호에 관한 법률";
  assert.deepEqual(content.RETAINED_AFTER_WITHDRAW, [
    ["계약 또는 청약철회 등에 관한 기록", "5년", law],
    ["대금결제 및 재화 등의 공급에 관한 기록", "5년", law],
    ["소비자의 불만 또는 분쟁처리에 관한 기록", "3년", law],
    ["표시·광고에 관한 기록", "6개월", law],
    ["가입·결제 전 동의 기록", "위 거래 기록과 같은 기간", "동의 증빙"],
    ["서비스 접속 기록", "3개월", "통신비밀보호법"],
    ["이용 통계·세션 녹화(PostHog)", "제6조 표의 PostHog 보유·이용 기간", "서비스 개선"],
    ["오류 기록", "각 도구의 보관 설정 기간이 지나면 삭제", "서비스 개선"],
  ]);
  const art3 = content.privacyPolicy.sections.find((s) => s.title.startsWith("제3조")).body.find((b) => typeof b === "object" && "table" in b).table.rows;
  // 처리방침 표의 마지막 8행이 같은 배열이다(처리방침 본문은 그대로)
  assert.deepEqual(art3.slice(-content.RETAINED_AFTER_WITHDRAW.length), content.RETAINED_AFTER_WITHDRAW);
  const rows = content.retainedAfterWithdraw();
  assert.deepEqual(rows.map(([item]) => item), content.RETAINED_AFTER_WITHDRAW.map(([item]) => item));
  assert.equal(rows.length, 8);
  // 다른 조문을 가리키는 칸만 그 기간을 옮겨 적는다(PostHog는 제6조와 같은 7년·30일)
  assert.deepEqual(rows.find(([item]) => item.includes("PostHog")), ["이용 통계·세션 녹화(PostHog)", "이용 기록 최대 7년, 세션 녹화 30일"]);
  const privacy = pages.pageHtml(content.privacyPolicy);
  assert.ok(privacy.includes("수집한 날부터 최대 7년, 세션 녹화는 녹화한 날부터 30일"));
  for (const [item, period] of rows.filter(([item]) => !item.includes("PostHog") && item !== "오류 기록"))
    assert.ok(privacy.includes(`<td>${item}</td><td>${period}</td>`), item);
  const html = pages.accountDeletionHtml("CONSUMER");
  for (const [item, period] of rows) assert.ok(html.includes(`<tr><td>${item}</td><td>${period}</td></tr>`), item);
  // 처리방침·약관 하단에도 '계정 삭제' 링크
  assert.ok(privacy.includes('<a href="/account-deletion">계정 삭제</a>'));
  assert.ok(pages.pageHtml(content.termsOfService).includes('<a href="/account-deletion">계정 삭제</a>'));
});

test("DEV-423 AC-01-36: step names match the real screens and the app names match app.json", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = (p) => readFile(p, "utf8");
  const consumerMe = await src("apps/consumer/src/app/(tabs)/me/index.tsx");
  assert.ok(consumerMe.includes('label="회원 탈퇴"'));
  assert.ok((await src("apps/consumer/src/app/(tabs)/_layout.tsx")).includes('label: "내 정보"'));
  const sheet = await src("packages/ui/src/WithdrawSheet.tsx");
  assert.ok(sheet.includes('label="다음"') && sheet.includes('label="탈퇴할게요"'));
  assert.ok(sheet.includes("WITHDRAW_REMOVED"), "the sheet uses the same removed lines");
  const settings = await src("apps/producer/src/app/(tabs)/settings.tsx");
  for (const s of ['title="설정"', 'title="계정"', 'label="회원 탈퇴"', 'label="농가 프로필·공유 링크"']) assert.ok(settings.includes(s), s);
  assert.ok((await src("apps/producer/src/app/(tabs)/_layout.tsx")).includes('label: "설정"'));
  assert.ok((await src("apps/producer/src/app/pending.tsx")).includes('label="회원 탈퇴"'));
  // 소비자 로그인은 next를 받아 그 화면으로 간다(로그인 버튼 /login?next=/me)
  assert.ok((await src("apps/consumer/src/app/login.tsx")).includes("next.startsWith(\"/\")"));
  for (const [app, role] of [["consumer", "CONSUMER"], ["producer", "PRODUCER"]]) {
    const appJson = JSON.parse(await src(`apps/${app}/app.json`));
    assert.equal(content.accountDeletionPage(role).appName, appJson.expo.name);
    assert.equal(await pages.appRoleOf(`apps/${app}/dist`), role);
  }
  await assert.rejects(pages.appRoleOf("scripts/admin-web/dist"));
});

test("DEV-434 AC-01-20: the withdraw sheet's kept line differs by app and shares its ending with the account deletion page", async () => {
  const head = "법으로 보관해야 하는 주문·입금·환불 기록과 주문 문의, 약관 동의 기록은 정해진 기간 동안 따로 보관해요. ";
  // PM 승인 문장(11/22). 앞부분은 두 앱이 같다
  assert.equal(content.WITHDRAW_KEPT.CONSUMER, `${head}농가에게는 ‘탈퇴한 회원’으로 보여요.`);
  assert.equal(content.WITHDRAW_KEPT.PRODUCER, `${head}소비자의 지난 주문에는 농가 이름이 그대로 남아요.`);
  // 생산자가 탈퇴하면 농가는 이름을 둔 채 숨김(SUSPENDED)이라 '탈퇴한 회원'으로 보이지 않는다. 옛 공용 문장도 남지 않는다
  assert.doesNotMatch(content.WITHDRAW_KEPT.PRODUCER, /탈퇴한 회원/);
  for (const role of ["CONSUMER", "PRODUCER"]) {
    assert.doesNotMatch(content.WITHDRAW_KEPT[role], /농가·소비자에게는/);
    // 시트와 계정 삭제 안내가 같은 원본(WITHDRAWN_SEEN_AS)으로 끝난다
    const seen = content.WITHDRAWN_SEEN_AS[role];
    assert.ok(content.WITHDRAW_KEPT[role].endsWith(seen), role);
    assert.ok(content.accountDeletionPage(role).kept.endsWith(seen), role);
    assert.ok(pages.accountDeletionHtml(role).includes(seen), role);
  }
  // 시트는 앱 역할로 줄을 고른다
  const { readFile } = await import("node:fs/promises");
  const sheet = await readFile("packages/ui/src/WithdrawSheet.tsx", "utf8");
  assert.ok(sheet.includes("{KEPT[role]}"), "the sheet picks the kept line by role");
});

test("DEV-476: privacy policy says where the apps keep the login token, without a version bump", () => {
  // 고지일(배포일)과 시행일. legalContent.ts의 TOKEN_STORAGE_NOTICE_DATE·_EFFECTIVE와 같아야 하고, 배포가 밀리면 셋을 함께 고친다
  const NOTICE = "2026년 11월 24일";
  const EFFECTIVE = "2026년 12월 1일";
  const day = (k) => new Date(k.replace(/(\d+)년 (\d+)월 (\d+)일/, "$1-$2-$3").replace(/-(\d)(?=-|$)/g, "-0$1"));
  assert.equal((day(EFFECTIVE) - day(NOTICE)) / 86_400_000, 7, "제14조: 시행 7일 전 고지");
  const html = pages.pageHtml(content.privacyPolicy);
  // 웹은 localStorage, 앱은 expo-secure-store(packages/api/src/storage.native.ts)
  assert.ok(html.includes(`웹 화면에서는 브라우저 저장소(localStorage)에, iOS·Android 앱에서는 기기의 보안 저장소(iOS 키체인, Android Keystore로 암호화한 저장소)에 저장하고, 로그아웃하면 지웁니다(앱 부분은 ${EFFECTIVE}부터 시행).`));
  assert.ok(!html.includes("서비스는 로그인 상태를 유지하기 위해 브라우저 저장소(localStorage)에 로그인 토큰을 저장합니다."));
  assert.match(html, new RegExp(`${NOTICE} 변경: 제10조의 로그인 토큰 저장 위치[^<]*다시 동의를 받지 않습니다`));
  assert.ok(html.includes(`${NOTICE} 변경분(제10조 앱의 로그인 토큰 저장 위치)은 ${EFFECTIVE}부터 시행합니다.`));
  // 고지 문구 정정이라 문서 시행일·동의 버전은 그대로(DEV-122 규칙)
  assert.equal(content.privacyPolicy.effective, "2026년 11월 20일");
  assert.equal(content.LEGAL_VERSION, "2026-11-20");
});

test("DEV-436: privacy policy covers PostHog analytics in the store apps, effective immediately, without a version bump", () => {
  // legalContent.ts의 APP_ANALYTICS_EFFECTIVE와 같아야 한다. 배포가 밀리면 둘을 함께 고친다(PM 11/26: 사전 고지 기간 없이 바로 시행)
  const EFFECTIVE = "2026년 11월 27일";
  const html = pages.pageHtml(content.privacyPolicy);
  // 제2조: 이용 통계는 웹·앱, 세션 녹화는 웹만
  assert.ok(html.includes("이용 통계는 공식 주소의 웹 화면과 정식 배포한 iOS·Android 앱에서, 세션 녹화는 웹 화면에서만, 제10조"));
  // 제6조: 앱에서 보내는 항목과 거부 방법
  const row = html.match(/<tr><td>PostHog, Inc\. \(privacy@posthog\.com\)<\/td>(.*?)<\/tr>/s)?.[1];
  assert.ok(row, "PostHog row in the transfer table");
  for (const item of ["앱 버전", "앱 설치·열기·백그라운드 전환", "세션 녹화(웹 화면만.", "테스트 계정의 기록은 분석에서 뺌"]) assert.ok(row.includes(item), item);
  assert.ok(html.includes("앱에는 전송을 막는 설정이 아직 없으니, 원하지 않으면 웹 화면을 이용하세요."));
  // 원스토어 앱은 preview 채널 빌드라 "미리보기·테스트 빌드는 보내지 않음"이라고 쓰지 않는다
  assert.ok(!row.includes("미리보기·테스트 빌드에서는 보내지 않음"));
  // 제10조: 앱의 자동 수집 장치, 앱은 세션 녹화 없음
  assert.ok(html.includes(`앱에서는 세션 녹화를 하지 않습니다(${EFFECTIVE}부터 시행).`));
  // 제14조: 변경 기록과 시행일
  assert.match(html, new RegExp(`${EFFECTIVE} 변경: PostHog 이용 통계를 웹 화면뿐 아니라[^<]*다시 동의를 받지 않습니다`));
  assert.ok(html.includes(`${EFFECTIVE} 변경분(앱 이용 통계)은 ${EFFECTIVE}부터 시행합니다.`));
  // 처리 근거·동의 항목은 그대로라 문서 시행일·동의 버전은 올리지 않는다(DEV-476과 같은 규칙)
  assert.equal(content.privacyPolicy.effective, "2026년 11월 20일");
  assert.equal(content.LEGAL_VERSION, "2026-11-20");
});

test("DEV-476: the store-facing consumer copy no longer calls the service a test", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const file of [
    "apps/consumer/src/app/checkout/[productId]/index.tsx",
    "apps/consumer/src/app/checkout/[productId]/pay.tsx",
    "apps/consumer/src/app/onboarding/index.tsx",
    "apps/consumer/src/app/login.tsx",
    "apps/consumer/src/lib/onboarding.ts",
  ]) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /테스트 서비스|실제 (입금|결제|돈)/, file);
  }
  const onboarding = await readFile("apps/consumer/src/lib/onboarding.ts", "utf8");
  assert.ok(onboarding.includes("입금은 농가 계좌로 직접 하고, farmclub은 거래를 중개해요."));
  // 약관 본문에는 처음부터 테스트 전제 문장이 없다
  for (const doc of [content.termsOfService, content.privacyPolicy])
    assert.doesNotMatch(pages.pageHtml(doc), /테스트 서비스|실제 (결제|입금|돈)[^<]{0,20}(없|않)/, doc.path);
});
