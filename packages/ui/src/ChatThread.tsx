import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { Button } from "./Button";
import { ChatBubble } from "./ChatBubble";
import { T } from "./Text";
import { PrivatePhoto, PrivatePhotos } from "./PrivatePhotos";
import { tokens } from "./tokens";
import { time } from "./format";
type Message = {
  messageId: string;
  senderType: string;
  body: string;
  createdAt: string;
  sourceSummary: string | null;
  attachmentIds?: string[];
  inquiryId?: string;
  orderId?: string;
};
type Page = { items: Message[]; nextCursor: string | null };
type Props = {
  producer?: boolean;
  active: boolean;
  load: (cursor?: string) => Promise<Page>;
  send: (text: string, ids: string[], key: string) => Promise<unknown>;
  read: (id: string) => Promise<unknown>;
  makeKey: () => string;
  loadPhoto: (id: string) => Promise<string>;
  upload: (file: File) => Promise<{ attachmentId: string }>;
  children?: ReactNode;
};
export function ChatThread({
  producer = false,
  active,
  load,
  send,
  read,
  makeKey,
  loadPhoto,
  upload,
  children,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [text, setText] = useState(""),
    [ids, setIds] = useState<string[]>([]),
    [photos, setPhotos] = useState(false),
    [uploading, setUploading] = useState(false),
    [busy, setBusy] = useState(false),
    [unseen, setUnseen] = useState(false),
    [older, setOlder] = useState(false);
  const scroll = useRef<ScrollView>(null),
    known = useRef(new Set<string>()),
    initialized = useRef(false),
    near = useRef(true),
    height = useRef(0),
    offset = useRef(0),
    preserve = useRef<{ height: number; offset: number } | null>(null),
    pending = useRef<{ body: string; key: string } | null>(null),
    lock = useRef(false),
    alive = useRef(true),
    lastRead = useRef("");
  const callbacks = useRef({ send, read, upload });
  callbacks.current = { send, read, upload };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function merge(items: Message[]) {
    setMessages((old) => {
      const map = new Map(old.map((m) => [m.messageId, m]));
      items.forEach((m) => {
        map.set(m.messageId, m);
        known.current.add(m.messageId);
      });
      return [...map.values()].sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) ||
          a.messageId.localeCompare(b.messageId),
      );
    });
  }
  useEffect(() => {
    if (!active) return;
    let canceled = false,
      running = false;
    async function refresh() {
      if (running || (typeof document !== "undefined" && document.hidden))
        return;
      running = true;
      try {
        const p = await load(),
          incoming = [...p.items];
        let next = p.nextCursor;
        while (
          known.current.size &&
          next &&
          !incoming.some((m) => known.current.has(m.messageId)) &&
          !canceled
        ) {
          const q = await load(next);
          incoming.push(...q.items);
          next = q.nextCursor;
        }
        if (canceled) return;
        merge(incoming);
        if (!initialized.current) {
          setCursor(p.nextCursor);
          initialized.current = true;
        }
        setReady(true);
        setError("");
        const last = p.items.at(-1);
        if (near.current && last && lastRead.current !== last.messageId) {
          await callbacks.current.read(last.messageId);
          lastRead.current = last.messageId;
        }
      } catch (e) {
        if (!canceled) {
          setError(e instanceof Error ? e.message : "대화를 불러오지 못했어요");
          if (
            e &&
            typeof e === "object" &&
            "status" in e &&
            [401, 403, 404].includes(Number(e.status))
          ) {
            setMessages([]);
            known.current.clear();
            setReady(false);
          }
        }
      } finally {
        running = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => {
      canceled = true;
      clearInterval(timer);
    };
  }, [active, load]);
  async function submit() {
    if (lock.current || uploading || (!text.trim() && !ids.length)) return;
    lock.current = true;
    setBusy(true);
    const body = JSON.stringify({ text: text.trim(), ids });
    if (pending.current?.body !== body)
      pending.current = { body, key: makeKey() };
    try {
      await callbacks.current.send(text.trim(), ids, pending.current.key);
      if (!alive.current) return;
      setText("");
      setIds([]);
      setPhotos(false);
      pending.current = null;
      near.current = true;
      const p = await load();
      if (alive.current) {
        merge(p.items);
        setError("");
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "전송하지 못했어요. 다시 보내 주세요",
        );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function previous() {
    if (!cursor || older) return;
    setOlder(true);
    try {
      const p = await load(cursor);
      if (!alive.current) return;
      preserve.current = { height: height.current, offset: offset.current };
      merge(p.items);
      setCursor(p.nextCursor);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "이전 대화를 불러오지 못했어요",
      );
    } finally {
      if (alive.current) setOlder(false);
    }
  }
  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: "#FAF9F6" }}>
      {error ? (
        <View
          accessibilityRole="alert"
          style={{ padding: 12, backgroundColor: "#FFF0EB" }}
        >
          <T variant="sub" color={tokens.color.error}>
            {error}
          </T>
        </View>
      ) : null}
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 20 }}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={100}
        onScroll={(e) => {
          const n = e.nativeEvent;
          offset.current = n.contentOffset.y;
          near.current =
            n.contentSize.height -
              n.layoutMeasurement.height -
              n.contentOffset.y <
            80;
          if (near.current) setUnseen(false);
        }}
        onContentSizeChange={(_, h) => {
          if (preserve.current) {
            scroll.current?.scrollTo({
              y: preserve.current.offset + h - preserve.current.height,
              animated: false,
            });
            preserve.current = null;
          } else if (near.current)
            scroll.current?.scrollToEnd({ animated: false });
          else if (h > height.current) setUnseen(true);
          height.current = h;
        }}
      >
        {cursor ? (
          <Button
            label="이전 대화 보기"
            variant="text"
            loading={older}
            onPress={previous}
          />
        ) : null}
        {!ready ? (
          <T muted>대화 불러오는 중…</T>
        ) : messages.length === 0 ? (
          <T muted>첫 이야기를 남겨 보세요.</T>
        ) : null}
        {messages.map((m, i) => (
          <View key={m.messageId} style={{ gap: 14 }}>
            {!i ||
            m.createdAt.slice(0, 10) !==
              messages[i - 1].createdAt.slice(0, 10) ? (
              <T variant="caption" muted center>
                {m.createdAt.slice(0, 10)}
              </T>
            ) : null}
            <ChatBubble
              kind={
                m.senderType === (producer ? "PRODUCER" : "CONSUMER")
                  ? "me"
                  : m.senderType === "AI"
                    ? "ai"
                    : "farm"
              }
              text={m.body}
              sender={
                m.senderType === (producer ? "PRODUCER" : "CONSUMER")
                  ? undefined
                  : m.senderType === "PRODUCER"
                    ? "농가"
                    : m.senderType === "CONSUMER"
                      ? "소비자"
                      : undefined
              }
              time={time(m.createdAt)}
              basis={m.sourceSummary ?? undefined}
              note={
                m.inquiryId
                  ? "주문 문제 문의 · 직접 응대"
                  : m.orderId
                    ? "주문에 연결된 대화"
                    : undefined
              }
            >
              {m.attachmentIds?.map((id) => (
                <PrivatePhoto key={id} id={id} load={loadPhoto} />
              ))}
            </ChatBubble>
          </View>
        ))}
        {children}
      </ScrollView>
      {unseen ? (
        <Button
          label="새 메시지 보기 ↓"
          variant="outline"
          onPress={() => {
            near.current = true;
            setUnseen(false);
            scroll.current?.scrollToEnd({ animated: true });
          }}
        />
      ) : null}
      <View
        style={{
          padding: 12,
          paddingBottom: 20,
          gap: 8,
          backgroundColor: "white",
          borderTopWidth: 1,
          borderTopColor: tokens.color.border,
        }}
      >
        {photos ? (
          <PrivatePhotos
            ids={ids}
            onChange={setIds}
            upload={(f) => callbacks.current.upload(f)}
            load={loadPhoto}
            disabled={busy}
            onBusy={setUploading}
          />
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <Button
            label={photos ? "−" : "＋"}
            variant="text"
            onPress={() => setPhotos(!photos)}
            disabled={busy}
          />
          <TextInput
            accessibilityLabel="메시지"
            placeholder="메시지를 입력하세요"
            value={text}
            onChangeText={setText}
            editable={!busy}
            multiline
            maxLength={1000}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 48,
              maxHeight: 112,
              padding: 12,
              borderRadius: 20,
              backgroundColor: tokens.color.surface,
              fontSize: 16,
              fontFamily: tokens.fontFamily,
            }}
          />
          <Button
            label="전송"
            onPress={submit}
            loading={busy}
            disabled={!ready || uploading || (!text.trim() && !ids.length)}
          />
        </View>
      </View>
    </View>
  );
}
