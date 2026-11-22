// DEV-437: 팀 안내 페이지 어긋남 검사(scripts/ci/check-guide.mjs) 시나리오.
//   node --test scripts/ci/test-check-guide.mjs   (make test-ci, CI guide job)
// 실제 AGENTS.md·페이지는 쓰지 않는다(규칙을 바꾸는 정상 PR이 이 테스트를 깨지 않게). 실제 대조는 CLI 실행이 한다.
import assert from "node:assert/strict";
import { test } from "node:test";

import { KEYS, REPO_URL, anchors, annotations, checkGuide, format, pageValues, slug } from "./check-guide.mjs";

// AGENTS.md 모양을 흉내 낸 작은 조각. 값은 실제와 달라도 된다.
const AGENTS = `# AGENTS.md

## 작업 순서 (Spec-Anchored)
1. **이슈** 첫째.
2. **브랜치** 둘째.
3. **머지** 셋째.

## Spec-Anchored 원칙 (에이전트 필수)
- 화면은 Vercel 기본 주소(\`a.example.app\`, \`b.example.app\`)를 쓴다.

## 브랜치·커밋·PR
- 브랜치 이름은 \`<id>/<key>-<summary>\`(소문자만).
- **X-1(이유) 전까지는 쌓지 않는다.**
- 커밋: \`type(scope): 요약 (X-1)\` — type은 \`feat\` \`fix\`. 한 커밋은 한 가지 변경.
- PR 제목: \`[X-1] <summary>\`
- 머지 큐(필수 체크 \`ci-ok\`·\`lint\`)로 머지한다.
- fail이면 처리 결정(고침·오탐)을 코멘트에 적는다.

## 사람·에이전트 역할 (SWPP-1)
- 고위험 경로: \`db/**\`, \`AGENTS.md\`. 하나라도 바꾸면 고위험.

## AI 사용 기록
- AI를 쓴 작업은 PR 본문에 \`Agent / Human\`을 적는다(시간은 0.5시간 단위).

## 공용 스킬 (\`.agents/skills/\`)
| 스킬 | 언제 |
| -- | -- |
| \`spec\` | 시작 |
| \`review\` | 리뷰 |

## 금지
\`\`\`
## 코드 펜스 안 제목은 제목이 아니다
\`\`\`
`;

const ok = `${REPO_URL}/blob/main`;
const HTML = `<!doctype html><html><body>
<nav><a href="#top">맨 위</a></nav>
<main id="top">
<code data-agents="branch">&lt;id&gt;/&lt;key&gt;-&lt;summary&gt;</code>
<code data-agents="commit">type(scope): 요약 (X-1)</code>
<code data-agents="commit" data-check="set">feat fix</code>
<code data-agents="pr-title">[X-1] &lt;summary&gt;</code>
<code data-agents="checks" data-check="set">ci-ok</code> <code data-agents="checks" data-check="set">lint</code>
<code data-agents="high-risk" data-check="set">db/**</code><code data-agents="high-risk" data-check="set">AGENTS.md</code>
<b data-agents="high-risk" data-check="count">2</b>
<b data-agents="steps" data-check="count">3</b>
<ol data-agents-list="steps"><li>a</li><li>b</li><li>c</li></ol>
<code data-agents="skills" data-check="set">spec</code> <code data-agents="skills" data-check="set">review</code>
<code data-agents="ai-log">Agent / Human</code> <span data-agents="ai-log">0.5시간 단위</span>
<span data-agents="spec-check">고침·오탐</span>
<code data-agents="test-urls">a.example.app</code> <code data-agents="test-urls">b.example.app</code>
<span data-agents="stacking">X-1(이유) 전까지는 쌓지 않는다</span>
<a href="${ok}/AGENTS.md#브랜치커밋pr">원문</a> <a href="${REPO_URL}/tree/main/docs">폴더</a>
<a href="https://www.figma.com/design/x">외부</a>
</main></body></html>`;

const FILES = { "AGENTS.md": AGENTS, docs: null, "docs/a.md": "# A\n## 같은 제목\n## 같은 제목\n" };
const read = (p) => (p in FILES ? FILES[p] : undefined);
const run = ({ agents = AGENTS, html = HTML } = {}) => checkGuide({ agents, html, readRepoFile: read });
const keysOf = (errors) => [...new Set(errors.map((e) => e.key))].sort();
const swap = (s, a, b) => {
  assert.ok(s.includes(a), `fixture has no ${a}`);
  return s.replace(a, b);
};

test("fixture passes", () => {
  const errors = run();
  assert.deepEqual(errors, [], format(errors));
});

test("every key in KEYS appears in the fixture with every declared method", () => {
  const { values } = pageValues(HTML);
  for (const [key, def] of Object.entries(KEYS)) {
    for (const how of ["text", "set", "count"].filter((h) => def[h])) assert.ok(values.some((v) => v.key === key && v.how === how), `${key}/${how}`);
  }
});

// 키·방식마다: 페이지 값을 틀리면 그 키만 실패하고, 메시지에 줄·실제값·기대값이 있다.
const drift = {
  "branch/text": ["&lt;summary&gt;</code>\n<code data-agents=\"commit\">", "&lt;sum&gt;</code>\n<code data-agents=\"commit\">"],
  "commit/text": ["type(scope): 요약 (X-1)</code>", "type(scope): 요약</code>"],
  "commit/set": [">feat fix<", ">feat fix chore<"],
  "pr-title/text": ["[X-1] &lt;summary&gt;", "[X-1] summary"],
  "checks/set": [">lint<", ">lint2<"],
  "high-risk/set": [">db/**<", ">db/*<"],
  "high-risk/count": ['data-check="count">2<', 'data-check="count">3<'],
  "steps/count": ['data-check="count">3<', 'data-check="count">4<'],
  "skills/set": [">review<", ">pr-review<"],
  "ai-log/text": [">0.5시간 단위<", ">1시간 단위<"],
  "spec-check/text": [">고침·오탐<", ">고침<"],
  "test-urls/text": [">b.example.app<", ">c.example.app<"],
  "stacking/text": ["전까지는 쌓지 않는다</span>", "전까지는 쌓는다</span>"],
};
for (const [name, [a, b]] of Object.entries(drift)) {
  test(`drift fails only its key: ${name}`, () => {
    const key = name.split("/")[0];
    const errors = run({ html: swap(HTML, a, b) });
    assert.deepEqual(keysOf(errors), [key], format(errors));
    assert.ok(errors.every((e) => e.actual && e.expected));
    assert.ok(errors.some((e) => e.line > 0));
  });
}
test("drift cases cover every key in KEYS", () => {
  const covered = new Set(Object.keys(drift).map((n) => n.split("/")[0]));
  assert.deepEqual([...covered].sort(), Object.keys(KEYS).sort());
});

test("text compares whole values, not substrings", () => {
  // 빈 요소, 짧은 부분 문자열
  assert.deepEqual(keysOf(run({ html: swap(HTML, ">0.5시간 단위<", "><") })), ["ai-log"]);
  assert.deepEqual(keysOf(run({ html: swap(HTML, ">0.5시간 단위<", ">시간<") })), ["ai-log"]);
  // AGENTS.md가 규칙을 바꾸면서 같은 구절을 남겨도, 값을 뽑지 못하면 실패
  const lifted = swap(AGENTS, "**X-1(이유) 전까지는 쌓지 않는다.**", "X-1(이유) 전까지는 쌓지 않는다는 규칙은 없앴다.");
  const errors = run({ agents: lifted });
  assert.deepEqual(keysOf(errors), ["stacking"]);
  assert.match(errors[0].expected, /뽑지 못했다/);
});

test("comments, hidden and <template> elements do not count", () => {
  const commented = swap(HTML, '<code data-agents="branch">&lt;id&gt;/&lt;key&gt;-&lt;summary&gt;</code>', '<!-- <code data-agents="branch">&lt;id&gt;/&lt;key&gt;-&lt;summary&gt;</code> --><code>x</code>');
  assert.deepEqual(keysOf(run({ html: commented })), ["branch"]);
  const hidden = swap(HTML, '<span data-agents="stacking">', '<span hidden data-agents="stacking">');
  assert.deepEqual(keysOf(run({ html: hidden })), ["stacking"]);
  const inTemplate = swap(HTML, '<span data-agents="spec-check">고침·오탐</span>', '<template><span data-agents="spec-check">고침·오탐</span></template>');
  assert.deepEqual(keysOf(run({ html: inTemplate })), ["spec-check"]);
  const hiddenParent = swap(HTML, '<code data-agents="test-urls">b.example.app</code>', '<div hidden><code data-agents="test-urls">b.example.app</code></div>');
  assert.deepEqual(keysOf(run({ html: hiddenParent })), ["test-urls"]);
});

test("attribute quoting and nested same tags are read, stray data-agents fail", () => {
  const single = swap(HTML, '<code data-agents="test-urls">b.example.app</code>', "<code data-agents='test-urls'>b.exampel.app</code>");
  assert.deepEqual(keysOf(run({ html: single })), ["test-urls"]);
  const nested = swap(HTML, '<span data-agents="spec-check">고침·오탐</span>', '<span data-agents="spec-check"><span>고침</span>·아무거나</span>');
  assert.deepEqual(keysOf(run({ html: nested })), ["spec-check"]);
  const nestedOk = swap(HTML, '<span data-agents="spec-check">고침·오탐</span>', '<span data-agents="spec-check"><span>고침</span>·오탐</span>');
  assert.deepEqual(run({ html: nestedOk }), []);
  const stray = swap(HTML, "</main>", "<p>data-agents=\"branch\" 를 글로 쓴 문장</p></main>");
  assert.deepEqual(run({ html: stray }), []); // 태그 밖 글은 속성이 아니다
  const unquoted = swap(HTML, "</main>", "<code data-agents=branch>x</code></main>");
  assert.deepEqual(keysOf(run({ html: unquoted })), ["(형식)"]);
});

test("list item count follows the count key", () => {
  const extra = swap(HTML, "<li>c</li></ol>", "<li>c</li><li>d</li></ol>");
  const errors = run({ html: extra });
  assert.deepEqual(keysOf(errors), ["steps"]);
  assert.match(errors[0].actual, /목록 항목 4개/);
});

test("missing section, missing key, unknown key and unsupported method", () => {
  const noSection = swap(AGENTS, "## AI 사용 기록", "## AI 기록");
  assert.match(run({ agents: noSection }).find((e) => e.key === "ai-log").expected, /절이 있어야 한다/);
  const removed = run({ html: HTML.replaceAll(' data-agents="test-urls"', "") });
  assert.deepEqual(keysOf(removed), ["test-urls"]);
  assert.equal(removed[0].line, null);
  assert.match(format(removed), /위치 없음/);
  assert.deepEqual(keysOf(run({ html: swap(HTML, "</main>", '<code data-agents="nope">x</code></main>') })), ["nope"]);
  assert.deepEqual(keysOf(run({ html: swap(HTML, "</main>", '<b data-agents="branch" data-check="count">1</b></main>') })), ["branch"]);
});

test("links: only the canonical repo form, existing files and headings", () => {
  const bad = (href) => keysOf(run({ html: swap(HTML, "</main>", `<a href="${href}">x</a></main>`) }));
  assert.deepEqual(bad(`${ok}/AGENTS.md#금지`), []);
  assert.deepEqual(bad(`${ok}/AGENTS.md#코드-펜스-안-제목은-제목이-아니다`), ["sections"]);
  assert.deepEqual(bad(`${ok}/NOPE.md`), ["sections"]);
  assert.deepEqual(bad(`${ok}/docs#x`), ["sections"]);
  assert.deepEqual(bad(`${ok}/docs/a.md#같은-제목-1`), []);
  assert.deepEqual(bad(`${ok}/docs/a.md#같은-제목-2`), ["sections"]);
  assert.deepEqual(bad(`${ok}/AGENTS.md#%E0%A4%A`), ["sections"]); // 잘못된 URL 인코딩도 같은 형식의 오류
  assert.deepEqual(bad(`http://github.com/snuhcs-course/swpp-2026-project-team-06/blob/main/AGENTS.md`), ["sections"]);
  assert.deepEqual(bad(`${REPO_URL}/blob/dev/AGENTS.md`), ["sections"]);
  assert.deepEqual(bad("../../AGENTS.md"), ["sections"]);
  assert.deepEqual(bad("#nowhere"), ["sections"]);
  assert.deepEqual(keysOf(run({ html: swap(HTML, `<a href="${ok}/AGENTS.md#브랜치커밋pr">원문</a>`, `<a href='${ok}/AGENTS.md#없음'>원문</a>`) })), ["sections"]);
  assert.deepEqual(keysOf(run({ html: HTML.replace(/<a href="https:\/\/github[^>]*>[^<]*<\/a>/g, "") })), ["sections"]);
});

test("anchors follow GitHub: slug rules, code fences, duplicates", () => {
  assert.equal(slug("브랜치·커밋·PR"), "브랜치커밋pr");
  assert.equal(slug("사람·에이전트 역할 (SWPP-126)"), "사람에이전트-역할-swpp-126");
  assert.equal(slug("제품 스펙 (`docs/spec/`)"), "제품-스펙-docsspec");
  assert.equal(slug("CI 길(lane) — DEV-234"), "ci-길lane--dev-234");
  assert.equal(slug("Spec ↔ Code 확인 표 (spec-check 형식)"), "spec--code-확인-표-spec-check-형식");
  assert.equal(slug("1.1 결과가 fail일 때"), "11-결과가-fail일-때");
  assert.deepEqual(anchors("# A\n```\n# not\n```\n## A\n## A"), ["a", "a-1", "a-2"]);
});

test("GitHub Actions annotations carry file and line", () => {
  const errors = run({ html: swap(HTML, ">0.5시간 단위<", ">1시간 단위<") });
  const [a] = annotations(errors);
  assert.match(a, /^::error file=docs\/guide\/index\.html,line=\d+::\[ai-log\]/);
});
