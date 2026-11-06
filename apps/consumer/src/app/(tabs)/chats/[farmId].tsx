import {
  farms, messaging, newIdempotencyKey, privateImage, uploadAttachment,
  getToken, isMock, ApiError, type ChatPage,
} from "@farmclub/api";
import {
  Button, ChatThread, ConversationHeader, Screen, Sheet, T, useAsync,
} from "@farmclub/ui";
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { useHideTabBar, useSession } from "../../../lib/session";
import { roomBackTarget } from "../../../lib/backTargets";
import { goBackOr } from "../../../lib/nav";
import { chatEntry, chatRequest, initialOrderId } from "../../../lib/orderChat";

type Head = { page: ChatPage; epoch: number; owner: string };
export default function Chat() {
  useHideTabBar();
  const params = useLocalSearchParams<{
    farmId: string; start?: string; orderId?: string; productId?: string;
    from?: string; fromOrder?: string; context?: string;
  }>();
  const { farmId, productId, requestedOrderId, shouldStart, generalOrderEntry } = chatEntry(params);
  const router = useRouter(), { user } = useSession();
  const farm = useAsync(() => farms.get(farmId), [farmId]);
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [head, setHead] = useState<Head | null>(null);
  const [page, setPage] = useState<ChatPage | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | undefined>();
  const [orderSheet, setOrderSheet] = useState(false);
  const [composerBusy, setComposerBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const focused = useRef(false), epoch = useRef(0);
  const startRequest = useRef<{ body: string; key: string } | null>(null);
  const currentUser = useRef(user?.userId);
  currentUser.current = user?.userId;
  const token = getToken();
  const authEpoch = useRef({ token, generation: 0 });
  if (authEpoch.current.token !== token)
    authEpoch.current = { token, generation: authEpoch.current.generation + 1 };
  const authGeneration = authEpoch.current.generation;

  useFocusEffect(useCallback(() => {
    focused.current = true;
    setActive(true);
    return () => {
      focused.current = false;
      epoch.current++;
      setActive(false);
    };
  }, []));

  useEffect(() => {
    if (!active || !user) {
      setHead(null);
      setPage(null);
      return;
    }
    let alive = true;
    const attempt = ++epoch.current, owner = user.userId, attemptToken = getToken();
    const valid = () => alive && focused.current && epoch.current === attempt &&
      currentUser.current === owner && getToken() === attemptToken;
    const body = JSON.stringify({ owner, authGeneration, farmId, orderId: requestedOrderId });
    if (startRequest.current?.body !== body)
      startRequest.current = { body, key: newIdempotencyKey() };
    setPhase("loading"); setError(""); setHead(null); setPage(null);
    setOrderSheet(false); setComposerBusy(false);
    void (async () => {
      try {
        if (shouldStart)
          await chatRequest(messaging.startChat(farmId, startRequest.current!.key,
            requestedOrderId === undefined ? undefined : { orderId: requestedOrderId }));
        if (!valid()) return;
        const fresh = await chatRequest(messaging.messages(farmId));
        if (!valid()) return;
        const selected = initialOrderId(requestedOrderId, fresh.orders);
        if (requestedOrderId !== undefined && selected === undefined)
          throw new Error("연결된 주문을 확인할 수 없어요. 주문 상세에서 다시 열어 주세요.");
        setSelectedOrderId(selected);
        setPage(fresh);
        setHead({ page: fresh, epoch: attempt, owner });
        setPhase("ready");
      } catch (e) {
        if (!valid()) return;
        setHead(null); setPage(null);
        setError(e instanceof Error ? e.message : "대화를 열지 못했어요. 다시 시도해 주세요.");
        setPhase("error");
        if (e instanceof ApiError && e.status === 403 && requestedOrderId === undefined &&
            e.details.reason !== "ONBOARDING_REQUIRED" && e.details.reason !== "WRONG_APP")
          router.replace(`/farms/${farmId}` as Href);
      }
    })();
    return () => { alive = false; epoch.current++; };
  }, [active, user?.userId, token, authGeneration, farmId, requestedOrderId, shouldStart, retry]);

  const load = useCallback(async (cursor?: string) => {
    const attempt = epoch.current, attemptToken = getToken();
    const fresh = await chatRequest(messaging.messages(farmId, { cursor }));
    if (!focused.current || attempt !== epoch.current || attemptToken !== getToken())
      throw new Error("대화가 바뀌었어요.");
    if (!cursor) setPage(fresh);
    return fresh;
  }, [farmId]);
  const denied = useCallback((e: unknown) => {
    setHead(null); setPage(null); setPhase("error");
    setError(e instanceof Error ? e.message : "대화를 볼 권한을 확인해 주세요.");
  }, []);

  const selected = page?.orders.find(o => o.orderId === selectedOrderId);
  const needsSelection = Boolean(page?.orders.length && !selected);
  const lostOrder = selectedOrderId !== undefined && !selected;
  const ready = active && user && phase === "ready" && head?.owner === user.userId &&
    head.epoch === epoch.current;
  const replyMode = page?.farmReply?.mode ??
    (page?.thread.aiMode === "HUMAN" ? "FARM" : "AI");
  const replyTime = replyHoursLabel(page?.farmReply?.typicalReplyHours);
  const forwardStatus = `농가에 전달했어요 · ${replyTime ? `보통 ${replyTime} 안에 답해요` : "답이 오면 여기에 보여요"}`;
  const sendScope = JSON.stringify({ farmId, orderId: selected?.orderId, productId });
  return (
    <Screen>
      <ConversationHeader
        name={farm.data?.farmId === farmId ? farm.data.name : "농가"}
        photo={farm.data?.farmId === farmId ? farm.data.photo : undefined} subtitle="1:1 채팅"
        onProfile={() => router.push(`/farms/${farmId}` as Href)}
        onBack={() => {
          const target = roomBackTarget(params);
          if (target) router.navigate(target as Href);
          else goBackOr(router, "/chats?view=private");
        }}
      />
      <View style={{ padding: 12, gap: 8 }}>
        {generalOrderEntry ? <T variant="caption" muted>
          결제 확인 전에는 일반 대화로 물어봐요. 팔로우하지 않았다면 팔로우하고 대화를 시작해요.
        </T> : null}
        <T variant="caption" muted>
          {replyMode === "FARM"
            ? `AI 안내 없이 농가가 직접 답해요 · ${replyTime ? `보통 ${replyTime} 안에` : "답이 오면 여기에 보여요"}`
            : "등록된 정보는 AI가 안내하고, 확인이 필요한 질문은 농가에 전달해요."}
          {isMock ? " · Mock AI 안내" : ""}
        </T>
        {ready && page && page.orders.length > 0 ? (
          <View style={{ gap: 4 }}>
            <T variant="caption" numberOfLines={2}>
              {selected
                ? `문의할 주문 · ${selected.productName} ${selected.optionLabel} · ${selected.quantity}개 (${selected.orderId})`
                : "문의할 주문을 선택해 주세요."}
            </T>
            {page.orders.length > 1 || !selected ? (
              <Button label={selected ? "주문 바꾸기" : "주문 선택"} variant="text"
                disabled={composerBusy} onPress={() => setOrderSheet(true)} />
            ) : null}
          </View>
        ) : null}
        {lostOrder && ready ? <T variant="caption">연결된 주문을 확인할 수 없어요. 주문 상세에서 다시 열어 주세요.</T> : null}
        {phase === "error" ? (
          <View accessibilityRole="alert" style={{ gap: 8 }}>
            <T>{error}</T>
            <Button label="다시 시도" onPress={() => setRetry(n => n + 1)} />
            <T variant="caption" muted>주문 문의는 본인의 결제된 주문 상세에서 대화를 열어 주세요.</T>
            <Button label="내 주문 보기" variant="text" onPress={() => router.navigate("/orders")} />
          </View>
        ) : null}
      </View>
      {ready && head && page ? (
        <ChatThread
          key={`${user!.userId}:${farmId}:${head.epoch}`}
          active={active} initialPage={head.page} load={load}
          composerEnabled={!needsSelection && !lostOrder}
          sendScope={sendScope} onBusyChange={setComposerBusy} onAccessDenied={denied}
          read={id => messaging.read(farmId, id)} makeKey={newIdempotencyKey}
          loadPhoto={privateImage}
          upload={file => uploadAttachment(file, selected
            ? { orderId: selected.orderId } : { threadId: page.thread.threadId })}
          send={(text, ids, key) => messaging.send(
            farmId, text, ids, selected?.orderId, key, productId,
          )}
          report={(id, key) => messaging.reportAiAnswer(farmId, id, key)}
          forwardStatus={forwardStatus}
        />
      ) : phase === "loading" ? <T muted>대화를 여는 중…</T> : null}
      <Sheet visible={orderSheet} onClose={() => setOrderSheet(false)}>
        <T variant="heading">문의할 주문 선택</T>
        <ScrollView style={{ maxHeight: 360 }}>
          <View style={{ gap: 8 }}>
            {page?.orders.map(order => (
              <Button key={order.orderId} variant="outline" disabled={composerBusy}
                label={`주문 ${order.orderId} · ${order.productName} ${order.optionLabel} · ${order.quantity}개`}
                onPress={() => { setSelectedOrderId(order.orderId); setOrderSheet(false); }} />
            ))}
          </View>
        </ScrollView>
      </Sheet>
    </Screen>
  );
}
function replyHoursLabel(hours?: number | null) {
  if (!hours) return "";
  return hours >= 24 ? `${Math.round(hours / 24)}일` : `${hours}시간`;
}
