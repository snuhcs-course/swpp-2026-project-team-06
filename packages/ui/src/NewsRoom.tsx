import type { EmoticonId } from "@farmclub/api";
import { EmoticonImage, EmoticonMessage } from "./Emoticon";
import { useComposerTools } from "./ComposerTools";
import { MessageEditSheet } from "./MessageEditSheet";
import {
  createElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { MessageMenu, type MenuPoint } from "./MessageMenu";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { T } from "./Text";
import { Photo } from "./content";
import { BUBBLE_AVATAR, ChatBubble, DayPill, SystemLine } from "./ChatBubble";
import { Sheet } from "./bars";
import { tokens } from "./tokens";
import { safe } from "./web";
import { inBackground } from "./foreground";
import { chatDay, seoulDay, time, won } from "./format";
import { chatGroups } from "./chatGroups";
import { ProfileAvatar } from "./Messenger";
import { Composer, copyToClipboard, FloatingPill } from "./composer";
import { AttachedPhotoRow, PrivatePhoto, ViewablePhoto, usePhotoAttach } from "./PrivatePhotos";
import type { PickedPhoto } from "./pickPhoto";
import { Price, type ShelfProduct } from "./Storefront";
import { FanReplySheet, type FanReplyPageData, type FanReplyRow } from "./FanReplySheet";
import { broadcastStats } from "./fanReplies";
import { NEWS_CARD_GAP, NEWS_PHOTO_GAP, newsCardWidth, newsPhotoRows } from "./newsCard";

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
  emoticonId?: EmoticonId | null;
  photos: string[];
  videos: string[];
  createdAt: string;
  broadcastId: string | null;
  reactionCount: number;
  myReaction: boolean;
  visibility?: "PUBLIC" | "FOLLOWERS" | null;
  /** 소유 생산자의 방송에만(DEV-297) */
  readCount?: number | null;
  replyCount?: number | null;
  /** 소비자 답장의 비공개 사진(DEV-467). 답장 쓴 소비자와 그 농가 생산자만 받는다 */
  attachmentIds?: string[];
};
type Page = {
  items: Message[];
  nextCursor: string | null;
  room: { farmName: string; canReply: boolean; farmPhoto?: string | null };
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
  /** extra: 소비자 답장이 답한 소식(소식 카드 ‘농가에 답장’)과 비공개 사진 id(DEV-467) */
  send: (
    body: string,
    key: string,
    replyToMessageId?: string,
    replyToVersion?: number,
    extra?: { broadcastId?: string; attachmentIds?: string[]; emoticonId?: EmoticonId },
  ) => Promise<Message>;
  /** 소비자: 답장 사진 올리기(1:1과 같은 비공개 사진, DEV-467). 있으면 입력칸 왼쪽 ‘+’ */
  upload?: (file: File | PickedPhoto) => Promise<{ attachmentId: string }>;
  /** 비공개 사진 열기(답장 말풍선·팬 답장 시트, DEV-467) */
  loadPhoto?: (id: string) => Promise<string>;
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
  /** 길게 누르기 메뉴의 '복사'. 앱은 expo-clipboard 도우미를 넘긴다. 없으면 웹 클립보드만(DEV-295) */
  copy?: (text: string) => Promise<unknown>;
  /** 소비자(팔로워): 이 소식이 보이는 위치까지 읽었다(DEV-297). 맨 아래에서 가장 최근 소식으로 부른다 */
  markRead?: (broadcastId: string) => Promise<unknown>;
  /** 생산자: 소식 하나의 팬 답장(‘답장 N ›’ 시트, DEV-297) */
  fanReplies?: (broadcastId: string, cursor?: string) => Promise<FanReplyPageData>;
  /** 생산자: 시트에서 본 답장을 읽음으로(DEV-297) */
  readFanReplies?: (broadcastId: string, lastReadMessageId: string) => Promise<unknown>;
};
const VIDEO = /^data:video|\.(mp4|webm)$/;
const reasonOf = (e: unknown) =>
  e && typeof e === "object" && "details" in e
    ? (e as { details?: { reason?: string } }).details?.reason
    : undefined;
const POST_GONE = "삭제된 소식이에요. 최신 소식에 답장해 주세요";
const statusOf = (e: unknown) =>
  e && typeof e === "object" && "status" in e ? Number(e.status) : 0;
export function RoomMedia({ uri }: { uri: string }) {
  const video = /^data:video|\.(mp4|webm)$/.test(uri);
  if (video && Platform.OS === "web")
    return createElement("video", {
      src: uri,
      controls: true,
      preload: "metadata",
      style: { width: 250, borderRadius: 12 },
    });
  if (video) {
    // 앱(iOS·Android)에는 영상 재생 라이브러리가 없어 사진으로 그리면 깨진다. 포스터를 누르면 기기 플레이어로 연다(DEV-291)
    // 포스터 모양은 Figma 11:133 ④: 세로 230×300, 가운데 흰 원 재생 버튼(DEV-295). API에 첫 장면·길이가 없어
    // 어두운 면 위 재생 버튼만 그린다(첫 장면·길이 표시는 서버가 주면 후속, expo-video 바로 재생도 후속)
    const openable = /^https?:/.test(uri);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={openable ? "소식 영상 보기" : "소식 영상, 웹에서 볼 수 있어요"}
        disabled={!openable}
        onPress={() => void Linking.openURL(uri).catch(() => undefined)}
        style={{
          width: 230,
          height: 300,
          borderRadius: tokens.radius.md,
          backgroundColor: tokens.color.text,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: openable ? "#FFFFFF" : "rgba(255,255,255,0.5)",
            alignItems: "center",
            justifyContent: "center",
            paddingLeft: 4,
          }}
        >
          <T variant="heading" color={tokens.color.text}>
            ▶
          </T>
        </View>
        {openable ? null : (
          <View
            style={{
              position: "absolute",
              bottom: 12,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: tokens.radius.sm,
              backgroundColor: "rgba(0,0,0,0.6)",
            }}
          >
            <T variant="caption" color="#FFFFFF">
              웹에서 볼 수 있어요
            </T>
          </View>
        )}
      </Pressable>
    );
  }
  return <Photo uri={uri} width={272} height={236} alt="소식 사진" productFallback={false} />;
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
  copy,
  markRead,
  fanReplies,
  readFanReplies,
  upload,
  loadPhoto,
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
  const [selectedEmoticon, setSelectedEmoticon] = useState<EmoticonId>();
  const [busy, setBusy] = useState(false);
  const [older, setOlder] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const [farmName, setFarmName] = useState("");
  const [farmPhoto, setFarmPhoto] = useState<string | null>(null);
  // 생산자 1:N 전송 확인(AC-12-13)과 내 소식 삭제(AC-12-14·16) 시트
  const [confirming, setConfirming] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  // 소비자: 소식 카드 ‘농가에 답장’으로 고른 소식과 붙인 비공개 사진(DEV-467)
  const [replyPost, setReplyPost] = useState<Message | null>(null);
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  // ‘+’가 숨긴 파일 칸을 바로 연다(DEV-467). 고른 사진은 입력줄 위 72×72 한 줄
  // 올리는 사이 화면이 꺼지거나 접근이 바뀌면(accessEpoch) 끝난 업로드를 입력칸에 다시 넣지 않는다
  const uploadEpoch = useRef(0);
  const attach = usePhotoAttach({
    count: photoIds.length,
    upload: upload ?? (() => Promise.reject(new Error("사진을 붙일 수 없어요"))),
    onAdd: (id) => {
      if (alive.current && uploadEpoch.current === accessEpoch.current) setPhotoIds((prev) => [...prev, id]);
    },
    onBusy: (next) => {
      if (next) uploadEpoch.current = accessEpoch.current;
      if (alive.current) setUploading(next);
    },
  });
  const [editTarget, setEditTarget] = useState<Message | null>(null);
  const [menuTarget, setMenuTarget] = useState<Message | null>(null);
  const [menuPoint, setMenuPoint] = useState<MenuPoint | null>(null);
  const [target, setTarget] = useState<Message | null>(null);
  const [removing, setRemoving] = useState(false);
  const [copied, setCopied] = useState(false);
  // 팬 답장 시트가 열린 소식(DEV-297)
  const [replySheet, setReplySheet] = useState<string | null>(null);
  // 마지막으로 읽음을 남긴 소식. 같은 소식으로 다시 부르지 않는다
  const lastMarked = useRef<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
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
  useEffect(() => { if (!active) { accessEpoch.current++; setEditTarget(null); setMenuTarget(null); setReplyTarget(null); setReplyPost(null); setPhotoIds([]); setSelectedEmoticon(undefined); setReplySheet(null); } }, [active]);
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
          setEditTarget(null); setMenuTarget(null); setReplyTarget(null); setReplyPost(null); setPhotoIds([]); setSelectedEmoticon(undefined);
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
        setFarmPhoto(page.room.farmPhoto ?? null);
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
            setEditTarget(null); setMenuTarget(null); setReplyTarget(null); setReplyPost(null); setPhotoIds([]); setSelectedEmoticon(undefined);
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
    if ((!body.trim() && !photoIds.length && !selectedEmoticon) || uploading || sending.current) return;
    if (producer) {
      setSheetError("");
      setConfirming(true);
      return;
    }
    void deliver();
  }
  async function deliver() {
    const emoji = selectedEmoticon;
    const text = emoji ? "" : body.trim();
    const ids = producer || emoji ? [] : photoIds;
    if ((!text && !ids.length && !emoji) || sending.current) return;
    const epoch = accessEpoch.current;
    sending.current = true;
    setBusy(true);
    setError("");
    const replyVersion = replyTarget ? replyTarget.editVersion ?? 0 : undefined;
    // 같은 글·인용·고른 소식·사진이면 같은 멱등 키로 다시 보낸다
    const scope = JSON.stringify({ text, post: replyPost?.broadcastId ?? null, ids, emoji });
    if (pending.current?.body !== scope || pending.current?.replyId !== replyTarget?.messageId || pending.current?.replyVersion !== replyVersion)
      pending.current = { body: scope, replyId: replyTarget?.messageId, replyVersion, key: makeKey() };
    try {
      const message = await send(text, pending.current.key, pending.current.replyId, pending.current.replyVersion,
        { emoticonId: emoji, ...(!producer ? { broadcastId: replyPost?.broadcastId ?? undefined, attachmentIds: ids } : {}) });
      if (!alive.current || epoch !== accessEpoch.current) return;
      nearBottom.current = true;
      if (message.broadcastId) fresh.current.add(message.messageId);
      merge([message]);
      if (emoji) setSelectedEmoticon(undefined);
      else { setBody(""); setPhotoIds([]); setReplyTarget(null); setReplyPost(null); }
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
        const reason = reasonOf(e);
        if (!producer && reason === "REPLY_TARGET_GONE") {
          // 고른 소식이 지워졌다(DEV-467): 고른 소식을 풀고 글은 남긴다
          if (replyPost) drop(replyPost.messageId);
          setReplyPost(null);
          pending.current = null;
          setError(POST_GONE);
        } else if (!producer && reason === "ATTACHMENT_UNUSABLE") {
          // 쓸 수 없는 사진(24시간 지남 등): 사진만 빼고 글은 남긴다
          setPhotoIds([]);
          pending.current = null;
          setError("보낼 수 없는 사진을 뺐어요. 사진을 다시 골라 주세요");
        } else {
          const message =
            e instanceof Error
              ? e.message
              : "전송하지 못했어요. 다시 전송해 주세요";
          if (producer) setSheetError(message);
          else setError(message);
        }
      }
    } finally {
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const tools = useComposerTools({
    selected: selectedEmoticon, onSelect: setSelectedEmoticon, onSend: submit,
    disabled: !active || !canReply || !ready || busy || uploading,
    onPhoto: producer ? onAttach : upload && loadPhoto ? attach.open : undefined,
    photoLabel: producer ? "사진·영상" : "사진", photoDisabled: !producer && attach.full,
  });
  /** 팔로워가 맨 아래(가장 최근 소식이 보이는 위치)에 있으면 그 소식까지 읽음을 남긴다(DEV-297, AC-15-9).
   * 팔로우를 끊은 방·비로그인·생산자는 부르지 않는다. 실패는 알리지 않고 다음 기회에 다시 보낸다 */
  function markSeen() {
    if (producer || !canReply || !markRead || !userId || !active || !nearBottom.current) return;
    const latest = [...messages].reverse().find((m) => m.broadcastId)?.broadcastId;
    if (!latest || latest === lastMarked.current) return;
    lastMarked.current = latest;
    void markRead(latest).catch(() => {
      if (lastMarked.current === latest) lastMarked.current = null;
    });
  }
  // 계정·연결이 바뀌면 같은 소식이라도 새 사용자로 다시 남긴다
  useEffect(() => {
    lastMarked.current = null;
  }, [userId, markRead]);
  useEffect(() => {
    if (ready) markSeen();
  }, [messages, ready, canReply, active, userId, markRead]);
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
      if (m.emoticonId) setSelectedEmoticon(m.emoticonId);
      else { setSelectedEmoticon(undefined); setBody(m.body); }
      pending.current = null;
      notify?.("소식을 삭제했어요 · 고쳐서 다시 보내 주세요");
      setTimeout(() => input.current?.focus(), 0);
    } else notify?.("소식을 삭제했어요");
  }
  // 고른 소식이 목록에서 사라지면(농가가 삭제) 고른 소식을 풀고 알린다(DEV-467). 글은 그대로
  useEffect(() => {
    if (replyPost && !messages.some((m) => m.messageId === replyPost.messageId)) {
      setReplyPost(null);
      setError(POST_GONE);
    }
  }, [messages, replyPost]);
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
  // 메뉴(복사·수정·삭제·답장·1:1 채팅) 중 하나라도 있으면 길게 누르기·우클릭을 연다(DEV-295: 글이 있으면 복사는 늘 있다)
  const hasMenu = (m: Message) =>
    !!m.body || !!(edit && m.senderId === userId) ||
    (producer && ((!!remove && !!m.broadcastId) || (!!onPrivateReply && m.senderRole === "CONSUMER")));
  // 같은 사람·같은 날·같은 분이면 한 묶음(DEV-295). 아바타·이름은 첫 말풍선, 시각은 마지막 말풍선 옆
  const groups = chatGroups(messages.map((m) => ({
    sender: m.senderId, day: seoulDay(m.createdAt), minute: time(m.createdAt),
  })));
  // 소식 카드는 방 폭에서 좌우 16을 뺀 폭, 사진은 카드 폭 그대로(DEV-467). 답장 말풍선 사진은 정사각형 최대 232(Figma 7:78)
  const { width: windowWidth } = useWindowDimensions();
  const roomWidth = Math.min(windowWidth, tokens.maxWidth);
  const cardWidth = newsCardWidth(windowWidth, tokens.maxWidth, tokens.space.gutter);
  const photoWidth = (mine: boolean) =>
    Math.max(160, Math.min(232, roomWidth - tokens.space.gutter * 2 - (mine ? 0 : BUBBLE_AVATAR + tokens.space.sm) - 64));
  const days = messages.map((m, i) =>
    i === 0 || seoulDay(messages[i - 1].createdAt) !== seoulDay(m.createdAt) ? chatDay(m.createdAt) : null,
  );
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
      <View style={{ flex: 1, minHeight: 0 }}>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 24, paddingHorizontal: tokens.space.gutter }}
        onScroll={(event) => {
          const n = event.nativeEvent;
          offset.current = n.contentOffset.y;
          nearBottom.current =
            n.contentSize.height -
              n.layoutMeasurement.height -
              n.contentOffset.y <
            80;
          if (nearBottom.current) {
            setUnseen(false);
            markSeen();
          }
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
          <View style={{ paddingBottom: 12 }}>
            <SystemLine text="보내는 소식은 모든 팔로워에게 보여요" />
          </View>
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
          <T muted center>아직 소식이 없어요.</T>
        ) : null}
        {messages.map((m, i) => {
          const mine = m.senderId === userId;
          const { first, last } = groups[i];
          const day = days[i];
          const dimmed = lapsed && mine;
          const card = !!m.broadcastId;
          const afterCard = i > 0 && !!messages[i - 1].broadcastId;
          return (
          <View key={m.messageId} style={{ paddingTop: i === 0 ? 0 : day ? 16 : card || afterCard ? NEWS_CARD_GAP : first ? 16 : 4, gap: 8 }}>
            {/* 날짜 구분은 기기 시간대가 아니라 한국 날짜로 묶는다(ChatThread와 같음, DEV-223). DEV-291. '10월 7일 수요일' 알약(DEV-295) */}
            {day ? <DayPill label={day} /> : null}
            <Pressable
              accessible={false}
              disabled={!hasMenu(m)}
              delayLongPress={500}
              onLongPress={() => { setMenuPoint(null); setMenuTarget(m); }}
              {...(Platform.OS === "web" && hasMenu(m) ? {
                onContextMenu: (e: {preventDefault: () => void; clientX: number; clientY: number}) => {
                  e.preventDefault(); setMenuPoint({x: e.clientX, y: e.clientY}); setMenuTarget(m);
                },
                tabIndex: 0,
                onKeyDown: (e: {key: string; shiftKey: boolean; preventDefault: () => void}) => {
                  if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); setMenuPoint(null); setMenuTarget(m); }
                },
              } as object : {})}
              // 팔로우를 끊은 방의 내 답장은 흐리게 남긴다(DEV-230)
              style={dimmed ? { opacity: 0.45 } : undefined}
              testID={dimmed ? "room-dimmed-reply" : undefined}
            >
            {card ? (
              // 방송 = 소식 카드(DEV-467): 작성자 줄 → 인용 → 사진 → 본문 → 반응 줄
              <NewsCard
                message={m}
                producer={producer}
                author={m.senderName || farmName}
                authorPhoto={farmPhoto}
                width={cardWidth}
                onLike={() => void like(m)}
                onReply={!userId ? onLogin : canReply ? () => { setReplyPost(m); setTimeout(() => input.current?.focus(), 0); } : undefined}
                onReplies={fanReplies ? () => setReplySheet(m.broadcastId) : undefined}
                onMediaLongPress={hasMenu(m) ? () => { setMenuPoint(null); setMenuTarget(m); } : undefined}
              />
            ) : (
            <ChatBubble
              kind={mine ? "me" : "farm"}
              first={first || !!day}
              last={last}
              quote={m.replyTo ?? undefined}
              quoteLabel={m.replyTo ? (m.replyTo.senderType === "CONSUMER"
                ? producer ? "팔로워의 답장 · 이름은 가려져요" : "팔로워의 답장"
                : "농가에게 답장") : undefined}
              edited={!!m.editedAt}
              text={m.emoticonId ? "" : m.body}
              avatar={mine ? undefined : m.senderRole === "PRODUCER"
                ? <ProfileAvatar uri={farmPhoto} name={m.senderName || farmName} size={BUBBLE_AVATAR} />
                : <ProfileAvatar name={m.senderName} size={BUBBLE_AVATAR} />}
              sender={mine ? undefined : m.senderName}
              time={time(m.createdAt)}
              side={
                // 내 답장 옆 🔒 ‘농가만 봐요’(비공개 응답, DEV-295). 방송은 위 소식 카드가 그린다(DEV-467)
                mine && !producer ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                    <Icon name="lock" size={12} color={tokens.color.textMuted} />
                    <T variant="caption" muted>농가만 봐요</T>
                  </View>
                ) : undefined
              }
            >
              {m.emoticonId ? <EmoticonMessage id={m.emoticonId} /> : null}
              {[...m.photos, ...m.videos].map((uri) =>
                VIDEO.test(uri) ? (
                  <RoomMedia key={uri} uri={uri} />
                ) : (
                  <ViewablePhoto key={uri} uri={uri}
                    onLongPress={hasMenu(m) ? () => { setMenuPoint(null); setMenuTarget(m); } : undefined}>
                    <Photo uri={uri} width={photoWidth(mine)} height={photoWidth(mine)} alt="소식 사진" productFallback={false} />
                  </ViewablePhoto>
                ),
              )}
              {/* 소비자 답장의 비공개 사진(눌러 크게, DEV-467). 답장 쓴 소비자와 그 농가 생산자만 받는다 */}
              {loadPhoto ? m.attachmentIds?.map((id) => (
                <PrivatePhoto key={id} id={id} load={loadPhoto} label="답장 사진"
                  onLongPress={hasMenu(m) ? () => { setMenuPoint(null); setMenuTarget(m); } : undefined} />
              )) : null}
            </ChatBubble>
            )}
            </Pressable>
          </View>
          );
        })}
      </ScrollView>
      {unseen ? (
        <FloatingPill
          label="새 소식 ↓"
          onPress={() => {
            nearBottom.current = true;
            setUnseen(false);
            scroll.current?.scrollToEnd({ animated: true });
          }}
        />
      ) : null}
      </View>
      {canReply ? (
        <View
          style={{
            paddingTop: tokens.space.sm,
            paddingHorizontal: tokens.space.md,
            paddingBottom: producer ? tokens.space.sm : safe("bottom", tokens.space.sm),
            backgroundColor: tokens.color.background,
            borderTopWidth: 1,
            borderColor: tokens.color.border,
          }}
        >
          <Composer
            inputRef={input}
            value={body}
            onChangeText={setBody}
            accessibilityLabel={producer ? "모두에게 보낼 소식" : "농가에 답장"}
            placeholder={
              producer
                ? recipientCount != null
                  ? `팔로워 ${recipientCount}명에게 보내기`
                  : "모든 팔로워에게 보내기"
                : farmName
                  ? `${farmName}에 답장`
                  : "농가에 답장하기"
            }
            editable={ready && !busy}
            maxLength={producer ? 2000 : 1000}
            onSend={submit}
            canSend={ready && !uploading && (!!selectedEmoticon || !!body.trim() || (!producer && photoIds.length > 0))}
            busy={busy}
            tool={tools.tool}
            trailing={tools.trailing}
            onFocus={tools.close}
            above={<>
              {tools.above}
              {replyPost ? (
                // 고른 소식(DEV-467). 답장은 그 소식에 붙고 농가만 본다
                <View testID="room-reply-post" style={{flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: tokens.color.accent}}>
                  <View style={{flex: 1, minWidth: 0}}>
                    <T variant="caption" muted>소식에 답장 · 농가만 봐요</T>
                    <T variant="sub" numberOfLines={1}>{replyPost.body || "사진·영상 소식"}</T>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel="소식 선택 취소" disabled={busy} onPress={() => setReplyPost(null)} style={{width: 48, height: 48, alignItems: "center", justifyContent: "center"}}><Icon name="close" size={18} /></Pressable>
                </View>
              ) : null}
              {!producer && upload && loadPhoto ? (
                <>
                  {attach.input}
                  <AttachedPhotoRow
                    ids={photoIds}
                    load={loadPhoto}
                    busy={attach.busy}
                    error={attach.error}
                    disabled={busy}
                    onRemove={(id) => setPhotoIds((prev) => prev.filter((v) => v !== id))}
                  />
                </>
              ) : null}
              {copied ? <T variant="caption" muted center>메시지를 복사했어요</T> : null}
              {replyTarget ? <View style={{flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: tokens.color.accent}}>
                <View style={{flex: 1}}><T variant="caption" muted>소비자에게 답장 · 모든 팔로워에게 보여요</T><T numberOfLines={2}>{quotePreview(replyTarget.body)}</T></View>
                <Pressable accessibilityRole="button" accessibilityLabel="답장 취소" disabled={busy} onPress={() => setReplyTarget(null)} style={{width: 44, height: 44, alignItems: "center", justifyContent: "center"}}><Icon name="close" size={18} /></Pressable>
              </View> : null}
            </>}
          />
          {tools.below}
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
          ...(menuTarget?.body ? [{label: "복사", onPress: () => {
            const text = menuTarget.body;
            void copyToClipboard(text, copy).then(ok => { if (ok && alive.current) setCopied(true); });
          }}] : []),
          ...(menuTarget && edit && !menuTarget.emoticonId && menuTarget.senderId === userId ? [{label: "수정", onPress: () => setEditTarget(menuTarget)}] : []),
          ...(menuTarget?.broadcastId && remove && producer ? [{label: "삭제·다시 쓰기", onPress: () => { if (menuTarget) openMenu(menuTarget); }}] : []),
          ...(menuTarget?.senderRole === "CONSUMER" && producer ? [{label: "답장", onPress: () => { setReplyTarget(menuTarget); setTimeout(() => input.current?.focus(), 0); }}] : []),
          ...(menuTarget?.senderRole === "CONSUMER" && producer && onPrivateReply ? [{label: "1:1 채팅", onPress: () => { if (menuTarget) onPrivateReply(menuTarget.senderId, menuTarget.messageId); }}] : []),
        ]} />
      {producer && fanReplies ? (
        <FanReplySheet
          broadcastId={replySheet}
          load={fanReplies}
          loadPhoto={loadPhoto}
          markRead={readFanReplies}
          onClose={() => setReplySheet(null)}
          onQuote={(r: FanReplyRow) => {
            // 시트에서 고른 답장을 길게 누르기 ‘답장’과 같은 익명 인용 흐름(DEV-289)으로 넘긴다
            setReplySheet(null);
            setReplyTarget({
              messageId: r.messageId,
              senderId: r.consumerId,
              senderName: r.senderName,
              senderRole: "CONSUMER",
              body: r.body,
              editVersion: r.editVersion,
              photos: [],
              videos: [],
              createdAt: r.createdAt,
              broadcastId: null,
              reactionCount: 0,
              myReaction: false,
              visibility: null,
            });
            setTimeout(() => input.current?.focus(), 0);
          }}
          onPrivate={onPrivateReply ? (consumerId, replyId) => {
            setReplySheet(null);
            onPrivateReply(consumerId, replyId);
          } : undefined}
        />
      ) : null}
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
            emoticonId={selectedEmoticon}
          />
          <T variant="sub">
            {recipientCount === 0
              ? "새로 팔로우하는 분이 이 소식을 보게 돼요. "
              : ""}
            {selectedEmoticon ? "보낸 이모티콘 소식은 삭제할 수 있어요." : "보낸 소식의 본문은 수정하거나 삭제할 수 있어요."}
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

/** 카드 그림자: 테두리 없이 아주 옅게(시안 0 1px 2px rgba(17,17,17,.04)) */
const CARD_SHADOW = (Platform.OS === "web"
  ? { boxShadow: "0 1px 2px rgba(17,17,17,0.04)" }
  : { shadowColor: tokens.color.text, shadowOpacity: 0.04, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 }) as object;

/**
 * 소식 카드(DEV-467, 시안 ‘다듬은 A’). 작성자 줄(40 사진 · 이름 16/24 굵게 · 시각 12/16) → 인용(모두에게 답장) →
 * 카드 폭 사진(1장 4:3, 2장 정사각형 두 칸, i/N) → 영상 → 본문 16/24 → 위 선이 있는 반응 줄.
 * 소비자 반응 줄은 ‘좋아요 | 농가에 답장’ 같은 폭 두 칸(숫자 없음, AC-15-3). 답장은 지금처럼 농가만 보는 비공개 답장이다.
 * 생산자 반응 줄은 ‘읽음 N · 좋아요 N’ 왼쪽, ‘답장 N ›’ 오른쪽(팬 답장 시트, AC-15-9·11). 숫자는 농가만 본다.
 */
function NewsCard({
  message: m,
  producer,
  author,
  authorPhoto,
  width,
  onLike,
  onReply,
  onReplies,
  onMediaLongPress,
}: {
  message: Message;
  producer: boolean;
  author: string;
  authorPhoto: string | null;
  width: number;
  onLike: () => void;
  /** 소비자 ‘농가에 답장’: 입력칸으로(비로그인은 로그인). 없으면 비활성 */
  onReply?: () => void;
  onReplies?: () => void;
  onMediaLongPress?: () => void;
}) {
  const photos = m.photos.filter((uri) => !VIDEO.test(uri));
  const videos = [...m.photos.filter((uri) => VIDEO.test(uri)), ...m.videos];
  const rows = newsPhotoRows(photos.length, width);
  const media = photos.length > 0 || videos.length > 0;
  return (
    <View
      testID="news-card"
      style={{
        width,
        maxWidth: "100%",
        alignSelf: "center",
        backgroundColor: tokens.color.background,
        borderRadius: tokens.radius.md,
        overflow: "hidden",
        ...CARD_SHADOW,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 16, paddingBottom: 12, paddingHorizontal: 16 }}>
        <ProfileAvatar uri={authorPhoto} name={author} size={tokens.thumb.avatar} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T variant="body" weight="semibold" numberOfLines={1}>{author}</T>
          <T variant="caption" muted numberOfLines={1}>
            {m.editedAt ? `${time(m.createdAt)} · 수정됨` : time(m.createdAt)}
          </T>
        </View>
      </View>
      {m.replyTo ? (
        <View
          testID="bubble-quote"
          style={{ marginHorizontal: 16, marginBottom: 12, borderLeftWidth: 2, borderLeftColor: tokens.color.accent, paddingLeft: tokens.space.sm, gap: 2 }}
        >
          <T variant="caption" muted weight="semibold">
            {m.replyTo.senderType === "CONSUMER"
              ? producer ? "팔로워의 답장 · 이름은 가려져요" : "팔로워의 답장"
              : "농가에게 답장"}
          </T>
          <T variant="sub" muted numberOfLines={3}>{m.replyTo.body || "사진"}</T>
        </View>
      ) : null}
      {rows.length ? (
        <View style={{ gap: NEWS_PHOTO_GAP }}>
          {rows.map((row) => (
            <View key={row[0].index} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              {row.map((cell) => (
                <ViewablePhoto key={photos[cell.index] + cell.index} uri={photos[cell.index]} onLongPress={onMediaLongPress}>
                  <Photo uri={photos[cell.index]} width={cell.width} height={cell.height} radius={0} alt="소식 사진" productFallback={false} />
                  {cell.badge ? (
                    <View
                      pointerEvents="none"
                      style={{ position: "absolute", right: 12, bottom: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: tokens.radius.full, backgroundColor: tokens.color.photoOverlay }}
                    >
                      <T variant="caption" color={tokens.color.onAccent}>{cell.badge}</T>
                    </View>
                  ) : null}
                </ViewablePhoto>
              ))}
            </View>
          ))}
        </View>
      ) : null}
      {videos.length ? (
        <View style={{ paddingHorizontal: 16, paddingTop: rows.length ? 12 : 0, gap: 8 }}>
          {videos.map((uri) => <RoomMedia key={uri} uri={uri} />)}
        </View>
      ) : null}
      {m.emoticonId ? <View style={{ alignItems: "center" }}><EmoticonMessage id={m.emoticonId} /></View> : m.body ? (
        <View style={{ paddingHorizontal: 16, paddingTop: media ? 12 : 0 }}>
          <T variant="body">{m.body}</T>
        </View>
      ) : null}
      <View
        style={{
          marginTop: 16,
          minHeight: tokens.touchTarget.min,
          borderTopWidth: 1,
          borderTopColor: tokens.color.border,
          flexDirection: "row",
          alignItems: "stretch",
          ...(producer ? { justifyContent: "space-between", paddingLeft: 16, paddingRight: 8 } : null),
        }}
      >
        {producer ? <ProducerReactions message={m} onReplies={onReplies} /> : (
          <>
            <ReactionHalf
              label={m.myReaction ? "좋아요 취소" : "좋아요"}
              pressed={m.myReaction}
              onPress={onLike}
              icon={<Icon name={m.myReaction ? "heartFill" : "heart"} size={20} color={m.myReaction ? tokens.color.accent : tokens.color.textMuted} />}
              text="좋아요"
              color={m.myReaction ? tokens.color.accent : tokens.color.text}
            />
            <View style={{ width: 1, backgroundColor: tokens.color.border }} />
            <ReactionHalf
              label="농가에 답장"
              onPress={onReply}
              icon={<Icon name="chat" size={20} color={tokens.color.textMuted} />}
              text="농가에 답장"
              color={onReply ? tokens.color.text : tokens.color.textMuted}
            />
          </>
        )}
      </View>
    </View>
  );
}

/** 소비자 반응 줄의 한 칸(같은 폭, 높이 48) */
function ReactionHalf({ label, pressed, onPress, icon, text, color }: {
  label: string; pressed?: boolean; onPress?: () => void; icon: ReactNode; text: string; color: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !onPress }}
      {...(pressed !== undefined ? { "aria-pressed": pressed } : {})}
      disabled={!onPress}
      onPress={onPress}
      style={{ flex: 1, minWidth: 0, minHeight: tokens.touchTarget.min, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 8 }}
    >
      {icon}
      <T variant="sub" weight="semibold" color={color} numberOfLines={1}>{text}</T>
    </Pressable>
  );
}

/** 생산자 반응 줄: 왼쪽 ‘읽음 N · 좋아요 N’(보조 14 회색), 오른쪽 ‘답장 N ›’(주황 굵게, 답장이 있을 때만, DEV-297).
 * 접근성 이름은 기존 그대로(‘읽음 N, 좋아요 N’, ‘답장 N 모아 보기’) */
function ProducerReactions({ message, onReplies }: { message: Message; onReplies?: () => void }) {
  const stats = broadcastStats(message);
  return (
    <>
      <View
        accessible
        accessibilityLabel={stats.replies && onReplies ? stats.countsLabel : stats.label}
        style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1, minWidth: 0 }}
      >
        {stats.read ? (
          <>
            <T variant="sub" muted numberOfLines={1}>{stats.read}</T>
            <T variant="sub" muted>·</T>
          </>
        ) : null}
        <T variant="sub" muted numberOfLines={1}>{`좋아요 ${stats.likes}`}</T>
        {stats.replies && !onReplies ? (
          <>
            <T variant="sub" muted>·</T>
            <T variant="sub" muted numberOfLines={1}>{stats.replies}</T>
          </>
        ) : null}
      </View>
      {stats.replies && onReplies ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${stats.replies} 모아 보기`}
          onPress={onReplies}
          style={{ minHeight: tokens.touchTarget.min, flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 8, flexShrink: 0 }}
        >
          {/* 글자 ‘답장 N ›’ 한 덩어리(시트 제목 ‘답장 N’과 구별된다) */}
          <T variant="sub" weight="semibold" color={tokens.color.accent}>{`${stats.replies} ›`}</T>
        </Pressable>
      ) : null}
    </>
  );
}

function NewsPreview({
  head,
  meta,
  body,
  emoticonId,
}: {
  head: string;
  meta: string;
  body: string;
  emoticonId?: EmoticonId;
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
      {emoticonId ? <EmoticonImage id={emoticonId} size={112} /> : <T variant="sub">{body}</T>}
    </View>
  );
}

/**
 * 소식방 판매 품목 한 줄(DEV-295, Figma 7:78·7:90). 기본은 접혀서 ‘판매 중 N개 · 요약’ 한 줄만 보이고,
 * 줄을 누르면 상품 카드 가로 목록이 펼쳐진다. 접기/펼치기는 이 컴포넌트 안 상태라 대화를 다시 그리지 않는다(AC-12-12).
 * summary가 없으면 가장 싼 예약 가능 상품 ‘이름 가격~’을 보인다(생산자는 ‘팔로워 N명’을 넘긴다).
 */
export function RoomShelf({
  products,
  summary,
  defaultExpanded = false,
  onProduct,
}: {
  products: ShelfProduct[];
  summary?: string;
  defaultExpanded?: boolean;
  onProduct: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const open = products.filter((p) => !p.soldOut && p.currentPrice != null);
  const cheapest = [...open].sort((a, b) => (a.currentPrice ?? 0) - (b.currentPrice ?? 0))[0];
  const head = open.length
    ? `판매 중 ${open.length}개`
    : products.length
      ? `판매 품목 ${products.length}개`
      : "판매 중인 상품이 없어요";
  const rest = summary ?? (cheapest ? `${cheapest.name} ${won(cheapest.currentPrice)}~` : "");
  const thumb = (cheapest ?? products[0])?.photo;
  return (
    <View
      style={{
        backgroundColor: tokens.color.surface,
        flexShrink: 0,
        borderBottomWidth: 1,
        borderBottomColor: tokens.color.border,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="판매 품목"
        aria-expanded={expanded}
        onPress={() => setExpanded(!expanded)}
        style={{
          height: tokens.touchTarget.min,
          paddingHorizontal: tokens.space.gutter,
          flexDirection: "row",
          alignItems: "center",
          gap: tokens.space.sm,
        }}
      >
        {products.length ? (
          <Photo uri={thumb} width={32} height={32} radius={6} alt="" kind="product" />
        ) : null}
        <T variant="sub" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
          <T variant="sub" weight="bold">{head}</T>
          {rest ? <T variant="sub" muted>{` · ${rest}`}</T> : null}
        </T>
        <View style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}>
          <Icon name="chevronDown" size={20} />
        </View>
      </Pressable>
      {expanded ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: tokens.space.gutter,
            paddingBottom: 12,
            gap: tokens.space.sm,
          }}
        >
          {products.length ? (
            products.map((p) => (
              <Pressable
                key={p.productId}
                accessibilityRole="link"
                accessibilityLabel={`${p.name} 상품 상세`}
                onPress={() => onProduct(p.productId)}
                style={{
                  width: 240,
                  padding: 12,
                  borderRadius: tokens.radius.md,
                  backgroundColor: tokens.color.background,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Photo uri={p.photo} width={48} height={48} alt={p.name} kind="product" />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <T variant="sub" weight="semibold" numberOfLines={1}>
                    {p.name}
                  </T>
                  <Price
                    current={p.currentPrice}
                    reference={p.referencePrice}
                    soldOut={p.soldOut}
                    availability={p.availability}
                    compact
                  />
                </View>
              </Pressable>
            ))
          ) : (
            <T muted style={{ padding: 12 }}>
              판매 중인 상품이 없어요
            </T>
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}
