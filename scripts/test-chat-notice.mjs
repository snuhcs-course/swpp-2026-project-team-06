// DEV-475 (FEAT-12 AC-12-19·20·23, M-25): 원스토어 공지 29889 — 채팅방 여섯 곳에 주의·제재 안내를 고정해 보인다.
// 문구·조건은 packages/ui/src/chatNoticeCopy.ts를 직접 읽고, 부품은 react-native-web + react-dom/server로 실제로 그려 보며,
// ChatThread·NewsRoom에서 띠가 조건 없이 그려지는지는 TypeScript AST로, 방 배선은 소스로 확인한다(방 하나라도 빠지면 실패).
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import Module, { createRequire } from "node:module";
import {
  CHAT_NOTICE_BAND,
  CHAT_NOTICE_COMPACT,
  CHAT_NOTICE_SUPPORT_LABEL,
  CHAT_NOTICE_TITLE,
  chatNoticeCompact,
  chatNoticeLines,
} from "../packages/ui/src/chatNoticeCopy.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// 공지가 요구하는 세 가지: 윤리(제재), 개인정보, 결제정보
const requiredParts = (text) => {
  for (const word of ["욕설", "음란", "광고", "제재", "결제", "개인정보"])
    assert.ok(text.includes(word), `‘${word}’가 빠졌어요: ${text}`);
};

test("DEV-475 AC-12-19: band copy is the approved two sentences with ethics, payment and personal info", () => {
  assert.equal(CHAT_NOTICE_BAND, "욕설·비방·음란·광고는 제재돼요. 결제·개인정보는 채팅으로 알리지 마세요.");
  requiredParts(CHAT_NOTICE_BAND);
  assert.ok(CHAT_NOTICE_BAND.includes("비방"));
});

test("DEV-475 AC-12-19: the folded one-line band keeps all three parts", () => {
  requiredParts(CHAT_NOTICE_COMPACT);
  assert.ok(CHAT_NOTICE_COMPACT.length <= 28, "한 줄(360 폭 12px)에 들어가야 해요");
});

test("DEV-475 AC-12-19: band folds only with the keyboard on a short screen, or in a very short window", () => {
  assert.equal(chatNoticeCompact(true, 640), true); // 360×640 + 키보드
  assert.equal(chatNoticeCompact(true, 667), true); // iPhone SE + 키보드
  assert.equal(chatNoticeCompact(false, 640), false); // 키보드 없으면 두 줄
  assert.equal(chatNoticeCompact(true, 844), false); // 큰 화면은 키보드가 떠도 두 줄
  assert.equal(chatNoticeCompact(false, 480), true);
});

test("DEV-475 AC-12-19: support rooms always use the one-line band (board 2: one line under the existing intro)", () => {
  assert.equal(chatNoticeCompact(false, 844, true), true);
  assert.equal(chatNoticeCompact(false, 1200, true), true);
});

test("DEV-475 AC-12-20: consumer sheet lines and support link", () => {
  assert.equal(CHAT_NOTICE_TITLE, "채팅 이용 안내");
  assert.equal(CHAT_NOTICE_SUPPORT_LABEL, "운영팀에 알리기");
  assert.deepEqual(chatNoticeLines("consumer", false), [
    "욕설·비방·음란·광고·스팸은 글을 지우고 이용을 제한할 수 있어요(이용약관 제13조).",
    "보낸 전화번호·계좌번호는 숫자가 ●로 가려져요.",
    "입금은 주문의 ‘입금 안내’에 나온 농가 계좌로만 해 주세요.",
    "불편한 일을 겪었다면 운영팀에 알려 주세요.",
  ]);
});

test("DEV-475 AC-12-20: producer third line, and support rooms have no 'tell the team' line", () => {
  const producer = chatNoticeLines("producer", false);
  assert.equal(producer[2], "소비자에게 계좌·연락처를 따로 묻지 말아 주세요. 주문 정보는 주문 화면에 있어요.");
  assert.equal(producer.length, 4);
  for (const side of ["consumer", "producer"]) {
    const lines = chatNoticeLines(side, true);
    assert.equal(lines.length, 3);
    assert.ok(!lines.some((l) => l.includes("운영팀에 알려")));
  }
});

test("DEV-475 AC-12-20: the sheet cites the terms article that actually lists these bans", () => {
  const terms = read("packages/ui/src/legalContent.ts");
  const at = terms.indexOf('title: "제13조 (금지 행위)"');
  assert.ok(at > 0, "이용약관 제13조(금지 행위)가 있어야 해요");
  const article = terms.slice(at, terms.indexOf("제14조", at));
  for (const word of ["욕설·비방", "광고·스팸", "연락처·계좌", "이용을 제한"]) assert.ok(article.includes(word), word);
});

test("DEV-475 AC-12-19: ChatThread and NewsRoom draw the band above the scrolling timeline and require it", () => {
  for (const file of ["packages/ui/src/ChatThread.tsx", "packages/ui/src/NewsRoom.tsx"]) {
    const src = read(file);
    assert.match(src, /\n  notice: ChatNoticeConfig;/, `${file}: notice는 필수 prop이어야 해요`);
    const band = src.indexOf("<ChatNotice side={producer ? \"producer\" : \"consumer\"} onSupport={notice.onSupport} />");
    const timeline = src.indexOf("<ScrollView", src.indexOf("return (\n    // 메시지 본문"));
    assert.ok(band > 0, `${file}: 띠가 없어요`);
    assert.ok(timeline > band, `${file}: 띠는 스크롤 밖(타임라인 위)에 있어야 해요`);
  }
});

// 여섯 방: [파일, 그 방이 쓰는 부품, 운영팀 방인지]
const ROOMS = [
  ["apps/consumer/src/app/(tabs)/chats/[farmId].tsx", "ChatThread", "link"],
  ["apps/consumer/src/lib/FarmRoom.tsx", "NewsRoom", "link"],
  ["apps/consumer/src/app/(tabs)/chats/support.tsx", "ChatThread", "none"],
  ["apps/producer/src/app/(tabs)/chats/[consumerId].tsx", "ChatThread", "both"],
  ["apps/producer/src/lib/OwnNewsRoom.tsx", "NewsRoom", "link"],
  ["apps/producer/src/app/support.tsx", "ChatThread", "none"],
];

test("DEV-475 AC-12-19: all six rooms pass the notice to their thread", () => {
  for (const [file, part, kind] of ROOMS) {
    const src = read(file);
    const open = src.indexOf(`<${part}\n`);
    assert.ok(open > 0, `${file}: ${part}가 없어요`);
    const props = src.slice(open, src.indexOf("/>", src.indexOf("notice={{", open)) + 2);
    assert.ok(props.includes("notice={{"), `${file}: notice가 빠졌어요`);
    if (kind === "none") assert.match(props, /notice=\{\{ onSupport: null \}\}/, `${file}: 운영팀 방은 null`);
    if (kind === "link") assert.match(props, /onSupport: \(\) =>/, `${file}: ‘운영팀에 알리기’가 있어야 해요`);
    if (kind === "both") assert.match(props, /onSupport: support \? null : \(\) =>/, file);
  }
  // 운영팀 대화방 주소
  assert.match(read(ROOMS[0][0]), /"\/chats\/support"/);
  assert.match(read(ROOMS[1][0]), /"\/chats\/support"/);
  assert.match(read(ROOMS[3][0]), /`\/chats\/\$\{SUPPORT_ID\}`/);
  assert.match(read(ROOMS[4][0]), /`\/chats\/\$\{SUPPORT_ID\}`/);
});

test("DEV-475 AC-12-19: no other ChatThread/NewsRoom room exists without being in the list above", () => {
  const out = execFileSync("git", ["grep", "-l", "-E", "<(ChatThread|NewsRoom)$", "--", "apps"], { encoding: "utf8" });
  assert.deepEqual(out.trim().split("\n").sort(), ROOMS.map(([f]) => f).sort());
});

test("DEV-475 AC-12-23: news video poster no longer says it can be watched on the web", () => {
  const src = read("packages/ui/src/NewsRoom.tsx");
  assert.ok(!src.includes("웹에서 볼 수 있어요"));
  assert.match(src, /accessibilityLabel=\{openable \? "소식 영상 보기" : "영상을 열 수 없어요"\}/);
  assert.match(src, /disabled=\{!openable\}/);
});

// ---- 실제로 그려 보기: .ts/.tsx를 typescript로 CJS 변환해 require하고, react-native는 react-native-web으로 바꾼다.
// 이 파일 프로세스 안에서만 바뀐다(node --test는 파일마다 따로 띄운다). SVG·안전 영역은 화면 글자와 무관해 빈 모듈로 둔다.
const require = createRequire(import.meta.url);
const ts = require("typescript");
const ui = new URL("../packages/ui/src/", import.meta.url).pathname;
function renderable() {
  const original = Module._resolveFilename;
  const stubs = {
    "react-native-svg": { __esModule: true, default: () => null, Path: () => null, Circle: () => null, Rect: () => null },
    "react-native-safe-area-context": { initialWindowMetrics: null },
  };
  for (const [name, exports] of Object.entries(stubs)) Module._cache[name] = { id: name, loaded: true, exports };
  Module._resolveFilename = function (spec, parent, ...rest) {
    if (spec === "react-native") return original.call(this, "react-native-web", parent, ...rest);
    if (spec in stubs) return spec;
    return original.call(this, spec, parent, ...rest);
  };
  for (const ext of [".ts", ".tsx"])
    Module._extensions[ext] = (m, file) => {
      const out = ts.transpileModule(readFileSync(file, "utf8"), {
        fileName: file,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      });
      m._compile(out.outputText, file);
    };
  const rnw = require("react-native-web");
  const { createElement } = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const notice = require(`${ui}ChatNotice.tsx`);
  const render = (Component, props, height = 844) => {
    const size = { width: 390, height, scale: 1, fontScale: 1 };
    rnw.Dimensions.set({ window: size, screen: size });
    const html = renderToStaticMarkup(createElement(Component, props));
    return { html, text: html.replace(/<[^>]+>/g, "|").replace(/&#x27;/g, "'").replace(/\|+/g, "|") };
  };
  return { notice, render };
}
let rendered;
const r = () => (rendered ??= renderable());

test("DEV-475 AC-12-19: the band renders as a button with the full sentence and label in a chat room", () => {
  const { notice, render } = r();
  const { html, text } = render(notice.ChatNotice, { side: "consumer", onSupport: () => {} });
  assert.match(html, /data-testid="chat-notice"/);
  assert.match(html, /role="button"/);
  assert.ok(html.includes(`aria-label="${CHAT_NOTICE_BAND} ${CHAT_NOTICE_TITLE} 보기"`));
  assert.ok(text.includes(CHAT_NOTICE_BAND), text);
  assert.match(html, /min-height:48px/, "넓은 창에서 한 줄이 되어도 누르는 영역 48");
});

test("DEV-475 AC-12-19: support rooms render the one-line band but screen readers still get the full sentence", () => {
  const { notice, render } = r();
  for (const side of ["consumer", "producer"]) {
    const { html, text } = render(notice.ChatNotice, { side, onSupport: null });
    assert.ok(text.includes(CHAT_NOTICE_COMPACT), text);
    assert.ok(!text.includes(CHAT_NOTICE_BAND), "보이는 글자는 한 줄 문구");
    assert.ok(html.includes(`aria-label="${CHAT_NOTICE_BAND} ${CHAT_NOTICE_TITLE} 보기"`));
    assert.match(html, /min-height:48px/, "웹은 hitSlop이 없어 접힌 띠도 48");
  }
});

test("DEV-475 AC-12-20: the sheet body renders the lines and buttons for each room", () => {
  const { notice, render } = r();
  const consumer = render(notice.ChatNoticeSheetBody, { side: "consumer", onSupport: () => {}, onClose() {} }).text;
  for (const line of [CHAT_NOTICE_TITLE, ...chatNoticeLines("consumer", false), CHAT_NOTICE_SUPPORT_LABEL, "확인"])
    assert.ok(consumer.includes(`|${line}|`), `${line} 없음: ${consumer}`);
  const support = render(notice.ChatNoticeSheetBody, { side: "producer", onSupport: null, onClose() {} }).text;
  for (const line of chatNoticeLines("producer", true)) assert.ok(support.includes(`|${line}|`), line);
  assert.ok(!support.includes(CHAT_NOTICE_SUPPORT_LABEL));
  assert.ok(!support.includes("운영팀에 알려 주세요"));
});

// ---- 구조(AST): 띠가 컴포넌트가 돌려주는 맨 바깥 요소의 직접 자식이고(조건·삼항·&& 없이), 컴포넌트에 이른 반환이 없다
function componentReturns(file, name) {
  const src = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = src.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === name);
  assert.ok(fn, `${file}: ${name} 함수가 없어요`);
  const returns = [];
  const walk = (node) => {
    if (ts.isFunctionLike(node) && node !== fn) return; // 안쪽 함수의 return은 세지 않는다
    if (ts.isReturnStatement(node)) returns.push(node);
    ts.forEachChild(node, walk);
  };
  walk(fn.body);
  return returns;
}
const unwrap = (e) => (e && ts.isParenthesizedExpression(e) ? unwrap(e.expression) : e);
const tagOf = (n) => (ts.isJsxSelfClosingElement(n) ? n.tagName.getText() : ts.isJsxElement(n) ? n.openingElement.tagName.getText() : null);

test("DEV-475 AC-12-19: ChatThread and NewsRoom always render ChatNotice as a direct child of their root (AST)", () => {
  for (const [file, name] of [["packages/ui/src/ChatThread.tsx", "ChatThread"], ["packages/ui/src/NewsRoom.tsx", "NewsRoom"]]) {
    const returns = componentReturns(file, name);
    assert.equal(returns.length, 1, `${file}: ${name}에 이른 반환이 있으면 띠가 빠질 수 있어요`);
    const root = unwrap(returns[0].expression);
    assert.ok(root && ts.isJsxElement(root), `${file}: 맨 바깥이 JSX 요소여야 해요`);
    const direct = root.children.filter((c) => tagOf(c) === "ChatNotice");
    assert.equal(direct.length, 1, `${file}: ChatNotice가 맨 바깥 요소의 직접 자식(조건 없이)이어야 해요`);
    const first = root.children.find((c) => tagOf(c) || ts.isJsxExpression(c));
    assert.equal(tagOf(first), "ChatNotice", `${file}: 띠가 맨 위(오류 줄·타임라인보다 앞)여야 해요`);
    const attrs = direct[0].attributes.properties.map((p) => p.name?.getText());
    assert.deepEqual(attrs.sort(), ["onSupport", "side"]);
  }
});

test("DEV-475 AC-12-19: ChatNotice itself has no early return and always draws the band (AST)", () => {
  const returns = componentReturns("packages/ui/src/ChatNotice.tsx", "ChatNotice");
  assert.equal(returns.length, 1);
  const root = unwrap(returns[0].expression);
  assert.ok(ts.isJsxFragment(root));
  const band = root.children.find((c) => tagOf(c));
  assert.equal(tagOf(band), "Pressable", "띠(Pressable)가 조건 없이 첫 요소여야 해요");
});
