// 운영 녹화 준비: 녹화에 쓸 브라우저 프로필에서 카카오·관리자 페이지에 직접 로그인해 둔다(비밀번호는 사람이 입력).
//   DEMO_PROFILE=demo/.raw/prod-profile node demo/record/prep-login.mjs  → 창이 뜨면 로그인하고 창을 닫는다
import { chromium } from "playwright";

const profile = process.env.DEMO_PROFILE ?? "demo/.raw/prod-profile";
const ctx = await chromium.launchPersistentContext(profile, { headless: false, viewport: { width: 1280, height: 800 }, locale: "ko-KR" });
const kakao = ctx.pages()[0] ?? (await ctx.newPage());
await kakao.goto("https://accounts.kakao.com/login/?continue=https%3A%2F%2Faccounts.kakao.com%2Fweblogin%2Faccount");
const admin = await ctx.newPage();
await admin.goto(process.env.FARMCLUB_ADMIN_URL ?? "https://admin.farmclub.kr/login");
console.log("창에서 1) 카카오 로그인 2) 관리자 페이지 로그인을 마친 뒤 창을 닫아 주세요.");
await new Promise((r) => ctx.on("close", r));
console.log("로그인 상태를 저장했어요:", profile);
