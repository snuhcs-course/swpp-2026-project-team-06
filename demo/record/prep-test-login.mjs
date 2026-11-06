// 로컬 녹화 준비(I3, DEV-181): 영상에 로그인 장면이 나오지 않도록, 녹화 전에 테스트 계정으로 미리 로그인해 둔다.
// 테스트 계정 로그인은 시험용 화면이라 영상에 넣지 않는다(실제 로그인은 카카오).
//   DEMO_PROFILE=demo/.raw/local-profile ADMIN_WEB_PASSWORD=<로컬 값> node demo/record/prep-test-login.mjs
// 그다음 같은 DEMO_PROFILE로 story.mjs를 실행하면 모든 구간이 로그인된 상태로 시작한다.
import { chromium } from "playwright";

import { consumerUrl, producerUrl } from "./lib.mjs";

const profile = process.env.DEMO_PROFILE ?? "demo/.raw/local-profile";
const adminUrl = process.env.FARMCLUB_ADMIN_URL ?? "http://127.0.0.1:8090";
const ctx = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 1280, height: 800 }, locale: "ko-KR" });
const page = ctx.pages()[0] ?? (await ctx.newPage());
const btn = (name) => page.getByRole("button", { name });

// 소비자: 김민지
await page.goto(`${consumerUrl}/login`);
await page.getByRole("radio").filter({ hasText: "김민지" }).click();
await btn(/로그인$/).click();
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });

// 생산자: 신규 생산자(농가 없음 → 가입 신청부터)
await page.goto(`${producerUrl}/login`);
await page.getByRole("radio", { name: /신규 생산자/ }).first().click();
await btn(/시작하기$/).click();
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });

// 관리자 페이지
if (process.env.ADMIN_WEB_PASSWORD) {
  await page.goto(`${adminUrl}/login`);
  await page.locator("input[type=password]").fill(process.env.ADMIN_WEB_PASSWORD);
  await btn("로그인").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
}

await ctx.close();
console.log("테스트 계정 로그인 상태를 저장했어요:", profile);
