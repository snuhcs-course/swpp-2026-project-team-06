// DEV-214 (FEAT-06 E4, AC-06-2·AC-06-7): 소비자 농가 목록(SCR-02) 검색 실패·다시 시도 상태
// apps/consumer/src/lib/farmSearch.ts. 새 검색 실패의 재시도는 처음부터 받아 목록을 바꾸고, ‘더 보기’ 실패만 이어 붙인다.
// 늦게 온 지난 검색 응답은 버리고, 페이지를 합칠 때 같은 농가(farmId)는 한 번만 남긴다.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MORE_FAILED,
  canLoadMore,
  failureCopy,
  farmListReducer as reduce,
  initialFarmListState,
  listHeader,
  mergeFarms,
} from "../apps/consumer/src/lib/farmSearch.ts";

const farm = (farmId) => ({
  farmId,
  name: farmId,
  region: "제주",
  photo: null,
  featured: null,
});
const SEED = ["f-kang", "f-halla", "f-oh", "f-moon"].map(farm);

/** 동작을 차례로 적용 */
const run = (state, ...actions) => actions.reduce(reduce, state);
const start = (seq, query, mode = "reset") => ({
  type: "start",
  seq,
  query,
  mode,
});
const ok = (seq, items, nextCursor = null) => ({
  type: "success",
  seq,
  page: { items, nextCursor },
});
const fail = (seq, offline = false) => ({
  type: "fail",
  seq,
  offline,
  error: new Error("503"),
});

/** 전체 4곳이 보이는 상태 */
const listed = run(initialFarmListState, start(1, ""), ok(1, SEED));

test("AC-06-2 AC-06-7 첫 검색 실패 → 다시 시도 → 항목 수 동일(중복 없음)", () => {
  assert.equal(listHeader(listed), "마감 임박순 · 농가 4곳");

  // ‘한라네’ 검색이 받는 동안은 옛 목록을 새 결과처럼 보이지 않는다(무브 4)
  const searching = run(listed, start(2, "한라네"));
  assert.equal(listHeader(searching), "‘한라네’ 찾는 중");

  // 실패: 남은 목록은 그대로, 머리줄은 ‘이전 목록’, 실패 종류는 reset
  const failed = run(searching, fail(2));
  assert.equal(failed.items.length, 4);
  assert.deepEqual(
    {
      mode: failed.failed.mode,
      query: failed.failed.query,
      offline: failed.failed.offline,
    },
    { mode: "reset", query: "한라네", offline: false },
  );
  assert.equal(listHeader(failed), "이전 목록 · 농가 4곳");

  // 다시 시도 중엔 실패 안내가 남고(버튼 잠금) 머리줄은 ‘찾는 중’
  const retrying = run(failed, start(3, "한라네"));
  assert.equal(retrying.failed?.mode, "reset");
  assert.equal(listHeader(retrying), "‘한라네’ 찾는 중");

  // 성공: 목록을 바꾼다(덧붙이지 않는다) → 1곳, 오류 지움
  const retried = run(retrying, ok(3, [farm("f-halla")]));
  assert.deepEqual(
    retried.items.map((f) => f.farmId),
    ["f-halla"],
  );
  assert.equal(retried.failed, null);
  assert.equal(retried.shownQuery, "한라네");
  assert.equal(listHeader(retried), "마감 임박순 · 농가 1곳");

  // 한 번 더 다시 받아도 1곳
  const again = run(retried, start(4, "한라네"), ok(4, [farm("f-halla")]));
  assert.equal(again.items.length, 1);
});

test("AC-06-2 AC-06-7 늦게 온 이전 검색 응답은 무시", () => {
  // ‘한라’ 요청 뒤 ‘한라네’ 요청 → ‘한라네’ 응답 먼저, ‘한라’ 응답 나중
  const s = run(
    listed,
    start(2, "한라"),
    start(3, "한라네"),
    ok(3, [farm("f-halla")]),
    ok(2, [farm("f-halla"), farm("f-hallasan")]),
  );
  assert.deepEqual(
    s.items.map((f) => f.farmId),
    ["f-halla"],
  );
  assert.equal(s.shownQuery, "한라네");
  assert.equal(s.pending, null);

  // 늦게 온 실패도 무시한다
  const lateFail = run(
    listed,
    start(2, "한라"),
    start(3, "한라네"),
    ok(3, [farm("f-halla")]),
    fail(2),
  );
  assert.equal(lateFail.failed, null);
  assert.equal(lateFail.items.length, 1);
});

test("AC-06-2 AC-06-7 다음 페이지 실패 → 이어 받기, farmId 중복 거름", () => {
  const page1 = run(initialFarmListState, start(1, ""), ok(1, SEED, "c2"));
  assert.equal(page1.cursor, "c2");

  // ‘더 보기’ 실패: 보인 항목·cursor 유지, 실패 종류 more(머리줄은 그대로)
  const moreFailed = run(page1, start(2, "", "more"), fail(2));
  assert.equal(moreFailed.items.length, 4);
  assert.equal(moreFailed.cursor, "c2");
  assert.equal(moreFailed.failed.mode, "more");
  assert.equal(listHeader(moreFailed), "마감 임박순 · 농가 4곳");

  // 이어 받기 성공: 겹치는 농가(f-moon)는 한 번만, 순서 유지
  const merged = run(
    moreFailed,
    start(3, "", "more"),
    ok(3, [farm("f-moon"), farm("f-jeju")], null),
  );
  assert.deepEqual(
    merged.items.map((f) => f.farmId),
    ["f-kang", "f-halla", "f-oh", "f-moon", "f-jeju"],
  );
  assert.equal(merged.cursor, null);
  assert.equal(merged.failed, null);
  assert.equal(
    new Set(merged.items.map((f) => f.farmId)).size,
    merged.items.length,
  );

  // 새 검색을 시작하면 지난 ‘더 보기’ 실패는 지운다
  assert.equal(run(moreFailed, start(4, "한라")).failed, null);
  // 한 페이지 안의 중복도 거른다
  assert.equal(mergeFarms([], [farm("a"), farm("a"), farm("b")]).length, 2);
});

test("AC-06-7 새 검색이 실패해 남은 목록이 이전 것이면 ‘더 보기’를 막는다", () => {
  const page1 = run(initialFarmListState, start(1, ""), ok(1, SEED, "c2"));
  assert.equal(canLoadMore(page1), true);
  // 받는 중에는 막는다
  assert.equal(canLoadMore(run(page1, start(2, "한라네"))), false);
  // ‘한라네’ 실패: 남은 4곳의 cursor(c2)는 전체 목록의 것이라 ‘한라네’와 섞지 않는다
  const failed = run(page1, start(2, "한라네"), fail(2));
  assert.equal(failed.cursor, "c2");
  assert.equal(failed.shownQuery, "");
  assert.equal(canLoadMore(failed), false);
  // ‘더 보기’ 실패 뒤에는 이어 받기를 허용
  assert.equal(canLoadMore(run(page1, start(3, "", "more"), fail(3))), true);
  // 마지막 페이지면 막는다
  assert.equal(
    canLoadMore(run(initialFarmListState, start(1, ""), ok(1, SEED))),
    false,
  );
});

test("AC-06-7 첫 불러오기 실패는 목록 없이 실패만(LoadError 자리)", () => {
  const s = run(initialFarmListState, start(1, ""), fail(1, true));
  assert.equal(s.items, null);
  assert.equal(s.failed.offline, true);
  assert.equal(listHeader(s), null);
});

test("AC-06-7 오류 문구: 검색어 있음/없음 × 연결 끊김/서버 오류", () => {
  assert.deepEqual(failureCopy({ query: "한라네", offline: false }, true), {
    title: "‘한라네’ 검색 결과를 불러오지 못했어요",
    body: "잠시 뒤 다시 시도해 주세요. 아래는 이전 목록이에요.",
  });
  assert.deepEqual(failureCopy({ query: "한라네", offline: true }, true), {
    title: "‘한라네’ 검색 결과를 불러오지 못했어요",
    body: "인터넷 연결을 확인하고 다시 시도해 주세요. 아래는 이전 목록이에요.",
  });
  assert.deepEqual(failureCopy({ query: "", offline: false }, true), {
    title: "농가 목록을 새로 불러오지 못했어요",
    body: "잠시 뒤 다시 시도해 주세요. 아래는 이전 목록이에요.",
  });
  assert.deepEqual(failureCopy({ query: "", offline: true }, true), {
    title: "농가 목록을 새로 불러오지 못했어요",
    body: "인터넷 연결을 확인하고 다시 시도해 주세요. 아래는 이전 목록이에요.",
  });
  // 남은 목록이 없으면(이전 결과 0곳) ‘아래는 이전 목록’을 붙이지 않는다
  assert.equal(
    failureCopy({ query: "한라네", offline: false }, false).body,
    "잠시 뒤 다시 시도해 주세요.",
  );
  assert.equal(MORE_FAILED, "다음 농가를 불러오지 못했어요");
  // 머리줄: 검색어 없이 받는 중
  assert.equal(listHeader(run(listed, start(2, ""))), "농가 찾는 중");
});
