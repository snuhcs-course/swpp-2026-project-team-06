import {
  farms,
  messaging,
  newIdempotencyKey,
  privateImage,
  uploadAttachment,
  isMock,
  type ChatPage,
} from "@farmclub/api";
import {
  ChatThread,
  ConversationHeader,
  Screen,
  T,
  useAsync,
} from "@farmclub/ui";
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
  type Href,
} from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useHideTabBar } from "../../../lib/session";
import { roomBackTarget } from "../../../lib/backTargets";
import { goBackOr } from "../../../lib/nav";
export default function Chat() {
  useHideTabBar();
  // productId: 상품 페이지에서 열었으면 그 상품을 AI 근거로 보낸다(DEV-97)
  // from·fromOrder: 농가 정보·주문 상세에서 열었으면 뒤로가 그 화면(DEV-224 a1, roomBackTarget)
  const params = useLocalSearchParams<{
      farmId: string;
      start?: string;
      orderId?: string;
      productId?: string;
      from?: string;
      fromOrder?: string;
    }>(),
    { farmId, start, orderId, productId } = params,
    router = useRouter(),
    farm = useAsync(() => farms.get(farmId), [farmId]);
  const [active, setActive] = useState(false),
    [ready, setReady] = useState(start !== "1"),
    [error, setError] = useState(""),
    [page, setPage] = useState<ChatPage | null>(null),
    startKey = useRef(newIdempotencyKey());
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );
  useEffect(() => {
    if (start !== "1") return;
    let alive = true;
    messaging
      .startChat(farmId, startKey.current)
      .then(() => {
        if (alive) setReady(true);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [farmId, start]);
  const load = useCallback(
    async (cursor?: string) => {
      const p = await messaging.messages(farmId, { cursor });
      if (!cursor) setPage(p);
      return p;
    },
    [farmId],
  );
  // DEV-208: 직접 응대·농가 AI OFF면 응답 주체와 예상 시간을 알린다(AC-13-9·13-10)
  const replyMode =
      page?.farmReply?.mode ??
      (page?.thread.aiMode === "HUMAN" ? "FARM" : "AI"),
    replyTime = replyHoursLabel(page?.farmReply?.typicalReplyHours),
    forwardStatus = `농가에 전달했어요 · ${replyTime ? `보통 ${replyTime} 안에 답해요` : "답이 오면 여기에 보여요"}`;
  return (
    <Screen>
      <ConversationHeader
        name={farm.data?.name ?? "농가"}
        photo={farm.data?.photo}
        subtitle="1:1 채팅"
        onProfile={() => router.push(`/farms/${farmId}`)}
        onBack={() => {
          // 상품·농가 정보·주문 상세에서 연 방은 연 화면으로(탭 기록에 기대지 않는다)
          const target = roomBackTarget(params);
          if (target) router.navigate(target as Href);
          else goBackOr(router, "/chats?view=private");
        }}
      />
      <View style={{ padding: 12 }}>
        <T variant="caption" muted>
          {replyMode === "FARM"
            ? `AI 안내 없이 농가가 직접 답해요 · ${replyTime ? `보통 ${replyTime} 안에` : "답이 오면 여기에 보여요"}`
            : "등록된 정보는 AI가 안내하고, 확인이 필요한 질문은 농가에 전달해요."}
          {isMock ? " · Mock AI 안내" : ""}
        </T>
        {error ? <T>{error}</T> : null}
      </View>
      {ready ? (
        <ChatThread
          key={farmId}
          active={active}
          load={load}
          read={(id) => messaging.read(farmId, id)}
          makeKey={newIdempotencyKey}
          loadPhoto={privateImage}
          upload={(f) =>
            uploadAttachment(f, { threadId: page?.thread.threadId })
          }
          send={(text, ids, key) =>
            messaging.send(
              farmId,
              text,
              ids,
              orderId ?? page?.inquiries[0]?.orderId,
              key,
              productId,
            )
          }
          report={(messageId, key) => messaging.reportAiAnswer(farmId, messageId, key)}
          forwardStatus={forwardStatus}
        />
      ) : (
        <T muted>대화를 여는 중…</T>
      )}
    </Screen>
  );
}

/** 3 → "3시간", 48 → "2일". 숫자가 없으면 빈 문자열(DEV-208) */
function replyHoursLabel(hours?: number | null) {
  if (!hours) return "";
  return hours >= 24 ? `${Math.round(hours / 24)}일` : `${hours}시간`;
}
