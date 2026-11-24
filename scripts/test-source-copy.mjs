// DEV-452 AC-SRC-2/5/9/11: bounded UI behavior with no API/provider calls.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const filename = new URL("../apps/producer/src/lib/SourceCopyReview.tsx", import.meta.url);
const code = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const passage = (reasons = []) => ({ id: "passage", bindingHash: "binding", module: "delivery", value: "원문", originalValue: "원문", candidateIds: [], evidence: [], queueKinds: ["OWNER_CONFIRMATION"], reasonCodes: { OWNER_CONFIRMATION: reasons, COPY_EDIT: [], PLACEMENT: [], SAFETY: [] }, repairValue: null, status: "PENDING", includedInDraft: true, reviewPending: true, reviewExplanations: [], decision: null });
function harness(p = passage(), saveSucceeds = true, flush = true) {
  const data = { enabled: true, reviewVersion: 3, plan: { planHash: "hash", passages: [p] } };
  let latestData = data;
  const slots = []; let cursor = 0;
  const events = [];
  const exports = {};
  const element = (type, props) => ({ type, props });
  const api = {
    sourceCopy: async () => { events.push("get"); return latestData; },
    saveSourceCopy: async () => { events.push("save"); if (!saveSucceeds) throw new Error("저장 실패"); return data; },
  };
  const fakeRequire = (id) => {
    if (id === "react/jsx-runtime") return { jsx: element, jsxs: element, Fragment: "Fragment" };
    if (id === "react") return {
      useState: (initial) => {
        const key = cursor++;
        if (!(key in slots)) slots[key] = key === 0 ? data : typeof initial === "function" ? initial() : initial;
        return [slots[key], (value) => { slots[key] = typeof value === "function" ? value(slots[key]) : value; }];
      },
      useRef: (initial) => { const key = cursor++; return slots[key] ??= { current: initial }; },
      useEffect: () => {},
    };
    if (id === "@farmclub/api") return { sourceAnalysis: api };
    if (id === "@farmclub/ui") return { Button: "Button", Input: "Input", T: "T", SOURCE_MODULES: [["delivery", "배송 안내"]], tokens: { space: { gutter: 16 }, color: { border: "gray", error: "red" }, radius: { sm: 4 } } };
    if (id === "react-native") return { View: "View" };
    throw new Error(id);
  };
  vm.runInNewContext(code, { exports, require: fakeRequire });
  const props = { batchId: "batch", targetId: "target", enabled: true, reviewVersion: 3, locked: false,
    beforeMutation: async () => { events.push("flush"); return flush; },
    onReload: async () => { events.push("reload"); }, onBusy: () => {},
  };
  const render = () => { cursor = 0; return exports.SourceCopyReview(props); };
  const nodes = (node) => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  const all = () => nodes(render());
  const press = (label) => { const button = all().find((n) => n.type === "Button" && n.props.label === label); assert.ok(button, label); button.props.onPress(); };
  return { all, press, events, slots, setLatest: (next, poll = false) => { latestData = next; if (poll) slots[0] = next; }, data, settle: async () => { for (let n = 0; n < 10; n++) await new Promise(setImmediate); } };
}
test("DEV-452 AC-SRC-5: price and relative time allow explicit acknowledgment without changing settings", () => {
  const price = harness(passage(["PRICE_OR_FEE"]));
  price.press("원문 그대로 사용");
  assert.ok(price.all().some((n) => n.props?.label === "현재도 맞는지 확인한 내용"));
  assert.match(JSON.stringify(price.all()), /실제 판매 설정은 바뀌지 않아요/);
  assert.ok(price.all().some((n) => n.props?.label === "판매 설정에서 입력하기로 기록"));
  const date = harness(passage(["RELATIVE_TIME"]));
  date.press("원문 그대로 사용");
  assert.ok(date.all().some((n) => n.props?.label === "현재도 맞는지 확인한 내용"));
});
test("DEV-452 AC-SRC-2/5: flagged original stays visible in draft with reason and unique publication count", () => {
  const p = passage(["SEASON_OR_AVAILABILITY", "RELATIVE_TIME"]);
  p.queueKinds.push("SAFETY"); p.reasonCodes.SAFETY = ["HEALTH_CLAIM"];
  p.status = "BLOCKED";
  p.originalValue = "올해 제철 원문 전체";
  const h = harness(p);
  assert.ok(h.all().some((n) => n.type === "T" && n.props.children === p.originalValue));
  const content = JSON.stringify(h.all());
  assert.match(content, /비공개 초안에 포함/);
  assert.match(content, /수확 시기·제철·재고는 달라질 수 있어요/);
  assert.match(content, /‘올해·이번 주’ 같은 표현/);
  assert.match(content, /건강 효능으로 읽힐 수 있어요/);
  assert.match(content, /확인 대기 항목을 모두 처리해야 상품에 반영할 수 있어요/);
  const count = h.all().find((n) => n.type === "T" && Array.isArray(n.props.children) && n.props.children[0] === "공개 전 확인 대기 · ");
  assert.equal(count.props.children[1], 1);
});
test("DEV-452 AC-SRC-5: completed queue history does not count as pending and does not hide explanations", () => {
  const p = passage(["DISPATCH_OR_DELIVERY"]);
  p.reviewPending = false; p.status = "READY";
  p.reviewExplanations = ["출처의 배송 조건을 확인해 주세요."];
  const h = harness(p);
  const count = h.all().find((n) => n.type === "T" && Array.isArray(n.props.children) && n.props.children[0] === "공개 전 확인 대기 · ");
  assert.equal(count.props.children[1], 0);
  assert.ok(h.all().some((n) => n.props.children === p.reviewExplanations[0]));
  assert.match(JSON.stringify(h.all()), /출고일과 배송 조건이 바뀌었을 수 있어요/);
});
test("DEV-452 AC-SRC-2/5: overflow remains fully readable with placement warning", () => {
  const p = passage(); p.module = null; p.includedInDraft = false;
  p.queueKinds = ["PLACEMENT"]; p.reasonCodes.PLACEMENT = ["FIELD_LIMIT"];
  p.originalValue = "전체 원문 ".repeat(400);
  const h = harness(p);
  assert.ok(h.all().some((n) => n.type === "T" && n.props.children === p.originalValue));
  assert.match(JSON.stringify(h.all()), /한 항목에 담을 수 있는 길이를 넘었어요/);
  assert.match(JSON.stringify(h.all()), /배치 필요/);
});
test("DEV-452 AC-SRC-9/11: failed manual editor flush aborts review mutation", async () => {
  const h = harness(passage(), true, false);
  h.press("원문 그대로 사용"); h.press("검토 선택 저장"); await h.settle();
  assert.deepEqual(h.events, ["flush"]);
  assert.ok(h.all().some((n) => n.props?.label === "선택됨 · 원문 그대로 사용"));
});
test("DEV-452 AC-SRC-9/11: failed review save preserves choices and never reloads", async () => {
  const h = harness(passage(), false);
  h.press("직접 수정");
  h.all().find((n) => n.type === "Input" && n.props.label === "사용할 문구").props.onChangeText("직접 쓴 현재 문구");
  h.all().find((n) => n.type === "Input" && n.props.label === "수정한 이유와 확인한 내용").props.onChangeText("생산자가 현재 조건 확인");
  h.press("검토 선택 저장"); await h.settle();
  assert.deepEqual(h.events, ["flush", "get", "save"]);
  assert.equal(h.all().find((n) => n.type === "Input").props.value, "직접 쓴 현재 문구");
});
test("DEV-452 AC-SRC-9: successful save flushes before mutation and reloads afterward", async () => {
  const h = harness(); h.press("원문 그대로 사용"); h.press("검토 선택 저장"); await h.settle();
  assert.deepEqual(h.events, ["flush", "get", "save", "reload"]);
  assert.equal(h.all().find((n) => n.props?.label === "검토 선택 저장").props.disabled, true);
});
test("DEV-452 AC-SRC-5: owner confirmation requires an entered note", async () => {
  const h = harness(passage(["DISPATCH_OR_DELIVERY"]));
  h.press("원문 그대로 사용"); h.press("검토 선택 저장"); await h.settle();
  assert.deepEqual(h.events, []);
  h.all().find((n) => n.type === "Input" && n.props.label === "현재도 맞는지 확인한 내용").props.onChangeText("2026-11-25에 배송 조건 확인");
  h.press("검토 선택 저장"); await h.settle();
  assert.deepEqual(h.events, ["flush", "get", "save", "reload"]);
});
test("DEV-452 AC-SRC-5: safety queue offers safe editing without a KEEP bypass", () => {
  const p = passage(); p.queueKinds = ["SAFETY"]; p.reasonCodes.SAFETY = ["HEALTH_CLAIM"]; p.status = "BLOCKED";
  const h = harness(p);
  assert.equal(h.all().some((n) => n.props?.label === "원문 그대로 사용"), false);
  assert.ok(h.all().some((n) => n.props?.label === "직접 수정"));
  assert.ok(h.all().some((n) => n.props?.label === "본문에서 제외"));
});
test("DEV-452 AC-SRC-9/11: another session's decision change conflicts against first-choice baseline despite polling", async () => {
  const h = harness();
  h.press("직접 수정");
  h.all().find((n) => n.type === "Input" && n.props.label === "사용할 문구").props.onChangeText("내가 작성 중인 문구");
  h.all().find((n) => n.type === "Input" && n.props.label === "수정한 이유와 확인한 내용").props.onChangeText("내 확인 내용");
  const changed = structuredClone(h.data);
  changed.reviewVersion = 4;
  changed.plan.passages[0].decision = { bindingHash: "binding", action: "EDIT", value: "다른 화면의 문구", note: "다른 화면의 확인 내용", module: "delivery" };
  changed.plan.passages[0].value = "다른 화면의 문구";
  h.setLatest(changed, true);
  // Choosing another action must not refresh the original baseline.
  h.press("본문에서 제외");
  h.press("직접 수정");
  h.press("검토 선택 저장"); await h.settle();
  assert.deepEqual(h.events, ["flush", "get"]);
  assert.equal(h.all().find((n) => n.type === "Input" && n.props.label === "사용할 문구").props.value, "내가 작성 중인 문구");
  assert.ok(h.all().some((n) => n.type === "T" && n.props.children === "다른 화면의 문구"));
  h.press("저장 전 선택 취소");
  h.press("원문 그대로 사용");
  h.press("검토 선택 저장"); await h.settle();
  assert.deepEqual(h.events, ["flush", "get", "flush", "get", "save", "reload"]);
});
test("DEV-452 AC-SRC-5: ordinary marketing acknowledgment requires an entered note", async () => {
  const p = passage(); p.reasonCodes.SAFETY = ["EXAGGERATION"]; p.queueKinds = ["SAFETY"]; p.status = "BLOCKED";
  const h = harness(p); h.press("원문 그대로 사용"); h.press("검토 선택 저장"); await h.settle();
  assert.deepEqual(h.events, []);
  h.all().find((n) => n.type === "Input" && n.props.label === "현재도 맞는지 확인한 내용").props.onChangeText("실제 재배 기록과 표현을 확인함");
  h.press("검토 선택 저장"); await h.settle();
  assert.deepEqual(h.events, ["flush", "get", "save", "reload"]);
});
test("DEV-452 AC-SRC-5: generic platform, policy and money warning allow explicit acknowledgment", async () => {
  for (const reason of ["PLATFORM_TEXT", "POLICY_TEXT", "MONEY_AMOUNT"]) {
    const p = passage(); p.reasonCodes.SAFETY = [reason]; p.queueKinds = ["SAFETY"];
    const h = harness(p); h.press("원문 그대로 사용"); h.press("검토 선택 저장"); await h.settle();
    assert.deepEqual(h.events, []);
    h.all().find((n) => n.type === "Input" && n.props.label === "현재도 맞는지 확인한 내용").props.onChangeText("현재 조건과 일치하는지 확인함");
    h.press("검토 선택 저장"); await h.settle();
    assert.deepEqual(h.events, ["flush", "get", "save", "reload"]);
  }
});

test("DEV-452 AC-SRC-2/5: adjacent-source joins are counted once and context review stays visible", () => {
  const p = passage([]); p.autoRepair = { type: "SOURCE_ADJACENT_CONTINUATION", passageIds: ["one", "two"], module: "delivery", contextReviewRequired: true };
  p.queueKinds = ["COPY_EDIT"]; p.reasonCodes.COPY_EDIT = ["CONTINUATION_CONTEXT"];
  const h = harness(p);h.data.plan.passages.push({...p,id:"second",bindingHash:"binding-two"});
  const notice = h.all().find((n) => n.type === "T" && Array.isArray(n.props.children) && n.props.children[0] === "인접한 원문 ");
  assert.equal(notice.props.children[1], 1);
  assert.match(JSON.stringify(h.all()), /서로 다른 항목에서 가져온 문구/);
});

test("DEV-452 AC-SRC-11: confirming a grouped option uses its current assembled section", () => {
  const p = passage(["PRICE_OR_FEE"]);p.optionAssembly = {type:"SOURCE_OPTION_BLOCK", module:"composition", passageIds:["passage"]};
  const h = harness(p);h.press("원문 그대로 사용");
  const choices = h.slots.find((s) => s?.binding?.action === "KEEP");
  assert.equal(choices.binding.module, "composition");
});
