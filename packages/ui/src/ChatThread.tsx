import { MessageEditSheet } from "./MessageEditSheet";
import { MessageMenu, type MenuPoint } from "./MessageMenu";
import { mergeChatMessages } from "./chatOrder";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { BUBBLE_AVATAR, ChatBubble, DayPill, SystemLine } from "./ChatBubble";
import { T } from "./Text";
import { PrivatePhoto, PrivatePhotos } from "./PrivatePhotos";
import type { PickedPhoto } from "./pickPhoto";
import { tokens } from "./tokens";
import { chatDay, daySeparator, seoulDay, time } from "./format";
import { chatGroups, lastReadMine } from "./chatGroups";
import { ProfileAvatar } from "./Messenger";
import { AiCheckCard, AiCheckChip } from "./AiCheckCard";
import { aiCheckFollowUp, aiCheckLabel, aiCheckState, correctionQuoteLabel, type AiCheckState } from "./aiCheck";
import { Composer, copyToClipboard, FloatingPill } from "./composer";
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
  /** AI 답변 확인 요청 깃발(DEV-296) */
  checkState?: AiCheckState | null;
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
  /** 생산자: 확인 요청된 AI 답변에 '답이 맞아요'(DEV-296). 주면 깃발 답변 아래 확인 카드를 그린다 */
  confirmCheck?: (messageId: string, key: string) => Promise<unknown>;
  read: (id: string) => Promise<unknown>;
  makeKey: () => string;
  loadPhoto: (id: string) => Promise<string>;
  /** 웹은 File, 앱은 사진 보관함에서 고른 {uri, name, type}(DEV-33). 없으면 사진 첨부(＋)를 숨긴다(예: 소비자 farmclub 문의 대화방, DEV-150) */
  upload?: (file: File | PickedPhoto) => Promise<{ attachmentId: string }>;
  /** 입력칸 안내 문구. 기본은 '메시지 입력'(Figma 1:38)(생산자 farmclub 방은 '운영팀에 문의 남기기', DEV-209) */
  placeholder?: string;
  /** 소비자 화면: 농가 답을 기다리는 마지막 질문 아래 상태 줄 문구(DEV-208). 없으면 그리지 않는다 */
  forwardStatus?: string;
  /** 상대(소비자 화면은 농가, 생산자 화면은 소비자·farmclub). 주면 상대 말풍선에 아바타와 실제 이름을 붙인다(DEV-295) */
  peer?: { name: string; photo?: string | null; avatar?: ReactNode };
  /** 대화 맨 위 가운데 시스템 문구 한 줄(예: 'AI 안내가 꺼져 있어요 · 농가가 직접 답해요', DEV-295) */
  systemLine?: string;
  /** 상대가 마지막으로 읽은 메시지(thread.producerLastReadMessageId 등). 내 마지막 읽힌 말풍선 옆에 '읽음' */
  peerReadMessageId?: string | null;
  /** 길게 누르기 메뉴의 '복사'. 앱은 expo-clipboard 도우미를 넘긴다. 없으면 웹 클립보드만 */
  copy?: (text: string) => Promise<unknown>;
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
  confirmCheck,
  read,
  makeKey,
  loadPhoto,
  upload,
  placeholder = "메시지 입력",
  forwardStatus,
  peer,
  systemLine,
  peerReadMessageId,
  copy,
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
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
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
    // 행마다 위 간격을 자기 높이에 담는다(묶음 4 · 묶음 사이 16, DEV-295)
    return chatRowGeometry(messageRef.current.map(m => m.messageId), rowHeights.current,
      olderHeight.current, cursorRef.current !== null, 0);
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
  const mineType = producer ? "PRODUCER" : "CONSUMER";
  // 날짜 구분은 한국 날짜로 묶는다(UTC 날짜로 묶으면 오전 9시 전 메시지가 전날로 간다, DEV-223). 글자는 '10월 7일 화요일' 알약(DEV-295)
  const days = messages.map((m, i) =>
    daySeparator(m.createdAt, messages[i - 1]?.createdAt) ? chatDay(m.createdAt) : null,
  );
  const showReport = (m: Message) =>
    !producer && m.senderType === "AI" && m.handoffStatus !== "FORWARDED" && !!report;
  // 같은 사람·같은 날·같은 분이면 한 묶음(DEV-295). 상태 줄·보조 줄·확인 요청이 붙은 말풍선은 따로 둔다
  const groups = chatGroups(messages.map((m, i) => ({
    sender: m.senderType,
    day: seoulDay(m.createdAt),
    minute: time(m.createdAt),
    solo: i === waiting || !!m.inquiryId || !!m.orderId || showReport(m) || !!aiCheckState(m),
  })));
  // 상대가 읽은 위치까지의 내 마지막 말풍선에만 '읽음'(서버의 상대 읽음 위치, DEV-295)
  const readMine = lastReadMine(messages, peerReadMessageId, mineType);
  const peerAvatar = peer ? peer.avatar ?? <ProfileAvatar uri={peer.photo} name={peer.name} size={BUBBLE_AVATAR} /> : undefined;
  // 답장 없는 방(문의 대화방)도 글이 있으면 복사 메뉴는 연다(DEV-295)
  const hasMenu = (m: Message) => replies || !!m.body;
  const menuFor = (m: Message) => { if (!hasMenu(m)) return; setMenuPoint(null); setMenuMessage(m); };
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
      <View style={{ flex: 1, minHeight: 0 }}>
      <ScrollView
        ref={scroll}
        testID="chat-timeline"
        style={[{ flex: 1 }, Platform.OS === "web" && viewState ? { overflowAnchor: "none" } as object : null]}
        contentContainerStyle={{ paddingVertical: 20, paddingHorizontal: tokens.space.gutter }}
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
            {/* 앞 대화가 남아 있어도 시스템 문구는 맨 위에 둔다. 이 칸 높이로 재므로 행 위치 계산이 그대로 맞는다 */}
            {systemLine ? <SystemLine text={systemLine} testID="chat-system-line" /> : null}
            <Button label="이전 대화 보기" variant="text" loading={older} onPress={previous} />
          </View>
        ) : null}
        {systemLine && (!cursor && messages.length === 0) ? <SystemLine text={systemLine} testID="chat-system-line" /> : null}
        {!ready ? (
          <T muted>{error ? "대화를 불러오지 못했어요." : "대화 불러오는 중…"}</T>
        ) : messages.length === 0 ? (
          <T muted center style={{ marginTop: 16 }}>첫 이야기를 남겨 보세요.</T>
        ) : null}
        {messages.map((m, i) => {
          const mine = m.senderType === mineType;
          const kind = mine ? "me" : m.senderType === "AI" ? "ai" : "farm";
          const { first, last } = groups[i];
          // 시스템 줄은 첫 행 안에 둬서 행 위치 계산(보기 상태 복원)이 그대로 맞는다
          const top = i === 0 && !cursor && systemLine;
          // 확인 요청 깃발(DEV-296). 소비자: 요청함·확인함은 말풍선 아래, 바로잡음은 라벨 옆. 생산자: 라벨 옆 칩 + 확인 카드
          const check = m.senderType === "AI" ? aiCheckState(m) : null;
          const checkLabel = aiCheckLabel(check, producer);
          const checkChip = checkLabel ? <AiCheckChip label={checkLabel} testID={`ai-check-${m.messageId}`} /> : null;
          const chipBeside = producer || check === "CORRECTED";
          return (
          <View key={m.messageId} testID={`chat-message-${m.messageId}`}
            style={{ paddingTop: i === 0 ? 0 : days[i] || first ? 16 : 4, gap: 8 }}
            onLayout={e => {
              rowHeights.current.set(m.messageId, e.nativeEvent.layout.height);
              positionAnchor();
              capture();
            }}>
            {top ? <SystemLine text={systemLine} testID="chat-system-line" /> : null}
            {days[i] ? <DayPill label={days[i]!} /> : null}
            {/* 길게 누르기(앱 500ms)·우클릭(웹)·ContextMenu 키로 메뉴. 답장 없는 방도 복사는 열린다(DEV-295) */}
            <Pressable accessible={false} disabled={busy} delayLongPress={500}
              onLongPress={() => menuFor(m)}
              {...(Platform.OS === "web" ? {
                onContextMenu: (e: {preventDefault: () => void; clientX: number; clientY: number}) => {
                  if (!hasMenu(m)) return;
                  e.preventDefault(); if (busy) return;
                  setMenuPoint({x: e.clientX, y: e.clientY}); setMenuMessage(m);
                },
                tabIndex: hasMenu(m) ? 0 : -1,
                onKeyDown: (e: {key: string; shiftKey: boolean; preventDefault: () => void}) => {
                  if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); menuFor(m); }
                },
              } as object : {})}>
            <ChatBubble
              kind={kind}
              first={first || !!days[i]}
              last={last}
              quote={m.replyTo ?? undefined}
              quoteLabel={m.replyTo ? correctionQuoteLabel(m.replyTo, messages, i) ??
                `${m.replyTo.senderType === mineType ? "나" : senderName(m.replyTo.senderType, peer?.name)}에게 답장` : undefined}
              check={check === "REQUESTED" ? "flagged" : check === "CORRECTED" ? "struck" : undefined}
              labelSide={chipBeside ? checkChip ?? undefined : undefined}
              edited={!!m.editedAt}
              text={m.body}
              avatar={kind === "farm" ? peerAvatar : undefined}
              sender={mine ? undefined : senderName(m.senderType, peer?.name)}
              time={time(m.createdAt)}
              side={mine && i === readMine ? (
                <T variant="caption" color={tokens.color.accent}>읽음</T>
              ) : undefined}
              basis={m.handoffStatus === "FORWARDED" ? undefined : m.sourceSummary ?? undefined}
              status={i === waiting ? forwardStatus : undefined}
              note={
                m.inquiryId
                  ? "주문 문제 문의 · 직접 응대"
                  : m.orderId
                    ? "주문에 연결된 대화"
                    : undefined
              }
              footer={checkChip && !chipBeside ? (
                // 소비자: 요청함은 빨간 깃발 + '농가가 확인하면 알려 드려요', 확인함은 초록 칩(Figma 10:116)
                <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, minHeight: 32 }}>
                  {checkChip}
                  {checkLabel?.note ? <T variant="caption" muted>{checkLabel.note}</T> : null}
                </View>
              ) : showReport(m) && !check && !m.reported ? (
                // 말풍선 아래 글자 버튼(DEV-295). 누르면 위 깃발로 바뀐다(DEV-296)
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="답변 확인 요청"
                  accessibilityState={{ disabled: reporting === m.messageId }}
                  disabled={reporting === m.messageId}
                  hitSlop={8}
                  onPress={async () => {
                    const run = epoch.current;
                    setReporting(m.messageId);
                    try {
                      await callbacks.current.report?.(m.messageId, makeKey());
                      if (!current(run)) return;
                      commitMessages(messageRef.current.map(item => item.messageId === m.messageId
                        ? { ...item, reported: true, checkState: item.checkState ?? "REQUESTED" } : item));
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
                  style={{ minHeight: 32, flexDirection: "row", alignItems: "center", gap: 2 }}
                >
                  {reporting === m.messageId ? <ActivityIndicator size="small" color={tokens.color.accent} /> : null}
                  <T variant="caption" weight="semibold" color={tokens.color.accent}>
                    답변 확인 요청
                  </T>
                  <Icon name="chevron" size={14} strokeWidth={2.5} color={tokens.color.accent} />
                </Pressable>
              ) : undefined}
            >
              {m.attachmentIds?.map((id) => (
                <PrivatePhoto key={id} id={id} load={loadPhoto} onLongPress={busy ? undefined : () => menuFor(m)} />
              ))}
            </ChatBubble>
            </Pressable>
            {/* 카드는 서버가 checkState를 줄 때만(옛 서버는 confirm 엔드포인트가 없다) */}
            {producer && m.checkState === "REQUESTED" && confirmCheck ? (
              <AiCheckCard
                name={peer?.name}
                followUp={aiCheckFollowUp(messages, i)}
                disabled={busy}
                onCorrect={() => setReplyTo(m)}
                onConfirm={async () => {
                  const run = epoch.current;
                  try {
                    await confirmCheck(m.messageId, makeKey());
                    if (!current(run)) return;
                    commitMessages(messageRef.current.map(item => item.messageId === m.messageId
                      ? { ...item, checkState: "CONFIRMED" } : item));
                    if (replyTo?.messageId === m.messageId) setReplyTo(null);
                    setError("");
                    // 확인은 저장됐다. 새로고침 실패는 2초 폴링이 다시 맞추므로 오류로 띄우지 않는다
                    void load().then(p => { if (current(run)) merge(p.items); }, () => undefined);
                  } catch (e) {
                    if (!current(run)) return;
                    // 409: 다른 기기에서 이미 바로잡았다. 오류 대신 최신 상태로 바꾼다
                    if (e && typeof e === "object" && "details" in e &&
                      (e.details as { reason?: string } | undefined)?.reason === "ALREADY_CORRECTED") {
                      try { const p = await load(); if (current(run)) merge(p.items); return; }
                      catch (again) { if (current(run)) handleError(again); return; }
                    }
                    handleError(e);
                  }
                }}
              />
            ) : null}
          </View>
          );
        })}
        {children ? <View style={{ marginTop: 20 }}>{children}</View> : null}
      </ScrollView>
      {unseen ? <FloatingPill label="새 메시지 보기 ↓" onPress={() => latest()} /> : null}
      </View>
      <MessageMenu visible={!!menuMessage && !busy} point={menuPoint} onClose={() => setMenuMessage(null)}
        actions={[
          ...(replies ? [{ label: "답장", onPress: () => { if (menuMessage) setReplyTo(menuMessage); } }] : []),
          ...(menuMessage?.body ? [{ label: "복사", onPress: () => {
            const body = menuMessage.body;
            void copyToClipboard(body, copy).then(ok => { if (ok && alive.current) setCopied(true); });
          } }] : []),
          ...(edit && menuMessage?.senderType === mineType ? [{label: "수정", onPress: () => setEditTarget(menuMessage)}] : [])]} />
      {editTarget && edit ? <MessageEditSheet key={editTarget.messageId} body={editTarget.body} limit={1000} makeKey={makeKey}
        onClose={() => setEditTarget(null)} onSave={async (text, key) => {
          const run = epoch.current;
          const saved = await edit(editTarget.messageId, text, editTarget.editVersion ?? 0, key);
          if (!current(run)) return;
          commitMessages(mergeChatMessages(messageRef.current, [saved]));
          setEditTarget(null);
        }} /> : null}
      <View
        style={{
          paddingTop: tokens.space.sm,
          paddingHorizontal: tokens.space.md,
          paddingBottom: composerBottom,
          backgroundColor: tokens.color.background,
          borderTopWidth: 1,
          borderTopColor: tokens.color.border,
        }}
      >
        <Composer
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          accessibilityLabel="메시지"
          editable={!busy && composerEnabled}
          maxLength={1000}
          onSend={() => void submit()}
          canSend={ready && composerEnabled && !uploading && (!!text.trim() || ids.length > 0)}
          busy={busy}
          tool={upload ? {
            icon: photos ? "close" : "plus",
            label: photos ? "사진 첨부 닫기" : "사진 첨부",
            expanded: photos,
            onPress: () => setPhotos(!photos),
            disabled: busy || !ready || !composerEnabled,
          } : undefined}
          above={<>
            {copied ? <T variant="caption" muted center accessibilityRole="text">메시지를 복사했어요</T> : null}
            {replyTo ? <View style={{ paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: tokens.color.accent, flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1, minWidth: 0 }}><T variant="caption" muted>{producer && replyTo.senderType === "AI" && aiCheckState(messages.find(x => x.messageId === replyTo.messageId) ?? replyTo) === "REQUESTED" ? "AI 안내를 바로잡아요" : "선택한 메시지에 답장"}</T><T numberOfLines={2}>{replyTo.body || "사진"}</T></View>
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
          </>}
        />
      </View>
    </View>
  );
}

/** 상대 말풍선 위 이름: 실제 이름이 있으면 그것, 없으면 역할 이름(DEV-295) */
function senderName(type: string, peerName?: string) {
  if (type === "AI") return "AI 안내";
  if (type === "OPERATOR") return "farmclub";
  return peerName ?? (type === "PRODUCER" ? "농가" : "소비자");
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
