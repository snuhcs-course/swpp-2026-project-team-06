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
