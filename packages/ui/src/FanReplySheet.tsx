import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Sheet } from "./bars";
import { Button } from "./Button";
import { ProfileAvatar } from "./Messenger";
import { T } from "./Text";
import { time } from "./format";
import { tokens } from "./tokens";
import {
  broadcastQuote,
  readThrough,
  visibleReplies,
  type FanReplyFilter,
} from "./fanReplies";

export type FanReplyRow = {
  messageId: string;
  consumerId: string;
  senderName: string;
  body: string;
  createdAt: string;
  editVersion: number;
  unread: boolean;
  reservedCustomer: boolean;
  quoted: boolean;
};
export type FanReplyPageData = {
  broadcast: { broadcastId: string; body: string; mediaCount: number; createdAt: string };
  total: number;
  unreadCount: number;
  lastReplyId: string | null;
  items: FanReplyRow[];
  nextCursor: string | null;
};

// 시트가 한 번에 불러오는 최대 쪽 수(쪽당 50개). 넘으면 불러온 데까지만 읽음 처리한다
const MAX_PAGES = 10;
const PRIVATE_AREA = { dataSet: { phPrivate: "1" } } as object;
/** 예약 고객 태그 배경: 내 말풍선과 같은 옅은 주황(ChatBubble MINE_BG) */
const TAG_BG = "#FFF2E9";

/**
 * 팬 답장 모아보기(DEV-297, Figma 7:93). 소식 하나에 연결된 소비자 답장을 오래된 순으로 보여 준다.
 * 열면 끝까지 불러오고 곧바로 본 데까지 읽음 처리한다. 안 읽음 점·칩은 처음 받은 목록 그대로다.
 */
export function FanReplySheet({
  broadcastId,
  load,
  markRead,
  onClose,
  onQuote,
  onPrivate,
}: {
  /** 열린 소식. null이면 닫힘 */
  broadcastId: string | null;
  load: (broadcastId: string, cursor?: string) => Promise<FanReplyPageData>;
  markRead?: (broadcastId: string, lastReadMessageId: string) => Promise<unknown>;
  onClose: () => void;
  /** ‘모두에게 답장’(DEV-289 익명 인용). 시트를 닫고 입력칸 인용으로 넘긴다 */
  onQuote: (reply: FanReplyRow) => void;
  /** ‘1:1 채팅’ */
  onPrivate?: (consumerId: string, replyId: string) => void;
}) {
  const [loaded, setPage] = useState<FanReplyPageData | null>(null);
  const [loadedItems, setItems] = useState<FanReplyRow[]>([]);
  const [filter, setFilter] = useState<FanReplyFilter>("all");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const run = useRef(0);
  useEffect(() => {
    // 닫힌 동안은 아무것도 하지 않는다. 내려가는 애니메이션 동안 내용을 그대로 두고, 다음에 열 때 비운다
    if (!broadcastId) return;
    const id = ++run.current;
    setPage(null);
    setItems([]);
    setFilter("all");
    setError("");
    void (async () => {
      try {
        const first = await load(broadcastId);
        const rows = [...first.items];
        let cursor = first.nextCursor;
        for (let i = 1; cursor && i < MAX_PAGES; i++) {
          const next = await load(broadcastId, cursor);
          rows.push(...next.items);
          cursor = next.nextCursor;
        }
        if (id !== run.current) return;
        setPage(first);
        setItems(rows);
        const through = readThrough(rows);
        // 읽음 처리 실패는 알리지 않는다. 다음에 열 때 다시 처리한다
        if (through && rows.some((r) => r.unread)) void markRead?.(broadcastId, through)?.catch(() => undefined);
      } catch (e) {
        if (id === run.current)
          setError(e instanceof Error ? e.message : "답장을 불러오지 못했어요");
      }
    })();
    // 닫거나 화면을 떠나면 늦게 온 응답을 버린다(본 적 없는 답장을 읽음 처리하지 않음)
    return () => {
      run.current++;
    };
  }, [broadcastId, attempt, load, markRead]);
  // 다른 소식으로 다시 연 첫 화면에 이전 소식이 비치지 않게 한다. 닫히는 동안(null)은 그대로 둔다
  const stale = !!broadcastId && loaded?.broadcast.broadcastId !== broadcastId;
  const page = stale ? null : loaded;
  const items = stale ? [] : loadedItems;
  const shown = visibleReplies(items, filter);
  // 칩 숫자는 ‘안 읽음’ 필터가 보이는 줄 수와 같게 불러온 목록에서 센다
  const unread = items.filter((r) => r.unread).length;
  return (
    <Sheet
      visible={!!broadcastId}
      onClose={onClose}
      title={page ? `답장 ${page.total}` : "답장"}
    >
      <View {...PRIVATE_AREA} style={{ gap: 12 }}>
        {page ? (
          <T variant="sub" muted numberOfLines={1}>
            {broadcastQuote(page.broadcast)}
          </T>
        ) : null}
        {page ? (
          <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 8, paddingVertical: 8 }}>
            {(
              [
                ["all", `전체 ${page.total}`],
                ["unread", `안 읽음 ${unread}`],
              ] as const
            ).map(([value, label]) => {
              const on = filter === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="tab"
                  aria-selected={on}
                  accessibilityLabel={label}
                  onPress={() => setFilter(value)}
                  hitSlop={{ top: 8, bottom: 8 }}
                  style={{
                    height: tokens.height.chip,
                    paddingHorizontal: 12,
                    borderRadius: tokens.radius.full,
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: on ? tokens.color.text : tokens.color.border,
                    backgroundColor: on ? tokens.color.text : tokens.color.background,
                  }}
                >
                  <T variant="sub" weight="semibold" color={on ? tokens.color.onAccent : tokens.color.text}>
                    {label}
                  </T>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {error ? (
          <View accessibilityRole="alert" style={{ gap: 4 }}>
            <T color={tokens.color.error}>{error}</T>
            <Button label="다시 시도" variant="text" onPress={() => setAttempt((n) => n + 1)} />
          </View>
        ) : !page ? (
          <T muted>답장 불러오는 중…</T>
        ) : shown.length === 0 ? (
          <T muted>{filter === "unread" ? "안 읽은 답장이 없어요" : "아직 답장이 없어요"}</T>
        ) : (
          <View style={{ borderTopWidth: 1, borderColor: tokens.color.border }}>
            {shown.map((r) => (
              <ReplyRow
                key={r.messageId}
                reply={r}
                onQuote={() => onQuote(r)}
                onPrivate={onPrivate ? () => onPrivate(r.consumerId, r.messageId) : undefined}
              />
            ))}
          </View>
        )}
      </View>
    </Sheet>
  );
}

function ReplyRow({
  reply,
  onQuote,
  onPrivate,
}: {
  reply: FanReplyRow;
  onQuote: () => void;
  onPrivate?: () => void;
}) {
  return (
    <View
      testID="fan-reply-row"
      style={{
        flexDirection: "row",
        gap: 12,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderColor: tokens.color.border,
      }}
    >
      <ProfileAvatar name={reply.senderName} size={tokens.thumb.avatar} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <T weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
            {reply.senderName}
          </T>
          {reply.reservedCustomer ? (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 1,
                borderRadius: 4,
                backgroundColor: TAG_BG,
              }}
            >
              <T variant="caption" weight="semibold" color={tokens.color.accent}>
                예약 고객
              </T>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          {reply.unread ? (
            <View
              accessible
              accessibilityLabel="안 읽음"
              testID="fan-reply-unread"
              style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.color.accent }}
            />
          ) : null}
          <T variant="caption" muted>
            {time(reply.createdAt)}
          </T>
        </View>
        <T>{reply.body}</T>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={reply.quoted ? "모두에게 답장함, 다시 답장" : "모두에게 답장"}
            onPress={onQuote}
            hitSlop={8}
            style={{ minHeight: 32, justifyContent: "center" }}
          >
            {reply.quoted ? (
              <T variant="sub" muted>
                모두에게 답장함 ✓
              </T>
            ) : (
              <T variant="sub" weight="semibold" color={tokens.color.accent}>
                모두에게 답장
              </T>
            )}
          </Pressable>
          {onPrivate ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="1:1 채팅"
              onPress={onPrivate}
              hitSlop={8}
              style={{ minHeight: 32, justifyContent: "center" }}
            >
              <T variant="sub" weight="semibold">
                1:1 채팅
              </T>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
