// DEV-134 데모 시나리오 → 사이트 생성(demo/cmd/site.mjs), 녹화·업로드 계획(record.mjs·publish.mjs).
// 실제 demo/site 파일 대신 같은 구조의 작은 HTML로 비교한다(사이트 문구가 바뀌어도 이 테스트는 그대로).
import assert from "node:assert/strict";
import { test } from "node:test";

import { ROLES, scenario, segmentsByRole, validateScenario } from "../demo/scenario.mjs";
import { formatDuration, parseArgs } from "../demo/cmd/lib.mjs";
import { planPublish } from "../demo/cmd/publish.mjs";
import { planRecord } from "../demo/cmd/record.mjs";
import { captionDrift, idsShort, renderSite, storyCaptions } from "../demo/cmd/site.mjs";

const mini = {
  iteration: "t1",
  order: ["p1", "a1", "c1"],
  footer: "하단 '문구' & 끝",
  segments: {
    p1: { story: { title: "가입", desc: "농가가 신청해요.", feat: ["FEAT-01", "FEAT-02"] }, steps: [{ title: "신청", desc: "적고 신청해요.", feat: ["FEAT-01"], captions: [{ title: "신청", desc: "적어요.\n신청해요.", ids: "FEAT-01" }] }] },
    a1: { story: { title: "승인", desc: "운영자가 승인해요.", feat: ["FEAT-01", "DEV-82", "DEV-83"] }, steps: [{ title: "로그인", desc: "비밀번호로.", feat: ["DEV-82", "DEV-83"], captions: [{ title: "관리자 로그인", desc: "공용 비밀번호", ids: "DEV-82", when: "prod" }] }, { title: "승인", desc: "'{farm}' 승인", feat: ["FEAT-01"], captions: [{ title: "농가 승인", desc: "'{farm}'을 승인해요.", ids: "FEAT-01" }] }] },
    c1: { story: { title: "예약", desc: "소비자가 <예약>해요.", feat: ["FEAT-07"] }, steps: [{ title: "상세", desc: "봐요.", feat: ["FEAT-07"], captions: [{ title: "상세", desc: "", ids: "" }] }, { title: "주문서", desc: "동의해요.", feat: ["FEAT-08", "FEAT-09"], captions: [{ title: "주문서", desc: "", ids: "" }] }] },
  },
};
const head = (cur) => `<html><head><style>li{}</style></head><body><nav><a href="/" ${cur}>x</a></nav><h1>제목은 그대로</h1>`;
const page = (video) => `${head("")}<div class="grid"><div class="video"><video src="/videos/${video}"></video><div class="meta"><span>9:99 · 소리 없음</span><a href="/videos/${video}" download>영상 받기</a></div></div><ol aria-label="영상 단계"><li>옛 단계</li></ol></div><footer>옛 문구</footer></body></html>`;
const pages = {
  "index.html": `${head("aria-current=page")}<div class="video"><div class="meta"><span>1:00 · 소리 없음</span></div></div><ol class="story" aria-label="흐름"><li>옛</li></ol><div class="cards"><a class="card" href="/consumer"><b>소비자 앱</b><span>예약까지 · 1:11</span></a><a class="card" href="/producer"><b>생산자 앱</b><span>가입·판매 · 2:22</span></a><a class="card" href="/admin"><b>관리자 페이지</b><span>승인 · 3:33</span></a></div><footer>옛 문구</footer></body></html>`,
  "consumer/index.html": page("consumer.mp4"),
  "producer/index.html": page("producer.mp4"),
  "admin/index.html": page("admin.mp4"),
};
const manifest = { iteration: "t1", videos: { "story.mp4": { seconds: 125.5 }, "consumer.mp4": { seconds: 59.6 }, "producer.mp4": { seconds: 40.2 }, "admin.mp4": { seconds: 25.4 } } };

test("DEV-134 시나리오: 모양 점검 통과, 구간은 역할(p·a·c)별로 나뉜다", () => {
  assert.deepEqual(validateScenario(scenario), []);
  const byRole = segmentsByRole(scenario.order);
  assert.deepEqual(Object.keys(byRole).sort(), Object.keys(ROLES).sort());
  assert.deepEqual([...byRole.p, ...byRole.a, ...byRole.c].sort(), [...scenario.order].sort());
  assert.deepEqual(validateScenario(mini), []);
  assert.match(validateScenario({ ...mini, order: ["p1", "p1", "x1"] }).join("\n"), /두 번[\s\S]*p·a·c[\s\S]*a1: segments에 있지만 order에 없음/);
});

test("DEV-134 사이트 생성: 손으로 쓰던 부분(단계 목록·길이·카드 길이·하단 문구)만 시나리오와 manifest로 바뀐다", () => {
  const { pages: out, warnings } = renderSite(pages, { scenario: mini, manifest });
  assert.deepEqual(warnings, []);
  assert.equal(
    out["index.html"],
    `${head("aria-current=page")}<div class="video"><div class="meta"><span>2:06 · 소리 없음</span></div></div><ol class="story" aria-label="흐름">` +
      `<li><span class="who">생산자</span><span class="t">가입</span><span class="d">농가가 신청해요.</span><span class="id">FEAT-01 · 02</span></li>` +
      `<li><span class="who">관리자</span><span class="t">승인</span><span class="d">운영자가 승인해요.</span><span class="id">FEAT-01 · DEV-82 · 83</span></li>` +
      `<li><span class="who">소비자</span><span class="t">예약</span><span class="d">소비자가 &lt;예약&gt;해요.</span><span class="id">FEAT-07</span></li></ol>` +
      `<div class="cards"><a class="card" href="/consumer"><b>소비자 앱</b><span>예약까지 · 1:00</span></a><a class="card" href="/producer"><b>생산자 앱</b><span>가입·판매 · 0:40</span></a><a class="card" href="/admin"><b>관리자 페이지</b><span>승인 · 0:25</span></a></div>` +
      `<footer>하단 &#x27;문구&#x27; &amp; 끝</footer></body></html>`,
  );
  assert.equal(
    out["admin/index.html"],
    `${head("")}<div class="grid"><div class="video"><video src="/videos/admin.mp4"></video><div class="meta"><span>0:25 · 소리 없음</span><a href="/videos/admin.mp4" download>영상 받기</a></div></div><ol aria-label="영상 단계">` +
      `<li><span class="n">1</span><span class="t">로그인</span><span class="d">비밀번호로.</span><span class="id">DEV-82 · DEV-83</span></li>` +
      `<li><span class="n">2</span><span class="t">승인</span><span class="d">&#x27;{farm}&#x27; 승인</span><span class="id">FEAT-01</span></li></ol></div><footer>하단 &#x27;문구&#x27; &amp; 끝</footer></body></html>`,
  );
  assert.match(out["consumer/index.html"], /<span>1:00 · 소리 없음<\/span>.*<span class="n">2<\/span><span class="t">주문서<\/span><span class="d">동의해요\.<\/span><span class="id">FEAT-08 · FEAT-09<\/span>/);
  // 다시 돌려도 같다(멱등)
  assert.deepEqual(renderSite(out, { scenario: mini, manifest }).pages, out);
});

test("DEV-134 사이트 생성: manifest가 없으면 길이는 그대로 두고 경고, 자리를 못 찾으면 멈춘다", () => {
  const { pages: out, warnings } = renderSite(pages, { scenario: mini, manifest: null });
  assert.match(out["index.html"], /<span>1:00 · 소리 없음<\/span>/);
  assert.match(out["index.html"], /예약까지 · 1:11/);
  assert.equal(warnings.length, 4);
  assert.throws(() => renderSite({ ...pages, "producer/index.html": "<html><footer></footer></html>" }, { scenario: mini, manifest }), /producer\/index\.html: 단계 목록 자리를 찾지 못했어요/);
});

test("DEV-134 길이·ID 표기: m:ss 반올림, 전체 흐름 ID는 같은 접두어를 줄인다", () => {
  assert.equal(formatDuration(294.53), "4:55");
  assert.equal(formatDuration(112.9), "1:53");
  assert.equal(formatDuration(29.4), "0:29");
  assert.equal(formatDuration(59.6), "1:00");
  assert.equal(idsShort(["FEAT-02", "FEAT-03", "FEAT-19"]), "FEAT-02 · 03 · 19");
  assert.equal(idsShort(["FEAT-04", "DEV-87"]), "FEAT-04 · DEV-87");
});

test("DEV-134 자막 점검: story.mjs cap() 인자를 구간별로 읽고 시나리오와 다른 곳을 찾는다", () => {
  const src = [
    "async function adminHome() {",
    '  await cap("관리자 로그인", "공용 비밀번호", "DEV-82");',
    "}",
    "const segments = {",
    "  async p1() {",
    '    await cap("신청", "적어요.\\n신청해요.", "FEAT-01");',
    "  },",
    "  async a1() {",
    "    await cap(\"농가 승인\", `'${FARM.name}'을 승인해요.`, \"FEAT-01\");",
    "  },",
    "  async c1() {",
    '    await cap("상세");',
    '    await cap("주문서");',
    "  },",
    "};",
  ].join("\n");
  const caps = storyCaptions(src);
  assert.deepEqual(caps.p1, [{ title: "신청", desc: "적어요.\n신청해요.", ids: "FEAT-01" }]);
  assert.deepEqual(caps.a1, [{ title: "농가 승인", desc: "'{farm}'을 승인해요.", ids: "FEAT-01" }]);
  assert.deepEqual(caps["*"].map((c) => c.title), ["관리자 로그인"]);
  assert.deepEqual(captionDrift(src, mini), []);
  const drift = captionDrift(src.replace("신청해요.", "신청!"), mini);
  assert.equal(drift.length, 2);
  assert.match(drift.join("\n"), /p1: 시나리오에만 있음[\s\S]*p1: story\.mjs에만 있음/);
});

test("DEV-134 demo:record 계획: local은 로컬 주소·관리자 비밀번호 확인, prod는 프로필과 --yes가 있어야 한다", () => {
  // 실제 시나리오 대신 작은 고정 시나리오(mini: p1·a1·c1)로 본다. 시나리오에 구간이 늘어도(I3 p5·c4 등) 이 테스트는 그대로
  const plan = (argv, env) => planRecord(argv, env, mini);
  const local = plan(["--target", "local", "p1", "c1"], { DEMO_API_PORT: "8134", DEMO_CONSUMER_PORT: "8234" });
  assert.deepEqual(local.problems, []);
  assert.deepEqual(local.segments, ["p1", "c1"]);
  assert.equal(local.env.FARMCLUB_API_URL, "http://localhost:8134");
  assert.equal(local.env.FARMCLUB_CONSUMER_URL, "http://localhost:8234");
  assert.equal(local.env.FARMCLUB_PRODUCER_URL, "http://localhost:8082");
  assert.equal(local.env.DEMO_KAKAO, "0");
  assert.deepEqual(plan([], {}).segments, mini.order);
  assert.match(plan(["a1"], {}).problems.join(), /ADMIN_WEB_PASSWORD/);
  assert.deepEqual(plan(["a1"], { ADMIN_WEB_PASSWORD: "x" }).problems, []);
  assert.match(plan(["p1"], { FARMCLUB_API_URL: "https://api.farmclub.kr" }).problems.join(), /로컬 주소가 아니에요/);
  assert.match(plan(["--target", "staging"], {}).problems.join(), /local 또는 prod/);
  assert.match(plan(["z9"], {}).problems.join(), /모르는 구간: z9/);
  assert.match(plan(["p5"], {}).notes.join(), /시나리오 순서에 없는 구간: p5/);
  assert.deepEqual(plan(["p1"], {}).notes, []);
  // 실제 시나리오: 기본(구간 없음)은 order 전체이고, order에 있는 구간은 알림 없이 찍는다
  const real = planRecord([], { ADMIN_WEB_PASSWORD: "x" });
  assert.deepEqual(real.segments, scenario.order);
  assert.deepEqual(real.problems, []);
  assert.deepEqual(real.notes, []);

  const prod = plan(["--target", "prod", "p1"], {});
  assert.match(prod.problems.join("\n"), /DEMO_PROFILE[\s\S]*--yes/);
  const ok = plan(["--target", "prod", "--yes", "p1"], { DEMO_PROFILE: "demo/.raw/prod-profile" });
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.env.DEMO_KAKAO, "1");
  assert.equal(ok.env.FARMCLUB_CONSUMER_URL, "https://farmclub.kr");
  assert.equal(plan(["--target=prod", "--dry-run"], { DEMO_PROFILE: "p" }).problems.length, 0);
});

test("DEV-134 demo:publish 계획: 영상이 다 있고 길이가 manifest와 같아야 하며, 새 Release는 영상이 모두 있어야 한다", () => {
  const exists = (f) => !f.endsWith("admin.mp4");
  const probeFn = (f) => ({ seconds: f.endsWith("story.mp4") ? 130 : manifest.videos[f.split("/").at(-1)].seconds });
  const current = { release: "demo-t1", files: { "story.mp4": {}, "consumer.mp4": {}, "producer.mp4": {}, "admin.mp4": {} } };
  const bad = planPublish({ dir: "/tmp/out", manifest, scenario: mini, current, exists, probeFn });
  assert.equal(bad.release, "demo-t1");
  assert.match(bad.problems.join("\n"), /story\.mp4: 길이 130\.00s가 manifest 125\.5s와 달라요[\s\S]*admin\.mp4이 없어요/);
  const good = planPublish({ dir: "/tmp/out", tag: "demo-t2", manifest, scenario: mini, current, exists: () => true, probeFn: (f) => ({ seconds: manifest.videos[f.split("/").at(-1)].seconds }) });
  assert.deepEqual(good.problems, []);
  assert.deepEqual(good.command.slice(0, 3), ["node", "demo/videos.mjs", "upload"]);
  assert.equal(good.command.at(-1), "demo-t2");
  assert.match(planPublish({ dir: "/tmp/out", manifest, scenario: mini, current, exists: () => true, probeFn: (f) => ({ seconds: manifest.videos[f.split("/").at(-1)].seconds }), listMp4: () => ["story.mp4", "p1.mp4"] }).problems.join(), /manifest에 없는 mp4가 있어요.*p1\.mp4/);
  const partial = { iteration: "t1", videos: { "story.mp4": manifest.videos["story.mp4"] } };
  assert.match(planPublish({ dir: "/tmp/out", tag: "demo-t2", manifest: partial, scenario: mini, current, exists: () => true, probeFn: () => ({ seconds: 125.5 }) }).problems.join(), /새 Release demo-t2에는 영상이 모두/);
  assert.match(planPublish({ dir: "/tmp/out", manifest: null, scenario: mini, current }).problems.join(), /manifest\.json이 없어요/);
});

test("DEV-134 인자 읽기: --key value, --key=value, 플래그, 위치 인자", () => {
  assert.deepEqual(parseArgs(["--target", "local", "p1", "--dry-run", "--x=1", "a1"], { flags: ["dry-run"] }), { opts: { target: "local", "dry-run": true, x: "1" }, rest: ["p1", "a1"] });
  assert.throws(() => parseArgs(["--target"]), /needs a value/);
});
