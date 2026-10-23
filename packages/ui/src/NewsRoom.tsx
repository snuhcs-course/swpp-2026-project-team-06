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
import { Icon } from "./Icon";
import { Button } from "./Button";
import { T } from "./Text";
import { Photo } from "./content";
import { ChatBubble } from "./ChatBubble";
import { tokens } from "./tokens";
import { safe } from "./web";

const PRIVATE_AREA = { dataSet: { phPrivate: "1" } } as object;

type Message = {
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
};
type Page = {
  items: Message[];
  nextCursor: string | null;
  room: { farmName: string; canReply: boolean };
};
type Props = {
  userId: string;
  joinAction?: ReactNode;
  onLogin?: () => void;
  producer?: boolean;
  active: boolean;
  onAttach?: () => void;
  onPrivateReply?: (consumerId: string, replyId: string) => void;
  load: (cursor?: string) => Promise<Page>;
  send: (body: string, key: string) => Promise<Message>;
  makeKey: () => string;
  react: (
    id: string,
    liked: boolean,
  ) => Promise<{ reactionCount: number; myReaction: boolean }>;
};
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
  const scroll = useRef<ScrollView>(null);
  const nearBottom = useRef(true),
    height = useRef(0),
    offset = useRef(0);
  const preserve = useRef<{ height: number; offset: number } | null>(null);
  const pending = useRef<{ body: string; key: string } | null>(null);
  const sending = useRef(false);
  const alive = useRef(true);
  const initialized = useRef(false);
  const known = useRef(new Set<string>());
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const merge = (items: Message[]) =>
    setMessages((previous) => {
      const map = new Map(previous.map((m) => [m.messageId, m]));
      for (const m of items) {
        map.set(m.messageId, m);
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
      if (running || (typeof document !== "undefined" && document.hidden))
        return;
      running = true;
      try {
        const page = await load();
        if (cancelled) return;
        if (access.current !== page.room.canReply) {
          accessEpoch.current++;
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
  async function submit() {
    const text = body.trim();
    if (!text || sending.current) return;
    const epoch = accessEpoch.current;
    sending.current = true;
    setBusy(true);
    setError("");
    if (pending.current?.body !== text)
      pending.current = { body: text, key: makeKey() };
    try {
      const message = await send(text, pending.current.key);
      if (!alive.current || epoch !== accessEpoch.current) return;
      nearBottom.current = true;
      merge([message]);
      setBody("");
      pending.current = null;
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "전송하지 못했어요. 다시 전송해 주세요",
        );
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
    } catch {
      setError("좋아요를 반영하지 못했어요");
    }
  }
  return (
    // 메시지 본문·보낸 사람은 세션 녹화에서 가린다(N-05, DEV-71). react-native-web이 data-ph-private로 내보낸다
    <View
      {...PRIVATE_AREA}
      style={{ flex: 1, minHeight: 0, backgroundColor: tokens.color.surface }}
    >
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
            <ChatBubble
              kind={m.senderId === userId ? "me" : "farm"}
              text={m.body}
              sender={m.senderId === userId ? undefined : m.senderName}
              time={new Date(m.createdAt).toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            >
              {[...m.photos, ...m.videos].map((uri) => (
                <RoomMedia key={uri} uri={uri} />
              ))}
            </ChatBubble>
            {producer && m.senderRole === "CONSUMER" && onPrivateReply ? (
              <Button
                label={`${m.senderName}에게 1:1 답장`}
                variant="text"
                onPress={() => onPrivateReply(m.senderId, m.messageId)}
              />
            ) : null}
            {m.broadcastId && producer ? (
              <T variant="caption" muted style={{ alignSelf: "flex-end" }}>
                ♡ 좋아요 {m.reactionCount}
              </T>
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
              accessibilityLabel={
                producer ? "모두에게 보낼 소식" : "농가에 답장"
              }
              value={body}
              onChangeText={setBody}
              editable={ready && !busy}
              multiline
              maxLength={producer ? 2000 : 1000}
              placeholder={
                producer ? "모든 팔로워에게 소식 보내기" : "농가에 답장하기"
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
              accessibilityState={{
                disabled: !ready || !body.trim() || busy,
                busy,
              }}
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
      ) : (
        <View style={{ padding: 16, paddingBottom: safe("bottom", 16) }}>
          {joinAction}
        </View>
      )}
    </View>
  );
}
