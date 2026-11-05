// DEV-236 Vercel 기본 주소(farmclub-consumer.vercel.app, farmclub-producer.vercel.app)가 공식 도메인으로 넘어가지 않고
// 그 주소 안에서 동작한다. DEV-127의 308 리다이렉트 대신 검색엔진에 안 잡히게 X-Robots-Tag만 붙인다.
// - 두 앱 vercel.json: 리다이렉트 없음, 기본 주소 host에만 noindex 헤더, 기존 rewrite(/s/·약관·SPA) 그대로
// - 웹 카카오 인가 요청·복귀 화면의 redirect_uri는 접속한 주소 기준(서버는 CONSUMER_APP_ALT_URLS 등으로 받는다)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const json = (p) => JSON.parse(readFileSync(path.join(root, p), "utf8"));

const APPS = {
  consumer: {
    host: "farmclub-consumer.vercel.app",
    rewrites: ["/s/:path*", "/privacy", "/terms", "/(.*)"],
  },
  producer: {
    host: "farmclub-producer.vercel.app",
    rewrites: ["/privacy", "/terms", "/(.*)"],
  },
};

for (const [app, { host, rewrites }] of Object.entries(APPS)) {
  test(`DEV-236 ${app} vercel.json: ${host}는 리다이렉트 없이 noindex 헤더만`, () => {
    const vercel = json(`apps/${app}/vercel.json`);
    assert.equal(vercel.redirects, undefined, "redirects가 없다(공식 도메인으로 넘기지 않는다)");
    assert.equal(vercel.redirect, undefined);
    const robots = vercel.headers.filter((h) => h.headers.some((x) => x.key === "X-Robots-Tag"));
    assert.equal(robots.length, 1);
    const [rule] = robots;
    assert.equal(rule.source, "/(.*)", "모든 경로");
    assert.deepEqual(rule.has, [{ type: "host", value: host }], "기본 주소 host에만(공식 도메인은 색인)");
    assert.deepEqual(rule.headers, [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]);
    assert.deepEqual(
      vercel.rewrites.map((r) => r.source),
      rewrites,
      "rewrite는 그대로(SPA fallback이 마지막)",
    );
    assert.equal(vercel.rewrites.at(-1).destination, "/index.html");
  });

  test(`DEV-236 ${app} 웹 카카오 redirect_uri는 접속한 주소(${host}) 기준`, async () => {
    const web = await import(`../apps/${app}/src/lib/kakao.ts`);
    const saved = globalThis.window;
    try {
      for (const origin of [`https://${host}`, `https://${app === "consumer" ? "farmclub.kr" : "farm.farmclub.kr"}`]) {
        globalThis.window = { location: { origin } };
        assert.equal(web.kakaoRedirectUri({ redirectPath: "/auth/kakao" }), `${origin}/auth/kakao`);
        assert.equal(web.kakaoCallbackUri(), `${origin}/auth/kakao`);
        assert.equal(web.appOrigin(), origin);
      }
    } finally {
      globalThis.window = saved;
    }
  });
}
