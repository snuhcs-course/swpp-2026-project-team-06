import { MessageEditSheet } from "./MessageEditSheet";
import {
  createElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { MessageMenu, type MenuPoint } from "./MessageMenu";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { T } from "./Text";
import { Photo } from "./content";
import { ChatBubble } from "./ChatBubble";
import { Sheet } from "./bars";
import { tokens } from "./tokens";
import { safe } from "./web";
import { inBackground } from "./foreground";
import { time } from "./format";

const quotePreview = (body: string) => body.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일 가림]");
const PRIVATE_AREA = { dataSet: { phPrivate: "1" } } as object;

type Message = {
  replyTo?: {senderType: string; body: string} | null;
  editedAt?: string | null; editVersion?: number;
  messageId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  body: string;
  photos: string[];
  videos: string[];
  createdAt: string;
  broadcastId: string | null;
  reactionCount: number;
  myReaction: boolean;
  visibility?: "PUBLIC" | "FOLLOWERS" | null;
};
type Page = {
  items: Message[];
  nextCursor: string | null;
  room: { farmName: string; canReply: boolean };
};
type Props = {
  edit?: (id: string, text: string, version: number, key: string) => Promise<Message>;
  userId: string;
  joinAction?: ReactNode;
  onLogin?: () => void;
  producer?: boolean;
  active: boolean;
  onAttach?: () => void;
  onPrivateReply?: (consumerId: string, replyId: string) => void;
  load: (cursor?: string) => Promise<Page>;
  send: (body: string, key: string, replyToMessageId?: string, replyToVersion?: number) => Promise<Message>;
  makeKey: () => string;
  react: (
    id: string,
    liked: boolean,
  ) => Promise<{ reactionCount: number; myReaction: boolean }>;
  /** 생산자: 지금 팔로워 수. 입력칸 안내와 확인 시트에 쓴다(AC-12-13) */
  recipientCount?: number | null;
  /** 생산자: 내 소식 삭제(M-23, AC-12-14). 있으면 본인 방송에 ⋯ 메뉴가 생긴다 */
  remove?: (broadcastId: string) => Promise<unknown>;
  /** 토스트 */
  notify?: (message: string) => void;
  /** 소비자: 팔로우를 끊은 방(본인 답장이 남은 방)에서 띠의 '다시 팔로우'(DEV-230) */
  onRefollow?: () => void;
  /** 소비자: 팔로우를 끊었지만 본인 답장이 남은 방인지 알린다(헤더 버튼 모양, DEV-230) */
  onLapsedChange?: (lapsed: boolean) => void;
};
const statusOf = (e: unknown) =>
  e && typeof e === "object" && "status" in e ? Number(e.status) : 0;
export function RoomMedia({ uri }: { uri: string }) {
  return /^data:video|\.(mp4|webm)$/.test(uri) && Platform.OS === "web" ? (
    createElement("video", {
      src: uri,
      controls: true,
      preload: "metadata",
      style: { width: 250, borderRadius: 12 },
    })
  ) : (
    <Photo uri={uri} width={272} height={236} alt="소식 사진" />
  );
}
export function NewsRoom({
  edit,
  userId,
  producer = false,
  active,
  load,
  send,
  makeKey,
  react,
  onPrivateReply,
  onAttach,
  joinAction,
  onLogin,
  recipientCount,
  remove,
  notify,
  onRefollow,
  onLapsedChange,
}: Props) {
  const [canReply, setCanReply] = useState(producer);
  const access = useRef<boolean | null>(null);
  const accessEpoch = useRef(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [older, setOlder] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const [farmName, setFarmName] = useState("");
  // 생산자 1:N 전송 확인(AC-12-13)과 내 소식 삭제(AC-12-14·16) 시트
  const [confirming, setConfirming] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [editTarget, setEditTarget] = useState<Message | null>(null);
  const [menuTarget, setMenuTarget] = useState<Message | null>(null);
  const [menuPoint, setMenuPoint] = useState<MenuPoint | null>(null);
  const [target, setTarget] = useState<Message | null>(null);
  const [removing, setRemoving] = useState(false);
  const input = useRef<TextInput>(null);
  const scroll = useRef<ScrollView>(null);
  const nearBottom = useRef(true),
    height = useRef(0),
    offset = useRef(0);
  const preserve = useRef<{ height: number; offset: number } | null>(null);
  const pending = useRef<{ body: string; replyId?: string; replyVersion?: number; key: string } | null>(null);
  const sending = useRef(false);
  const alive = useRef(true);
  const initialized = useRef(false);
  const known = useRef(new Set<string>());
  const fresh = useRef(new Set<string>());
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => { if (!active) { accessEpoch.current++; setEditTarget(null); setMenuTarget(null); setReplyTarget(null); } }, [active]);
  /** 새로고침 응답이 덮는 범위(가장 오래된 항목 이후, complete면 전부)에서 응답에 없는 방송은 지워진 것이다(M-23).
   * 답장은 지우지 않는다. 내가 막 보내 아직 응답에 나온 적 없는 소식(fresh)은 늦게 온 응답이 지우지 않게 남긴다 */
  const reconcile = (items: Message[], complete: boolean) => {
    if (!items.length && !complete) return;
    const ids = new Set(items.map((m) => m.messageId));
    for (const id of ids) fresh.current.delete(id);
    const from = complete ? "" : items.map((m) => m.createdAt).sort()[0];
    setMessages((previous) => {
      const next = previous.filter(
        (m) =>
          !m.broadcastId ||
          ids.has(m.messageId) ||
          fresh.current.has(m.messageId) ||
          m.createdAt < from,
      );
      for (const m of previous)
        if (!next.includes(m)) known.current.delete(m.messageId);
      return next.length === previous.length ? previous : next;
    });
  };
  const drop = (messageId: string) => {
    known.current.delete(messageId);
    fresh.current.delete(messageId);
    setMessages((previous) => previous.filter((m) => m.messageId !== messageId));
  };
  const merge = (items: Message[]) =>
    setMessages((previous) => {
      const map = new Map(previous.map((m) => [m.messageId, m]));
      for (const m of items) {
        const prior = map.get(m.messageId);
        if (!prior || (m.editVersion ?? 0) >= (prior.editVersion ?? 0)) map.set(m.messageId, m);
        known.current.add(m.messageId);
      }
      return [...map.values()].sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) ||
          a.messageId.localeCompare(b.messageId),
      );
    });
  useEffect(() => {
    if (!active) return;
    let cancelled = false,
      running = false;
    const refresh = async () => {
      if (running || inBackground())
        return;
      running = true;
      try {
        const page = await load();
        if (cancelled) return;
        if (access.current !== page.room.canReply) {
          accessEpoch.current++;
          setEditTarget(null); setMenuTarget(null); setReplyTarget(null);
          access.current = page.room.canReply;
          setCanReply(page.room.canReply);
          setMessages([]);
          known.current.clear();
          initialized.current = false;
          setCursor(null);
          setBody("");
          pending.current = null;
        }
        const incoming = [...page.items];
        let next = page.nextCursor;
        while (
          known.current.size &&
          next &&
          !incoming.some((m) => known.current.has(m.messageId)) &&
          !cancelled
        ) {
          const olderPage = await load(next);
          incoming.push(...olderPage.items);
          next = olderPage.nextCursor;
        }
        if (cancelled) return;
        setFarmName(page.room.farmName);
        reconcile(incoming, next === null);
        merge(incoming);
        if (!initialized.current) {
          setCursor(page.nextCursor);
          initialized.current = true;
        }
        setReady(true);
        setLoadError("");
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "소식을 불러오지 못했어요",
          );
          if (
            e &&
            typeof e === "object" &&
            "status" in e &&
            [401, 403, 404].includes(Number(e.status))
          ) {
            accessEpoch.current++;
            setEditTarget(null); setMenuTarget(null); setReplyTarget(null);
            access.current = null;
            setCanReply(false);
            setMessages([]);
            setReady(false);
            setCursor(null);
            known.current.clear();
            initialized.current = false;
          }
        }
      } finally {
        running = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, load]);
  async function loadOlder() {
    if (!cursor || older) return;
    setOlder(true);
    const epoch = accessEpoch.current;
    try {
      const page = await load(cursor);
      if (!alive.current || epoch !== accessEpoch.current) return;
      preserve.current = { height: height.current, offset: offset.current };
      merge(page.items);
      setCursor(page.nextCursor);
    } catch {
      setError("이전 소식을 불러오지 못했어요. 다시 시도해 주세요");
    } finally {
      if (alive.current) setOlder(false);
    }
  }
  function submit() {
    if (!body.trim() || sending.current) return;
    if (producer) {
      setSheetError("");
      setConfirming(true);
      return;
    }
    void deliver();
  }
  async function deliver() {
    const text = body.trim();
    if (!text || sending.current) return;
    const epoch = accessEpoch.current;
    sending.current = true;
    setBusy(true);
    setError("");
    const replyVersion = replyTarget ? replyTarget.editVersion ?? 0 : undefined;
    if (pending.current?.body !== text || pending.current?.replyId !== replyTarget?.messageId || pending.current?.replyVersion !== replyVersion)
      pending.current = { body: text, replyId: replyTarget?.messageId, replyVersion, key: makeKey() };
    try {
      const message = await send(text, pending.current.key, pending.current.replyId, pending.current.replyVersion);
      if (!alive.current || epoch !== accessEpoch.current) return;
      nearBottom.current = true;
      if (message.broadcastId) fresh.current.add(message.messageId);
      merge([message]);
      setBody("");
      setReplyTarget(null);
      pending.current = null;
      if (producer) {
        setConfirming(false);
        notify?.(
          recipientCount != null
            ? `팔로워 ${recipientCount}명에게 보냈어요`
            : "소식을 보냈어요",
        );
      }
    } catch (e) {
      if (alive.current) {
        const message =
          e instanceof Error
            ? e.message
            : "전송하지 못했어요. 다시 전송해 주세요";
        if (producer) setSheetError(message);
        else setError(message);
      }
    } finally {
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function like(message: Message) {
    if (!userId) {
      onLogin?.();
      return;
    }
    if (!message.broadcastId) return;
    const epoch = accessEpoch.current;
    try {
      const result = await react(message.broadcastId, message.myReaction);
      if (alive.current && epoch === accessEpoch.current)
        merge([{ ...message, ...result }]);
    } catch (e) {
      if (statusOf(e) === 404) {
        // 농가가 지운 소식(M-23)
        drop(message.messageId);
        setError("삭제된 소식이에요");
      } else setError("좋아요를 반영하지 못했어요");
    }
  }
  async function removeNews(rewrite: boolean) {
    const m = target;
    if (!m?.broadcastId || !remove || removing) return;
    setRemoving(true);
    setSheetError("");
    try {
      await remove(m.broadcastId);
    } catch (e) {
      // 404는 이미 지워진 것으로 본다
      if (statusOf(e) !== 404) {
        if (alive.current) {
          setSheetError("삭제하지 못했어요. 다시 시도해 주세요");
          setRemoving(false);
        }
        return;
      }
    }
    if (!alive.current) return;
    drop(m.messageId);
    setTarget(null);
    setRemoving(false);
    if (rewrite) {
      setBody(m.body);
      pending.current = null;
      notify?.("소식을 삭제했어요 · 고쳐서 다시 보내 주세요");
      setTimeout(() => input.current?.focus(), 0);
    } else notify?.("소식을 삭제했어요");
  }
  // 팔로우를 끊은 소비자: 서버가 공개 소식과 본인 답장만 준다(AC-15-8). 본인 답장이 있으면 예전 팔로워로 본다(DEV-230)
  const lapsed =
    !producer &&
    !canReply &&
    !!userId &&
    messages.some((m) => m.senderRole === "CONSUMER" && m.senderId === userId);
  useEffect(() => {
    if (ready) onLapsedChange?.(lapsed);
  }, [lapsed, ready]);
  const followers =
    recipientCount != null ? `팔로워 ${recipientCount}명` : "팔로워";
  const openMenu = (m: Message) => {
    setSheetError("");
    setTarget(m);
  };
  return (
    // 메시지 본문·보낸 사람은 세션 녹화에서 가린다(N-05, DEV-71). react-native-web이 data-ph-private로 내보낸다
    <View
      {...PRIVATE_AREA}
      style={{ flex: 1, minHeight: 0, backgroundColor: tokens.color.surface }}
    >
      {lapsed ? (
        <View
          testID="room-lapsed-banner"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingLeft: 20,
            paddingRight: 8,
            paddingVertical: 4,
            backgroundColor: tokens.color.background,
            borderBottomWidth: 1,
            borderColor: tokens.color.border,
          }}
        >
          <T variant="sub" style={{ flex: 1, minWidth: 0 }}>
            팔로우를 끊어 새 소식이 오지 않아요
          </T>
          {onRefollow ? (
            <Button
              label="다시 팔로우"
              variant="text"
              onPress={onRefollow}
            />
          ) : null}
        </View>
      ) : null}
      {error || loadError ? (
        <View accessibilityRole="alert" style={{ padding: 12 }}>
          <T color={tokens.color.error}>{error || loadError}</T>
        </View>
      ) : null}
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 20 }}
        onScroll={(event) => {
          const n = event.nativeEvent;
          offset.current = n.contentOffset.y;
          nearBottom.current =
            n.contentSize.height -
              n.layoutMeasurement.height -
              n.contentOffset.y <
            80;
          if (nearBottom.current) setUnseen(false);
        }}
        scrollEventThrottle={100}
        onContentSizeChange={(_, h) => {
          if (preserve.current) {
            scroll.current?.scrollTo({
              y: preserve.current.offset + h - preserve.current.height,
              animated: false,
            });
            preserve.current = null;
          } else if (nearBottom.current)
            scroll.current?.scrollToEnd({ animated: false });
          else if (h > height.current) setUnseen(true);
          height.current = h;
        }}
      >
        {producer ? (
          <T variant="caption" muted center style={{ padding: 12 }}>
            보내는 소식은 모든 팔로워에게 보여요
          </T>
        ) : null}
        {cursor ? (
          <Button
            label="이전 소식 보기"
            variant="text"
            loading={older}
            onPress={loadOlder}
          />
        ) : null}
        {!ready ? (
          <T muted>소식 불러오는 중…</T>
        ) : messages.length === 0 ? (
          <T muted>아직 소식이 없어요.</T>
        ) : null}
        {messages.map((m, i) => (
          <View key={m.messageId} style={{ gap: 8 }}>
            {i === 0 ||
            new Date(m.createdAt).toLocaleDateString("ko-KR") !==
              new Date(messages[i - 1].createdAt).toLocaleDateString(
                "ko-KR",
              ) ? (
              <T variant="caption" muted center style={{ marginVertical: 12 }}>
                {new Date(m.createdAt).toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </T>
            ) : null}
            <Pressable
              accessible={false}
              disabled={!((edit && m.senderId === userId) || (producer && ((remove && m.broadcastId) || (onPrivateReply && m.senderRole === "CONSUMER"))))}
              delayLongPress={500}
              onLongPress={() => { setMenuPoint(null); setMenuTarget(m); }}
              {...(Platform.OS === "web" && ((edit && m.senderId === userId) || (producer && ((remove && m.broadcastId) || (onPrivateReply && m.senderRole === "CONSUMER")))) ? {
                onContextMenu: (e: {preventDefault: () => void; clientX: number; clientY: number}) => {
                  e.preventDefault(); setMenuPoint({x: e.clientX, y: e.clientY}); setMenuTarget(m);
                },
                tabIndex: 0,
                onKeyDown: (e: {key: string; shiftKey: boolean; preventDefault: () => void}) => {
                  if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); setMenuPoint(null); setMenuTarget(m); }
                },
              } as object : {})}
              // 팔로우를 끊은 방의 내 답장은 흐리게 남긴다(DEV-230)
              style={
                lapsed && m.senderId === userId ? { opacity: 0.45 } : undefined
              }
              testID={
                lapsed && m.senderId === userId ? "room-dimmed-reply" : undefined
              }
            >
            <ChatBubble
              kind={m.senderId === userId ? "me" : "farm"}
              quote={m.replyTo ?? undefined}
              edited={!!m.editedAt}
              text={m.body}
              sender={m.senderId === userId ? undefined : m.senderName}
              time={time(m.createdAt)}
            >
              {[...m.photos, ...m.videos].map((uri) => (
                <RoomMedia key={uri} uri={uri} />
              ))}
            </ChatBubble>
            </Pressable>
            {m.broadcastId && producer ? (
              <View
                style={{
                  alignSelf: "flex-end",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <T variant="caption" muted>
                  ♡ 좋아요 {m.reactionCount}
                </T>

              </View>
            ) : m.broadcastId ? (
              <Button
                label={`${m.myReaction ? "♥" : "♡"} 좋아요 ${m.reactionCount}`}
                variant="text"
                onPress={() => void like(m)}
                style={{
                  alignSelf: m.senderId === userId ? "flex-end" : "flex-start",
                }}
              />
            ) : null}
          </View>
        ))}
      </ScrollView>
      {unseen ? (
        <Button
          label="새 소식 ↓"
          variant="secondary"
          onPress={() => {
            nearBottom.current = true;
            setUnseen(false);
            scroll.current?.scrollToEnd({ animated: true });
          }}
        />
      ) : null}
      {canReply ? <T variant="caption" muted center>{producer ? "소식방 · 모든 팔로워에게 보내요" : "소식방 · 내 글은 농가만 봐요. 농가가 답장하면 익명으로 인용돼요"}</T> : null}
      {canReply ? (
        <View
          style={{
            padding: 12,
            paddingBottom: producer ? 12 : safe("bottom", 12),
            backgroundColor: tokens.color.background,
            borderTopWidth: 1,
            borderColor: tokens.color.border,
            gap: 8,
          }}
        >
          {replyTarget ? <View style={{flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12}}>
            <View style={{flex: 1}}><T variant="caption" muted>소비자에게 답장 · 모든 팔로워에게 보여요</T><T numberOfLines={2}>{quotePreview(replyTarget.body)}</T></View>
            <Pressable accessibilityRole="button" accessibilityLabel="답장 취소" disabled={busy} onPress={() => setReplyTarget(null)} style={{width: 44, height: 44, alignItems: "center", justifyContent: "center"}}><T>×</T></Pressable>
          </View> : null}
          <View
            style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}
          >
            {onAttach ? (
              <Button
                label="＋"
                accessibilityLabel="사진·영상 소식 첨부"
                variant="text"
                onPress={onAttach}
                disabled={!ready || busy}
              />
            ) : null}
            <TextInput
              ref={input}
              accessibilityLabel={
                producer ? "모두에게 보낼 소식" : "농가에 답장"
              }
              value={body}
              onChangeText={setBody}
              editable={ready && !busy}
              multiline
              maxLength={producer ? 2000 : 1000}
              placeholder={
                producer
                  ? recipientCount != null
                    ? `팔로워 ${recipientCount}명에게 소식 보내기`
                    : "모든 팔로워에게 소식 보내기"
                  : "농가에 답장하기"
              }
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 48,
                maxHeight: 130,
                padding: 12,
                borderRadius: 24,
                backgroundColor: tokens.color.surface,
                fontSize: 16,
                fontFamily: tokens.fontFamily,
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="전송"
              aria-busy={busy}
              onPress={submit}
              disabled={!ready || !body.trim() || busy}
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: tokens.color.accent,
                opacity: !ready || !body.trim() || busy ? 0.35 : 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {busy ? (
                <ActivityIndicator color={tokens.color.onAccent} />
              ) : (
                <Icon name="send" color={tokens.color.onAccent} />
              )}
            </Pressable>
          </View>
        </View>
      ) : lapsed ? (
        // 예전 팔로워는 강조색 버튼 대신 잠긴 입력칸(DEV-230). 다시 팔로우는 띠·헤더에서
        <View
          style={{
            padding: 12,
            paddingBottom: safe("bottom", 12),
            backgroundColor: tokens.color.background,
            borderTopWidth: 1,
            borderColor: tokens.color.border,
          }}
        >
          <View
            testID="room-locked-input"
            accessible
            accessibilityRole="text"
            accessibilityState={{ disabled: true }}
            accessibilityLabel="답장 잠김. 다시 팔로우하면 답장할 수 있어요"
            style={{
              minHeight: 48,
              borderRadius: 24,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: tokens.color.surface,
            }}
          >
            <Icon name="lock" size={20} color={tokens.color.textMuted} />
            <T variant="sub" muted>
              다시 팔로우하면 답장할 수 있어요
            </T>
          </View>
        </View>
      ) : (
        <View style={{ padding: 16, paddingBottom: safe("bottom", 16) }}>
          {joinAction}
        </View>
      )}
      <MessageMenu visible={!!menuTarget && !busy} point={menuPoint} onClose={() => setMenuTarget(null)}
        actions={[
          ...(menuTarget && edit && menuTarget.senderId === userId ? [{label: "수정", onPress: () => setEditTarget(menuTarget)}] : []),
          ...(menuTarget?.broadcastId && remove && producer ? [{label: "삭제·다시 쓰기", onPress: () => { if (menuTarget) openMenu(menuTarget); }}] : []),
          ...(menuTarget?.senderRole === "CONSUMER" && producer ? [{label: "답장", onPress: () => { setReplyTarget(menuTarget); setTimeout(() => input.current?.focus(), 0); }}] : []),
          ...(menuTarget?.senderRole === "CONSUMER" && producer && onPrivateReply ? [{label: "1:1 채팅", onPress: () => { if (menuTarget) onPrivateReply(menuTarget.senderId, menuTarget.messageId); }}] : []),
        ]} />
      {editTarget && edit ? <MessageEditSheet key={editTarget.messageId} body={editTarget.body} limit={producer ? 2000 : 1000}
        makeKey={makeKey} onClose={() => setEditTarget(null)} onSave={async (text, key) => {
          const epoch = accessEpoch.current;
          const saved = await edit(editTarget.messageId, text, editTarget.editVersion ?? 0, key);
          if (!alive.current || epoch !== accessEpoch.current) return;
          merge([saved]); setEditTarget(null);
        }} /> : null}
      {producer ? (
        <Sheet
          visible={confirming}
          onClose={() => {
            if (!busy) setConfirming(false);
          }}
        >
          <T variant="heading">
            {recipientCount === 0
              ? "아직 팔로워가 없어요. 그래도 보낼까요?"
              : `${followers}에게 보낼까요?`}
          </T>
          {replyTarget ? <View style={{borderLeftWidth: 3, borderLeftColor: tokens.color.accent, padding: 8}}><T variant="caption" muted>익명 소비자 글 인용 · 모든 팔로워에게 보여요</T><T>{quotePreview(replyTarget.body)}</T></View> : null}
          <NewsPreview
            head={farmName}
            meta="팔로워만 · 소비자에게 이렇게 보여요"
            body={body.trim()}
          />
          <T variant="sub">
            {recipientCount === 0
              ? "새로 팔로우하는 분이 이 소식을 보게 돼요. "
              : ""}
            보낸 소식의 본문은 수정하거나 삭제할 수 있어요.
          </T>
          {sheetError ? (
            <View accessibilityRole="alert">
              <T variant="sub" color={tokens.color.error}>
                {sheetError}
              </T>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              label="아니요"
              variant="secondary"
              size="producer"
              disabled={busy}
              style={{ flex: 1 }}
              onPress={() => setConfirming(false)}
            />
            <Button
              label="확인 · 보내기"
              size="producer"
              loading={busy}
              disabled={busy}
              style={{ flex: 2 }}
              onPress={() => void deliver()}
            />
          </View>
        </Sheet>
      ) : null}
      {producer && remove ? (
        <Sheet
          visible={!!target}
          onClose={() => {
            if (!removing) setTarget(null);
          }}
        >
          <T variant="heading">이 소식을 삭제할까요?</T>
          {target ? (
            <NewsPreview
              head={new Date(target.createdAt).toLocaleString("ko-KR", {
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              meta={`${target.visibility === "PUBLIC" ? "모두 공개" : "팔로워만"} · 좋아요 ${target.reactionCount}`}
              body={
                target.body ||
                (target.photos.length || target.videos.length
                  ? "사진·영상 소식"
                  : "")
              }
            />
          ) : null}
          <View>
            <T variant="sub">
              {target?.visibility === "PUBLIC"
                ? `${followers}의 소식방과 농가 공개 소식방에서 사라져요.`
                : `${followers}의 소식방과 채팅 목록에서 사라져요.`}
            </T>
            <T variant="sub" muted>
              받은 답장은 지워지지 않아요. 삭제한 소식은 되돌릴 수 없어요.
            </T>
          </View>
          {sheetError ? (
            <View accessibilityRole="alert">
              <T variant="sub" color={tokens.color.error}>
                {sheetError}
              </T>
            </View>
          ) : null}
          {target && !target.photos.length && !target.videos.length ? (
            <Button
              label="삭제하고 다시 쓰기"
              variant="text"
              disabled={removing}
              onPress={() => void removeNews(true)}
            />
          ) : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              label="아니요"
              variant="secondary"
              size="producer"
              disabled={removing}
              style={{ flex: 1 }}
              onPress={() => setTarget(null)}
            />
            <Button
              label="삭제"
              size="producer"
              loading={removing}
              disabled={removing}
              style={{ flex: 2 }}
              onPress={() => void removeNews(false)}
            />
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}

function NewsPreview({
  head,
  meta,
  body,
}: {
  head: string;
  meta: string;
  body: string;
}) {
  return (
    <View
      style={{
        gap: 6,
        padding: 16,
        borderWidth: 1,
        borderColor: tokens.color.border,
        borderRadius: tokens.radius.md,
        backgroundColor: tokens.color.background,
      }}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <T variant="sub" weight="semibold">
          {head}
        </T>
        <T variant="caption" muted>
          {meta}
        </T>
      </View>
      <T variant="sub">{body}</T>
    </View>
  );
}
