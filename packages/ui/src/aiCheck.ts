/**
 * AI 답변 확인 요청 깃발(DEV-296, FEAT-13 AC-13-11·12·13). 화면 문구와 계산만 둔다(순수 함수).
 * REQUESTED = 소비자가 확인을 요청함 · CONFIRMED = 농가가 '답이 맞아요' · CORRECTED = 농가가 인용 답장으로 바로잡음
 */
export type AiCheckState = "REQUESTED" | "CONFIRMED" | "CORRECTED";

type Checkable = { checkState?: AiCheckState | null; reported?: boolean };

/** 메시지의 깃발 상태. 옛 서버(checkState 필드 자체가 없음)는 reported면 요청 중으로 본다.
 * 새 서버의 null은 '깃발 없음'(요청이 없거나, 어떻게 닫혔는지 모르는 옛 요청)이다 */
export function aiCheckState(m: Checkable): AiCheckState | null {
  if (m.checkState !== undefined) return m.checkState;
  return m.reported ? "REQUESTED" : null;
}

export type AiCheckLabel = { text: string; tone: "flag" | "done"; note?: string };

/** 말풍선 옆·아래 깃발 글자. 소비자는 Figma 10:116·10:289, 생산자는 10:238 */
export function aiCheckLabel(state: AiCheckState | null, producer: boolean): AiCheckLabel | null {
  if (!state) return null;
  if (producer)
    return state === "REQUESTED"
      ? { text: "확인 요청", tone: "flag" }
      : state === "CONFIRMED"
        ? { text: "답이 맞다고 확인함", tone: "done" }
        : { text: "바로잡음", tone: "done" };
  return state === "REQUESTED"
    ? { text: "농가에 확인 요청함", tone: "flag", note: "농가가 확인하면 알려 드려요" }
    : state === "CONFIRMED"
      ? { text: "농가가 답이 맞다고 확인했어요", tone: "done" }
      : { text: "농가가 바로잡았어요", tone: "done" };
}

/** 확인 카드에 인용할 소비자의 덧붙인 말: 깃발 답변 뒤 첫 소비자 메시지. 없으면 null */
export function aiCheckFollowUp(
  messages: { senderType: string; body: string }[],
  index: number,
): string | null {
  for (let i = index + 1; i < messages.length; i++) {
    const m = messages[i];
    if (m.senderType === "CONSUMER" && m.body.trim()) return m.body;
    // 농가가 이미 답한 뒤의 말은 이 답변에 대한 말이 아니다
    if (m.senderType === "PRODUCER") return null;
  }
  return null;
}

type Quoting = { messageId: string; senderType?: string; replyTo?: { messageId: string } | null } & Checkable;

/** 인용 블록 머리글: 바로잡은 AI 답변을 인용한 첫 농가 답장이면 'AI 안내를 바로잡아요'(Figma 10:289).
 * index는 이 답장의 위치. 같은 AI 답변을 다시 인용한 뒤 답장은 일반 머리글 */
export function correctionQuoteLabel(
  replyTo: { messageId: string; senderType: string } | null | undefined,
  messages: Quoting[],
  index: number,
): string | null {
  if (!replyTo || replyTo.senderType !== "AI") return null;
  // 바로잡기는 농가 답장만이다(소비자가 같은 AI 답변을 인용한 말에는 붙이지 않는다)
  if (messages[index]?.senderType !== "PRODUCER") return null;
  const quoted = messages.find((m) => m.messageId === replyTo.messageId);
  if (!quoted || aiCheckState(quoted) !== "CORRECTED") return null;
  const earlier = messages.slice(0, index).some(
    (m) => m.senderType === "PRODUCER" && m.replyTo?.messageId === replyTo.messageId,
  );
  return earlier ? null : "AI 안내를 바로잡아요";
}

/** 생산자 1:1 목록 맨 위 띠(Figma 10:158). 0이면 띠를 그리지 않는다 */
export function aiCheckBanner(count: number): string | null {
  return count > 0 ? `확인해 달라는 AI 답변 ${count}개` : null;
}
