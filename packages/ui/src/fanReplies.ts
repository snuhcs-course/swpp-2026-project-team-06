/**
 * 생산자 소식방 반응 줄과 팬 답장 시트의 순수 계산(DEV-297, Figma 7:90·7:93).
 * 화면 컴포넌트(NewsRoom·FanReplySheet)가 쓰고, scripts/test-fan-replies.mjs가 검사한다.
 */

export type FanReplyFilter = "all" | "unread";

/** 내 소식 아래 오른쪽 한 줄 ‘읽음 N · ♥ N · 답장 N ›’. 답장은 1개 이상일 때만, 읽음 수가 없으면(옛 응답) 뺀다 */
export function broadcastStats(m: {
  readCount?: number | null;
  reactionCount: number;
  replyCount?: number | null;
}) {
  const replies = m.replyCount ?? 0;
  const read = m.readCount ?? null;
  const counts = [read == null ? null : `읽음 ${read}`, `좋아요 ${m.reactionCount}`]
    .filter(Boolean)
    .join(", ");
  return {
    read: read == null ? null : `읽음 ${read}`,
    likes: m.reactionCount,
    replies: replies > 0 ? `답장 ${replies}` : null,
    /** 읽음·좋아요만(답장은 따로 누르는 버튼일 때) */
    countsLabel: counts,
    label: replies > 0 ? `${counts}, 답장 ${replies}` : counts,
  };
}

/** 시트 머리의 소식 인용: ‘“첫 바구니 따봤어요…” · 10월 7일’. 글 없는 사진·영상 소식은 ‘사진·영상 소식’ */
export function broadcastQuote(
  b: { body: string; mediaCount: number; createdAt: string },
  max = 16,
) {
  const text = b.body.replace(/\s+/g, " ").trim();
  const head = text
    ? `“${text.length > max ? `${text.slice(0, max)}…` : text}”`
    : b.mediaCount > 0
      ? "사진·영상 소식"
      : "소식";
  const day = new Date(b.createdAt).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  });
  return `${head} · ${day}`;
}

/** 칩 필터. 시트를 연 순간 서버는 이미 읽음이라 ‘안 읽음’은 처음 받은 목록의 unread로 거른다 */
export function visibleReplies<T extends { unread: boolean }>(items: T[], filter: FanReplyFilter) {
  return filter === "unread" ? items.filter((r) => r.unread) : items;
}

/** 시트를 열고 읽음 처리할 마지막 답장 = 화면에 불러온 마지막 답장(오래된 순).
 * 여러 쪽을 불러오는 사이 온 답장도 화면에 보였으면 함께 읽음, 상한에 걸려 못 불러온 답장은 안 읽음으로 남는다 */
export function readThrough(items: { messageId: string }[]) {
  return items.at(-1)?.messageId ?? null;
}
