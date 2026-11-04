// SCR-02 농가 목록 상태와 문구 (FEAT-06 E4·AC-06-7, DEV-214).
// 새 검색(reset) 실패와 다음 페이지(more) 실패를 갈라, reset 재시도는 처음부터 받아 목록을 바꾸고
// more 재시도만 이어 붙인다. 요청 번호(seq)가 마지막 요청과 다른 응답은 버리고, 페이지를 합칠 때 farmId로 거른다.
// React Native 없이 scripts/test-farm-search.mjs가 import하므로 타입 외의 import를 두지 않는다.
import type { FarmCard } from "@farmclub/api";

export type FarmLoadMode = "reset" | "more";

export interface FarmListState {
  /** 지금 보이는 목록. null이면 아직 한 번도 받지 못함 */
  items: FarmCard[] | null;
  cursor: string | null;
  /** items가 어떤 검색어의 결과인지(빈 문자열 = 전체) */
  shownQuery: string;
  /** 응답을 기다리는 마지막 요청 */
  pending: { seq: number; query: string; mode: FarmLoadMode } | null;
  /** 마지막으로 실패한 요청. 성공하면 지운다 */
  failed: {
    mode: FarmLoadMode;
    query: string;
    offline: boolean;
    error: unknown;
  } | null;
}

export type FarmListAction =
  | { type: "start"; seq: number; query: string; mode: FarmLoadMode }
  | {
      type: "success";
      seq: number;
      page: { items: FarmCard[]; nextCursor: string | null };
    }
  | { type: "fail"; seq: number; offline: boolean; error?: unknown };

export const initialFarmListState: FarmListState = {
  items: null,
  cursor: null,
  shownQuery: "",
  pending: null,
  failed: null,
};

/** farmId가 같은 카드는 처음 것만 남긴다(순서 유지) */
export function mergeFarms(prev: FarmCard[], next: FarmCard[]): FarmCard[] {
  const seen = new Set<string>();
  const out: FarmCard[] = [];
  for (const f of [...prev, ...next]) {
    if (seen.has(f.farmId)) continue;
    seen.add(f.farmId);
    out.push(f);
  }
  return out;
}

export function farmListReducer(
  state: FarmListState,
  action: FarmListAction,
): FarmListState {
  if (action.type === "start") {
    return {
      ...state,
      pending: { seq: action.seq, query: action.query, mode: action.mode },
      // 같은 요청의 재시도면 실패 안내를 응답까지 남겨 버튼만 잠근다. 다른 검색어·종류면 지난 실패는 의미가 없다.
      failed:
        state.failed?.mode === action.mode &&
        state.failed.query === action.query
          ? state.failed
          : null,
    };
  }
  const pending = state.pending;
  // 늦게 온 지난 요청의 응답은 버린다
  if (!pending || pending.seq !== action.seq) return state;
  if (action.type === "success") {
    const reset = pending.mode === "reset" || !state.items;
    return {
      items: reset
        ? mergeFarms([], action.page.items)
        : mergeFarms(state.items ?? [], action.page.items),
      cursor: action.page.nextCursor,
      shownQuery: reset ? pending.query : state.shownQuery,
      pending: null,
      failed: null,
    };
  }
  return {
    ...state,
    pending: null,
    failed: {
      mode: pending.mode,
      query: pending.query,
      offline: action.offline,
      error: action.error,
    },
  };
}

/** ‘더 보기’를 보낼 수 있는지. 다른 요청 중이거나 새 검색이 실패해 남은 목록이 이전 것이면 막는다
 * (이전 목록의 cursor를 새 검색어와 섞지 않는다). 보낼 때 검색어는 shownQuery를 쓴다 */
export function canLoadMore(state: FarmListState): boolean {
  return !!state.cursor && !state.pending && state.failed?.mode !== "reset";
}

/** 검색칸 아래 머리줄. null이면 숨긴다 */
export function listHeader(state: FarmListState): string | null {
  const { items, pending, failed } = state;
  if (!items) return null;
  if (pending?.mode === "reset") {
    return pending.query ? `‘${pending.query}’ 찾는 중` : "농가 찾는 중";
  }
  if (items.length === 0) return null;
  if (failed?.mode === "reset") return `이전 목록 · 농가 ${items.length}곳`;
  return `마감 임박순 · 농가 ${items.length}곳`;
}

/** 목록이 있는 채 새 검색이 실패했을 때 오류 상자 문구. 본문은 고정 문구 두 가지(연결 끊김/그 밖) */
export function failureCopy(
  failed: { query: string; offline: boolean },
  hasPrevious: boolean,
): { title: string; body: string } {
  const title = failed.query
    ? `‘${failed.query}’ 검색 결과를 불러오지 못했어요`
    : "농가 목록을 새로 불러오지 못했어요";
  const base = failed.offline
    ? "인터넷 연결을 확인하고 다시 시도해 주세요."
    : "잠시 뒤 다시 시도해 주세요.";
  return {
    title,
    body: hasPrevious ? `${base} 아래는 이전 목록이에요.` : base,
  };
}

/** ‘더 보기’ 실패 한 줄 */
export const MORE_FAILED = "다음 농가를 불러오지 못했어요";
