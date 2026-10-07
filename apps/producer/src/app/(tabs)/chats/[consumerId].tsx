import {
  messaging,
  newIdempotencyKey,
  privateImage,
  uploadAttachment,
  isMock,
  type ChatPage,
} from "@farmclub/api";
import {
  Button,
  ChatThread,
  Checkbox,
  ConversationHeader,
  Screen,
  T,
  tokens,
} from "@farmclub/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { ORDER_STATUS } from "../../../lib/views";
import { useHideTabBar } from "../../../lib/session";
export default function Chat() {
  useHideTabBar();
  const { consumerId, name } = useLocalSearchParams<{
      consumerId: string;
      name?: string;
    }>(),
    router = useRouter();
  const [page, setPage] = useState<ChatPage | null>(null),
    [active, setActive] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [changing, setChanging] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );
  const load = useCallback(
    async (cursor?: string) => {
      const p = await messaging.producerMessages(consumerId, { cursor });
      if (!cursor) setPage(p);
      return p;
    },
    [consumerId],
  );
  async function toggle() {
    if (!page || changing) return;
    setChanging(true);
    try {
      await messaging.aiMode(
        consumerId,
        page.thread.aiMode === "AUTO" ? "HUMAN" : "AUTO",
        page.thread.version,
      );
      await load();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "변경하지 못했어요");
    } finally {
      setChanging(false);
    }
  }
  return (
    <Screen>
      <ConversationHeader
        name={name ?? "소비자"}
        subtitle="1:1 채팅"
        onBack={() => router.navigate("/chats?view=private")}
      />
      <View
        style={{
          padding: 12,
          gap: 4,
          borderBottomWidth: 1,
          borderBottomColor: tokens.color.border,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <T weight="semibold">
            {page?.thread.aiMode === "HUMAN"
              ? "농가 직접 응대"
              : "AI 자동 안내"}
          </T>
          <Button
            label={
              page?.thread.aiMode === "HUMAN"
                ? "AI 응답 재개"
                : "직접 응대로 전환"
            }
            variant="text"
            loading={changing}
            onPress={toggle}
          />
        </View>
        <T variant="caption" muted>
          답변을 보내면 직접 응대로 전환돼요. 농가 AI가 꺼져 있으면 자동 안내도
          쉬어요.{isMock ? " · Mock 안내" : ""}
        </T>
        <Button
          label="농가 AI 설정"
          variant="text"
          onPress={() =>
            router.push({
              pathname: "/farm/ai-settings",
              params: { consumerId, ...(name ? { name } : {}) },
            })
          }
        />
        {error ? <T color={tokens.color.error}>{error}</T> : null}
      </View>
      <ChatThread
        key={consumerId}
        producer
        active={active}
        load={load}
        makeKey={newIdempotencyKey}
        read={(id) => messaging.producerRead(consumerId, id)}
        loadPhoto={privateImage}
        upload={(f) => uploadAttachment(f, { threadId: page?.thread.threadId })}
        send={async (text, ids, key) => {
          const r = await messaging.producerSend(
            consumerId,
            text,
            ids,
            selected,
            key,
          );
          setSelected([]);
          return r;
        }}
      >
        {page?.orders.length ? (
          <View
            style={{
              padding: 16,
              borderRadius: 18,
              backgroundColor: "white",
              gap: 8,
            }}
          >
            <T weight="bold">연결 주문</T>
            {page.orders.map((o) => (
              <T key={o.orderId} variant="sub">
                {o.productName} · {o.optionLabel} × {o.quantity} ·{" "}
                {ORDER_STATUS[o.status]}
              </T>
            ))}
          </View>
        ) : null}
        {page?.escalations
          ?.filter((e) => e.status === "OPEN")
          .map((e) => (
            <Checkbox
              key={e.escalationId}
              checked={selected.includes(e.escalationId)}
              onPress={() =>
                setSelected((ids) =>
                  !ids.includes(e.escalationId)
                    ? [...ids, e.escalationId]
                    : ids.filter((id) => id !== e.escalationId),
                )
              }
              label={`이 답변으로 해결: ${e.question}`}
            />
          ))}
        {page?.inquiries.map((i) => (
          <View
            key={i.inquiryId}
            style={{
              padding: 16,
              borderRadius: 18,
              backgroundColor: "white",
              gap: 8,
            }}
          >
            <T weight="semibold">
              주문 문의 · {i.status === "OPEN" ? "답변 필요" : "처리 완료"}
            </T>
            <T variant="sub">{i.text}</T>
            <T variant="caption" muted>
              처리 표시는 환불·보상 승인이 아니에요.
            </T>
            <Button
              label={i.status === "OPEN" ? "문의 처리 완료" : "문의 다시 열기"}
              variant="outline"
              onPress={async () => {
                try {
                  await messaging.inquiryStatus(
                    i.inquiryId,
                    i.status === "OPEN" ? "RESOLVED" : "OPEN",
                    i.version,
                  );
                  await load();
                } catch (e) {
                  setError(String(e));
                }
              }}
            />
          </View>
        ))}
      </ChatThread>
    </Screen>
  );
}
