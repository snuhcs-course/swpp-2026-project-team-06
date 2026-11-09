import { MessageEditSheet } from "./MessageEditSheet";
import { MessageMenu, type MenuPoint } from "./MessageMenu";
import { mergeChatMessages } from "./chatOrder";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { ChatBubble } from "./ChatBubble";
import { T } from "./Text";
import { PrivatePhoto, PrivatePhotos } from "./PrivatePhotos";
import type { PickedPhoto } from "./pickPhoto";
import { tokens } from "./tokens";
import { daySeparator, time } from "./format";
import { inBackground } from "./foreground";
import { useKeyboardShown } from "./keyboard";
import { safe } from "./web";
import {
  anchorScrollTarget, chatRowGeometry, ChatCursorTrail, sanitizeChatView,
  survivingChatAnchor, visibleChatAnchors,
  type ChatViewSnapshot, type MessageAnchor,
} from "./chatViewState";

const PRIVATE_AREA = { dataSet: { phPrivate: "1" } } as object;

type Message = {
  editedAt?: string | null; editVersion?: number;
  replyTo?: {messageId: string; senderType: string; body: string; attachmentCount: number} | null;
  sequence?: number;
  messageId: string;
  senderType: string;
  body: string;
  createdAt: string;
  sourceSummary: string | null;
  attachmentIds?: string[];
  inquiryId?: string;
  orderId?: string;
  reported?: boolean;
  handoffStatus?: string | null;
  needsHuman?: boolean;
};
type Page = { items: Message[]; nextCursor: string | null };
type Props = {
  /** Metadata is accepted only after the caller freshly authorized this exact room. */
  viewState?: {
    farmId: string;
    threadId: string;
    snapshot: ChatViewSnapshot | null;
    onChange: (snapshot: ChatViewSnapshot) => void;
  };
  initialPage?: Page;
  sendScope?: string;
  composerEnabled?: boolean;
  onAccessDenied?: (error: unknown) => void;
  onBusyChange?: (busy: boolean) => void;
  edit?: (id: string, text: string, version: number, key: string) => Promise<Message>;
  replies?: boolean;
  producer?: boolean;
  active: boolean;
  load: (cursor?: string) => Promise<Page>;
  send: (text: string, ids: string[], key: string, replyToMessageId?: string) => Promise<unknown>;
  report?: (messageId: string, key: string) => Promise<unknown>;
  read: (id: string) => Promise<unknown>;
  makeKey: () => string;
  loadPhoto: (id: string) => Promise<string>;
  /** 웹은 File, 앱은 사진 보관함에서 고른 {uri, name, type}(DEV-33). 없으면 사진 첨부(＋)를 숨긴다(예: 소비자 farmclub 문의 대화방, DEV-150) */
  upload?: (file: File | PickedPhoto) => Promise<{ attachmentId: string }>;
  /** 입력칸 안내 문구. 기본은 '메시지를 입력하세요'(생산자 farmclub 방은 '운영팀에 문의 남기기', DEV-209) */
  placeholder?: string;
  /** 소비자 화면: 농가 답을 기다리는 마지막 질문 아래 상태 줄 문구(DEV-208). 없으면 그리지 않는다 */
  forwardStatus?: string;
  children?: ReactNode;
};
export function ChatThread({
  viewState,
  initialPage,
  sendScope = "",
  composerEnabled = true,
  onAccessDenied,
  onBusyChange,
  edit,
  replies = false,
  producer = false,
  active,
  load,
  send,
  report,
  read,
  makeKey,
  loadPhoto,
  upload,
  placeholder = "메시지를 입력하세요",
  forwardStatus,
  children,
}: Props) {
  const saved = useRef((() => {
    const snapshot = sanitizeChatView(viewState?.snapshot);
    return snapshot?.farmId === viewState?.farmId && snapshot?.threadId === viewState?.threadId
      ? snapshot : null;
  })());
  const identity = useRef(viewState ? `${viewState.farmId}\0${viewState.threadId}` : null);
  const currentIdentity = viewState ? `${viewState.farmId}\0${viewState.threadId}` : null;
  const viewStateRef = useRef(viewState);
  viewStateRef.current = viewState;
  const activeRef = useRef(active);
  activeRef.current = active;
  const restore = useRef<{
    phase: "none" | "locating" | "layout" | "restored" | "interrupted" | "failed";
    anchor: MessageAnchor | null;
    bottom: boolean;
  }>({ phase: viewState ? "locating" : "none", anchor: null, bottom: saved.current?.nearBottom ?? true });
  const [messages, setMessages] = useState<Message[]>(() => mergeChatMessages([], initialPage?.items ?? [])),
    [cursor, setCursor] = useState<string | null>(initialPage?.nextCursor ?? null),
    [ready, setReady] = useState(Boolean(initialPage)),
    [error, setError] = useState(""),
    [text, setText] = useState(""),
    [ids, setIds] = useState<string[]>([]),
    [photos, setPhotos] = useState(false),
    [uploading, setUploading] = useState(false),
    [busy, setBusy] = useState(false),
    [unseen, setUnseen] = useState(saved.current?.hasUnseenMessages ?? false),
    [older, setOlder] = useState(false),
    [retryCount, setRetryCount] = useState(0),
    [retrySend, setRetrySend] = useState(false);
  const scroll = useRef<ScrollView>(null),
    known = useRef(new Set<string>(initialPage?.items.map(m => m.messageId))),
    initialized = useRef(Boolean(initialPage)),
    firstPage = useRef(initialPage),
    terminal = useRef(false),
    context = useRef(sendScope),
    previousContext = useRef(sendScope),
    near = useRef(saved.current?.nearBottom ?? true),
    height = useRef(0),
    offset = useRef(0),
    preserve = useRef<{ height: number; offset: number } | null>(null),
    pending = useRef<{ body: string; key: string } | null>(null),
    lock = useRef(false),
    alive = useRef(true),
    lastRead = useRef("");
  const messageRef = useRef(messages), cursorRef = useRef(cursor),
    unseenRef = useRef(unseen), viewport = useRef(0),
    rowHeights = useRef(new Map<string, number>()), olderHeight = useRef<number | null>(null),
    anchorLock = useRef<MessageAnchor | null>(null),
    expectedScroll = useRef<number | null>(null),
    epoch = useRef(0), reading = useRef(""),
    captureRef = useRef<() => void>(() => {});
  const [editTarget, setEditTarget] = useState<Message | null>(null);
  const [menuMessage, setMenuMessage] = useState<Message | null>(null);
  const [menuPoint, setMenuPoint] = useState<MenuPoint | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  useEffect(() => { if (!active) { setMenuMessage(null); setEditTarget(null); } }, [active]);
  const [reporting, setReporting] = useState<string | null>(null);
  // 앱: 입력창 아래에 하단 내비 바(안전 영역)만큼 더 띄운다. 키보드가 뜨면 키보드가 내비 바를 덮으므로 뺀다.
  // 웹은 지금 여백(20) 그대로(DEV-205)
  const keyboardShown = useKeyboardShown(),
    composerBottom =
      Platform.OS === "web" || keyboardShown ? 20 : safe("bottom", 20);
  context.current = sendScope;
  const callbacks = useRef({ send, read, upload, report, onAccessDenied, onBusyChange });
  callbacks.current = { send, read, upload, report, onAccessDenied, onBusyChange };
  useEffect(() => {
    callbacks.current.onBusyChange?.(busy || uploading);
  }, [busy, uploading]);
  useEffect(() => {
    if (previousContext.current === sendScope) return;
    previousContext.current = sendScope;
    setReplyTo(null);
    setMenuMessage(null);
    setEditTarget(null);
    pending.current = null;
    lock.current = false;
    setBusy(false);
    setUploading(false);
    setIds([]);
    setPhotos(false);
    setRetrySend(false);
    setError(ids.length ? "문의할 주문이 바뀌었어요. 사진을 다시 첨부해 주세요." : "");
  }, [sendScope]);
  function sameRoom() {
    const v = viewStateRef.current;
    return identity.current === (v ? `${v.farmId}\0${v.threadId}` : null);
  }
  function current(run: number) {
    return alive.current && sameRoom() && epoch.current === run;
  }
  function updateUnseen(value: boolean) {
    unseenRef.current = value;
    setUnseen(value);
  }
  function updateCursor(value: string | null) {
    cursorRef.current = value;
    setCursor(value);
  }
  function commitMessages(items: Message[]) {
    messageRef.current = items;
    setMessages(items);
  }
  function geometry() {
    return chatRowGeometry(messageRef.current.map(m => m.messageId), rowHeights.current,
      olderHeight.current, cursorRef.current !== null);
  }
  function capture() {
    const v = viewStateRef.current;
    if (!alive.current || !v || !sameRoom() || terminal.current || !viewport.current || !height.current ||
      expectedScroll.current !== null ||
      ["locating", "layout", "failed"].includes(restore.current.phase)) return;
    const anchors = visibleChatAnchors(geometry(), offset.current, viewport.current);
    if (!near.current && !anchors.length) return;
    v.onChange({
      version: 1, farmId: v.farmId, threadId: v.threadId,
      anchor: anchors[0] ?? null, neighbors: anchors.slice(1),
      oldestLoadedMessageId: messageRef.current[0]?.messageId ?? null,
      newestLoadedMessageId: messageRef.current.at(-1)?.messageId ?? null,
      hasUnseenMessages: unseenRef.current,
      nearBottom: near.current, scrollOffset: Math.max(0, offset.current),
      viewportHeight: viewport.current, contentHeight: height.current, capturedAt: Date.now(),
    });
  }
  captureRef.current = capture;
  function handleError(e: unknown, restoring = false) {
    if (!alive.current || !sameRoom()) return;
    const denied = Boolean(e && typeof e === "object" && "status" in e &&
      [401, 403, 404].includes(Number(e.status)));
    // Background load failures must not replace an unresolved send's retry action/error.
    if (!pending.current || denied) {
      setError(e instanceof Error ? e.message : "대화를 불러오지 못했어요");
      setRetrySend(false);
    }
    if (restoring) restore.current.phase = "failed";
    if (denied) {
      terminal.current = true;
      restore.current.phase = "failed";
      anchorLock.current = null;
      expectedScroll.current = null;
      commitMessages([]);
      known.current.clear();
      rowHeights.current.clear();
      setReady(false);
      callbacks.current.onAccessDenied?.(e);
    }
  }
  async function markLatestRead() {
    const last = messageRef.current.at(-1), run = epoch.current;
    if (!last || !activeRef.current || inBackground() || terminal.current || !near.current ||
      !current(run) || ["locating", "layout", "failed"].includes(restore.current.phase) ||
      lastRead.current === last.messageId || reading.current === last.messageId) return;
    reading.current = last.messageId;
    try {
      await callbacks.current.read(last.messageId);
      if (current(run)) lastRead.current = last.messageId;
    } catch (e) {
      if (current(run)) handleError(e);
    } finally {
      if (reading.current === last.messageId) reading.current = "";
    }
  }
  function completeRestore() {
    if (restore.current.phase !== "layout") return;
    restore.current.phase = "restored";
    if (restore.current.bottom) {
      anchorLock.current = null;
      near.current = true;
      updateUnseen(false);
    }
    capture();
    void markLatestRead();
  }
  function positionAnchor() {
    if (!alive.current || !viewStateRef.current || !sameRoom() || !activeRef.current || terminal.current ||
      !viewport.current || !height.current ||
      ["locating", "failed"].includes(restore.current.phase)) return;
    const restoring = restore.current.phase === "layout";
    let target: number;
    if ((restoring && restore.current.bottom) || (!restoring && near.current && !anchorLock.current)) {
      target = Math.max(0, height.current - viewport.current);
    } else {
      const anchor = restoring ? restore.current.anchor : anchorLock.current;
      if (!restoring && !anchor) { capture(); return; }
      if (anchor) {
        const rows = geometry(), row = rows.find(r => r.messageId === anchor.messageId);
        // Wait for actual row and content layouts; an old content height must not clamp a new prefix.
        const last = rows.at(-1);
        if (!row || rows.length !== messageRef.current.length || !last ||
          height.current + 2 < last.top + last.height + 20) return;
        target = anchorScrollTarget(row.top, anchor.relativeOffset, height.current, viewport.current);
      } else {
        // All saved visible IDs were deleted: retain the old offset within this freshly authorized window.
        if (geometry().length !== messageRef.current.length) return;
        target = anchorScrollTarget(saved.current?.scrollOffset ?? 0, 0, height.current, viewport.current);
      }
    }
    if (Math.abs(offset.current - target) <= 1) {
      expectedScroll.current = null;
      if (restoring) completeRestore();
      else capture();
    } else {
      expectedScroll.current = target;
      scroll.current?.scrollTo({ y: target, animated: false });
    }
  }
  function interruptRestore() {
    if (!viewStateRef.current) return;
    if (["locating", "layout", "failed"].includes(restore.current.phase))
      restore.current.phase = "interrupted";
    anchorLock.current = null;
    expectedScroll.current = null;
    capture();
  }
  function latest(animated = true) {
    interruptRestore();
    near.current = true;
    updateUnseen(false);
    scroll.current?.scrollToEnd({ animated });
    void markLatestRead();
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      captureRef.current();
      alive.current = false;
      epoch.current++;
    };
  }, []);
  function merge(items: Message[], older = false) {
    const isNew = items.some(m => !known.current.has(m.messageId));
    items.forEach(m => known.current.add(m.messageId));
    commitMessages(mergeChatMessages(messageRef.current, items, older));
    if (isNew && !older && !near.current &&
      !["locating", "layout", "failed"].includes(restore.current.phase)) updateUnseen(true);
  }
  useEffect(() => {
    if (!active || !sameRoom()) { captureRef.current(); setOlder(false); return; }
    const run = ++epoch.current;
    let canceled = false, running = false;
    const valid = () => !canceled && current(run);
    async function refresh() {
      if (running || inBackground() || terminal.current || !valid()) return;
      running = true;
      const locating = viewStateRef.current && ["locating", "failed"].includes(restore.current.phase);
      if (locating) restore.current.phase = "locating";
      try {
        const p = firstPage.current ?? await load();
        if (!valid()) return;
        firstPage.current = undefined;
        const incoming = [...p.items];
        let next = p.nextCursor;
        const trail = new ChatCursorTrail(incoming.map(m => m.messageId));
        if (locating) {
          merge(p.items);
          updateCursor(next);
          const windowIds = new Set(p.items.map(m => m.messageId));
          const s = saved.current;
          const found = () => !s || (
            (!s.anchor || windowIds.has(s.anchor.messageId)) &&
            (!s.oldestLoadedMessageId || windowIds.has(s.oldestLoadedMessageId))
          );
          while (!found() && next && valid() && restore.current.phase === "locating") {
            const requested = next, q = await load(requested);
            if (!valid() || restore.current.phase !== "locating") return;
            trail.accept(requested, q.items.map(m => m.messageId), q.nextCursor);
            q.items.forEach(m => windowIds.add(m.messageId));
            incoming.unshift(...q.items);
            merge(q.items, true);
            next = q.nextCursor;
            updateCursor(next);
          }
          if (!valid()) return;
          if (restore.current.phase === "locating") {
            // Only the freshly fetched window is authoritative (including legitimate deletions).
            const fresh = mergeChatMessages([], incoming);
            known.current = new Set(fresh.map(m => m.messageId));
            commitMessages(fresh);
            // Entirely deleted history has no anchor: save an empty latest-edge view.
            if (!fresh.length) restore.current.bottom = true;
            const anchor = s ? survivingChatAnchor(s, known.current) : null;
            restore.current.anchor = anchor;
            anchorLock.current = anchor;
            restore.current.phase = "layout";
            if (s && !s.nearBottom) updateUnseen(Boolean(s.hasUnseenMessages ||
              (s.newestLoadedMessageId && p.items.at(-1)?.messageId !== s.newestLoadedMessageId)));
          }
          initialized.current = true;
        } else {
          while (known.current.size && next &&
            !incoming.some(m => known.current.has(m.messageId)) && valid()) {
            const requested = next, q = await load(requested);
            if (!valid()) return;
            trail.accept(requested, q.items.map(m => m.messageId), q.nextCursor);
            incoming.unshift(...q.items);
            next = q.nextCursor;
          }
          if (!valid()) return;
          merge(incoming);
          if (!initialized.current) {
            updateCursor(p.nextCursor);
            initialized.current = true;
          }
        }
        setReady(true);
        // A successful poll does not resolve a failed mutation or its idempotent retry.
        if (!pending.current) {
          setError("");
          setRetrySend(false);
        }
        positionAnchor();
        capture();
        await markLatestRead();
      } catch (e) {
        if (valid()) handleError(e, Boolean(locating) && restore.current.phase !== "interrupted");
      } finally { running = false; }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => {
      captureRef.current();
      canceled = true;
      epoch.current++;
      clearInterval(timer);
    };
  }, [active, load, retryCount, currentIdentity]);
  async function submit() {
    if (!sameRoom() || !ready || !composerEnabled || lock.current || uploading || (!text.trim() && !ids.length)) return;
    const submittedScope = context.current, run = epoch.current;
    lock.current = true;
    setBusy(true);
    const body = JSON.stringify({ scope: submittedScope, text: text.trim(), ids, replyTo: replyTo?.messageId });
    if (pending.current?.body !== body)
      pending.current = { body, key: makeKey() };
    let committed = false;
    try {
      await callbacks.current.send(text.trim(), ids, pending.current.key, replyTo?.messageId);
      if (!current(run) || submittedScope !== context.current) return;
      committed = true;
      setRetrySend(false);
      setReplyTo(null);
      setText("");
      setIds([]);
      setPhotos(false);
      pending.current = null;
      latest(false);
      const p = await load();
      if (current(run) && submittedScope === context.current) {
        merge(p.items);
        setError("");
      }
    } catch (e) {
      if (current(run) && submittedScope === context.current) {
        setRetrySend(!committed);
        setError(
          e instanceof Error
            ? e.message
            : "전송하지 못했어요. 다시 보내 주세요",
        );
      }
    } finally {
      if (submittedScope === context.current) {
        lock.current = false;
        if (alive.current) setBusy(false);
      }
    }
  }
  async function previous() {
    const requested = cursorRef.current, run = epoch.current;
    if (!requested || older || !sameRoom() ||
      ["locating", "layout", "failed"].includes(restore.current.phase)) return;
    const anchor = visibleChatAnchors(geometry(), offset.current, viewport.current)[0];
    setOlder(true);
    try {
      const p = await load(requested);
      if (!current(run)) return;
      new ChatCursorTrail([...known.current]).accept(requested, p.items.map(m => m.messageId), p.nextCursor);
      if (viewStateRef.current && anchor) {
        near.current = false;
        anchorLock.current = anchor;
      } else preserve.current = { height: height.current, offset: offset.current };
      merge(p.items, true);
      updateCursor(p.nextCursor);
      positionAnchor();
    } catch (e) {
      if (current(run)) handleError(e);
    } finally {
      if (current(run)) setOlder(false);
    }
  }
  // 마지막 농가 답 이후 needsHuman인 내 질문 중 마지막 것 하나에만 상태 줄을 붙인다(DEV-208)
  const waiting = producer || !forwardStatus ? -1 : waitingIndex(messages);
  // 날짜 구분은 한국 날짜로 묶는다(UTC 날짜로 묶으면 오전 9시 전 메시지가 전날로 간다, DEV-223)
  const days = messages.map((m, i) =>
    daySeparator(m.createdAt, messages[i - 1]?.createdAt),
  );
  return (
    // 메시지 본문·보낸 사람은 세션 녹화에서 가린다(N-05, DEV-71). react-native-web이 data-ph-private로 내보낸다
    <View
      {...PRIVATE_AREA}
      style={{ flex: 1, minHeight: 0, backgroundColor: "#FAF9F6" }}
    >
      {error ? (
        <View
          accessibilityRole="alert"
          style={{ padding: 12, backgroundColor: "#FFF0EB" }}
        >
          <T variant="sub" color={tokens.color.error}>
            {error}
          </T>
          <Button label={retrySend ? "다시 보내기" : "다시 시도"} variant="text"
            disabled={busy || uploading} onPress={() => {
            if (retrySend) { void submit(); return; }
            terminal.current = false;
            setRetryCount(n => n + 1);
          }} />
        </View>
      ) : null}
      <ScrollView
        ref={scroll}
        testID="chat-timeline"
        style={[{ flex: 1 }, Platform.OS === "web" && viewState ? { overflowAnchor: "none" } as object : null]}
        contentContainerStyle={{ padding: 20, gap: 20 }}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onLayout={e => {
          viewport.current = e.nativeEvent.layout.height;
          positionAnchor();
          capture();
        }}
        onScrollBeginDrag={interruptRestore}
        onTouchMove={interruptRestore}
        {...(Platform.OS === "web" ? {
          onWheel: interruptRestore,
          onKeyDown: (event: { key: string }) => {
            if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key))
              interruptRestore();
          },
        } as object : {})}
        onScroll={e => {
          const n = e.nativeEvent;
          const previousOffset = offset.current;
          offset.current = Math.max(0, n.contentOffset.y);
          viewport.current = n.layoutMeasurement.height;
          height.current = n.contentSize.height;
          if (viewStateRef.current && restore.current.phase === "layout") {
            positionAnchor();
            return;
          }
          if (viewStateRef.current && expectedScroll.current !== null) {
            if (Math.abs(offset.current - expectedScroll.current) <= 2) {
              expectedScroll.current = null;
              capture();
            }
            return;
          }
          // RN-web sends a second scroll-end tick for the same programmatic offset.
          // It is not a new gesture and must not unlock delayed-layout correction.
          if (anchorLock.current && Math.abs(previousOffset - offset.current) <= 2) {
            positionAnchor();
            return;
          }
          // Wheel/drag handlers interrupt before scrolling. This also handles a scrollbar/keyboard scroll.
          anchorLock.current = null;
          near.current = n.contentSize.height - n.layoutMeasurement.height - n.contentOffset.y < 80;
          if (near.current) updateUnseen(false);
          capture();
          if (near.current) void markLatestRead();
        }}
        onContentSizeChange={(_, h) => {
          const previousHeight = height.current;
          height.current = h;
          if (viewStateRef.current &&
            (restore.current.phase === "layout" || anchorLock.current)) positionAnchor();
          else if (viewStateRef.current && ["locating", "failed"].includes(restore.current.phase)) return;
          else if (preserve.current) {
            scroll.current?.scrollTo({
              y: preserve.current.offset + h - preserve.current.height,
              animated: false,
            });
            preserve.current = null;
          } else if (near.current) scroll.current?.scrollToEnd({ animated: false });
          else if (!viewStateRef.current && h > previousHeight) updateUnseen(true);
          capture();
        }}
      >
        {cursor ? (
          <View onLayout={e => {
            olderHeight.current = e.nativeEvent.layout.height;
            positionAnchor();
          }}>
            <Button label="이전 대화 보기" variant="text" loading={older} onPress={previous} />
          </View>
        ) : null}
        {!ready ? (
          <T muted>{error ? "대화를 불러오지 못했어요." : "대화 불러오는 중…"}</T>
        ) : messages.length === 0 ? (
          <T muted>첫 이야기를 남겨 보세요.</T>
        ) : null}
        {messages.map((m, i) => (
          <View key={m.messageId} testID={`chat-message-${m.messageId}`} style={{ gap: 14 }}
            onLayout={e => {
              rowHeights.current.set(m.messageId, e.nativeEvent.layout.height);
              positionAnchor();
              capture();
            }}>
            {days[i] ? (
              <T variant="caption" muted center>
                {days[i]}
              </T>
            ) : null}
            <Pressable accessible={false} disabled={!replies || busy} delayLongPress={500}
              onLongPress={() => { setMenuPoint(null); setMenuMessage(m); }}
              {...(Platform.OS === "web" && replies ? {
                onContextMenu: (e: {preventDefault: () => void; clientX: number; clientY: number}) => {
                  e.preventDefault(); if (busy) return;
                  setMenuPoint({x: e.clientX, y: e.clientY}); setMenuMessage(m);
                },
                tabIndex: 0,
                onKeyDown: (e: {key: string; shiftKey: boolean; preventDefault: () => void}) => {
                  if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); setMenuPoint(null); setMenuMessage(m); }
                },
              } as object : {})}>
            <ChatBubble
              kind={
                m.senderType === (producer ? "PRODUCER" : "CONSUMER")
                  ? "me"
                  : m.senderType === "AI"
                    ? "ai"
                    : "farm"
              }
              quote={m.replyTo ?? undefined}
              edited={!!m.editedAt}
              text={m.body}
              sender={
                m.senderType === (producer ? "PRODUCER" : "CONSUMER")
                  ? undefined
                  : m.senderType === "PRODUCER"
                    ? "농가"
                    : m.senderType === "CONSUMER"
                      ? "소비자"
                      : m.senderType === "OPERATOR"
                        ? "farmclub"
                        : undefined
              }
              time={time(m.createdAt)}
              basis={m.handoffStatus === "FORWARDED" ? undefined : m.sourceSummary ?? undefined}
              status={i === waiting ? forwardStatus : undefined}
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
              {!producer &&
              m.senderType === "AI" &&
              m.handoffStatus !== "FORWARDED" &&
              report ? (
                <Button
                  label={m.reported ? "확인 요청됨" : "답변 확인 요청"}
                  variant="outline"
                  disabled={Boolean(m.reported) || reporting === m.messageId}
                  loading={reporting === m.messageId}
                  onPress={async () => {
                    const run = epoch.current;
                    setReporting(m.messageId);
                    try {
                      await callbacks.current.report?.(m.messageId, makeKey());
                      if (!current(run)) return;
                      commitMessages(messageRef.current.map(item => item.messageId === m.messageId
                        ? { ...item, reported: true } : item));
                      const p = await load();
                      if (!current(run)) return;
                      merge(p.items);
                      setError("");
                    } catch (e) {
                      if (current(run)) handleError(e);
                    } finally {
                      if (current(run)) setReporting(null);
                    }
                  }}
                />
              ) : m.reported ? (
                <T variant="caption" muted>
                  소비자가 신고한 답변
                </T>
              ) : null}
            </ChatBubble>
            </Pressable>
          </View>
        ))}
        {children}
      </ScrollView>
      <MessageMenu visible={!!menuMessage && !busy} point={menuPoint} onClose={() => setMenuMessage(null)}
        actions={[{ label: "답장", onPress: () => { if (menuMessage) setReplyTo(menuMessage); } },
          ...(edit && menuMessage?.senderType === (producer ? "PRODUCER" : "CONSUMER") ? [{label: "수정", onPress: () => setEditTarget(menuMessage)}] : [])]} />
      {editTarget && edit ? <MessageEditSheet key={editTarget.messageId} body={editTarget.body} limit={1000} makeKey={makeKey}
        onClose={() => setEditTarget(null)} onSave={async (text, key) => {
          const run = epoch.current;
          const saved = await edit(editTarget.messageId, text, editTarget.editVersion ?? 0, key);
          if (!current(run)) return;
          commitMessages(mergeChatMessages(messageRef.current, [saved]));
          setEditTarget(null);
        }} /> : null}
      {unseen ? (
        <Button
          label="새 메시지 보기 ↓"
          variant="outline"
          onPress={() => {
            latest();
          }}
        />
      ) : null}
      <View
        style={{
          padding: 12,
          paddingBottom: composerBottom,
          gap: 8,
          backgroundColor: "white",
          borderTopWidth: 1,
          borderTopColor: tokens.color.border,
        }}
      >
        {replyTo ? <View style={{ paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: tokens.color.accent, flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1, minWidth: 0 }}><T variant="caption" muted>선택한 메시지에 답장</T><T numberOfLines={2}>{replyTo.body || "사진"}</T></View>
          <Pressable accessibilityRole="button" accessibilityLabel="답장 취소" disabled={busy} onPress={() => setReplyTo(null)}
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name="close" size={18} /></Pressable>
        </View> : null}
        {photos && upload ? (
          <PrivatePhotos
            key={sendScope}
            ids={ids}
            onChange={(next) => { if (alive.current && context.current === sendScope) setIds(next); }}
            upload={(f) => {
              if (context.current !== sendScope) return Promise.reject(new Error("대화가 바뀌었어요."));
              return callbacks.current.upload!(f);
            }}
            load={loadPhoto}
            disabled={busy || !ready || !composerEnabled}
            onBusy={(next) => { if (alive.current && context.current === sendScope) setUploading(next); }}
          />
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          {upload ? (
            <Button
              label={photos ? "−" : "＋"}
              variant="text"
              onPress={() => setPhotos(!photos)}
              disabled={busy || !ready || !composerEnabled}
            />
          ) : null}
          <TextInput
            accessibilityLabel="메시지"
            placeholder={placeholder}
            value={text}
            onChangeText={setText}
            editable={!busy && composerEnabled}
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
            disabled={!ready || !composerEnabled || uploading || (!text.trim() && !ids.length)}
          />
        </View>
      </View>
    </View>
  );
}

/** 농가 답을 기다리는 마지막 needsHuman 소비자 메시지의 위치. 그 뒤(같은 시각 포함)에 농가 답이 있으면 -1 */
export function waitingIndex(
  messages: Pick<Message, "senderType" | "needsHuman" | "createdAt">[],
) {
  let found = -1;
  messages.forEach((m, i) => {
    if (m.senderType === "CONSUMER" && m.needsHuman) found = i;
  });
  if (found < 0) return -1;
  // The timeline is ordered by persisted sequence, including equal timestamps.
  return messages.slice(found + 1).some(m => m.senderType === "PRODUCER") ? -1 : found;
}
