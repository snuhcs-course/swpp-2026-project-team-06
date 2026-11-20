// 입금 대기 줄 ‘채팅하기’(DEV-342)가 1:1 대화 화면에 넘기는 미리 넣을 글. import 없는 순수 모듈.
// 주소(URL)에 싣지 않는다: 새로고침·주소 복사로 같은 글이 다시 채워지거나 남지 않게.
// 대화 화면이 이미 떠 있어 다시 마운트되지 않으면 지울 기회가 없으므로 짧게만 유효하다(TTL).
const TTL_MS = 10_000;
const drafts = new Map<string, { text: string; at: number }>();

export function setChatDraft(consumerId: string, text: string, now = Date.now()) {
  drafts.set(consumerId, { text, at: now });
}

/** 렌더 중에 읽는다(지우지 않음). StrictMode의 두 번 렌더에서도 같은 값을 받는다. 오래된 값은 없음 */
export function peekChatDraft(consumerId: string, now = Date.now()): string | undefined {
  const entry = drafts.get(consumerId);
  if (!entry) return undefined;
  if (now - entry.at > TTL_MS) {
    drafts.delete(consumerId);
    return undefined;
  }
  return entry.text;
}

/** 화면이 열린 뒤(effect)·다시 볼 때(focus) 지운다. 목록에서 다시 열면 빈 입력칸 */
export function clearChatDraft(consumerId: string) {
  drafts.delete(consumerId);
}

/** 대화 화면이 들고 있는 미리 넣은 글. 어느 손님 것인지(consumerId)를 함께 둔다(DEV-362) */
export type ChatPrefill = { text: string; id: number; consumerId: string };

/** 지금 보는 손님의 글만 돌려준다. 같은 화면이 다른 손님으로 재사용돼도 앞 손님 글은 쓰지 않는다 */
export function prefillFor(prefill: ChatPrefill | undefined, consumerId: string): ChatPrefill | undefined {
  return prefill?.consumerId === consumerId ? prefill : undefined;
}

/** focus 때 다음 상태: 새 글이 있으면 그 손님 것으로 넣고, 없으면 다른 손님 글은 비운다 */
export function nextPrefill(
  cur: ChatPrefill | undefined,
  consumerId: string,
  text: string | undefined,
  now = Date.now(),
): ChatPrefill | undefined {
  if (text) return cur?.text === text && cur.id === 0 && cur.consumerId === consumerId ? cur : { text, id: now, consumerId };
  return prefillFor(cur, consumerId);
}
