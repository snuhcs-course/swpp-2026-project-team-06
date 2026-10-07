import {
  orders,
  messaging,
  newIdempotencyKey,
  uploadAttachment,
  privateImage,
  type Inquiry,
} from "@farmclub/api";
import {
  Button,
  HeaderBar,
  Input,
  PrivatePhotos,
  Screen,
  Scroll,
  Segmented,
  T,
  tokens,
  useAsync,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import { useHideTabBar } from "../../../../lib/session";
export default function InquiryForm() {
  useHideTabBar();
  const { orderId } = useLocalSearchParams<{ orderId: string }>(),
    router = useRouter(),
    order = useAsync(() => orders.get(orderId), [orderId]);
  const [type, setType] = useState<Inquiry["type"]>("DAMAGE"),
    [text, setText] = useState(""),
    [ids, setIds] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    pending = useRef<{ body: string; key: string } | null>(null);
  async function submit() {
    if (busy || uploading || !order.data) return;
    setBusy(true);
    setError("");
    const body = JSON.stringify({ type, text, ids });
    if (pending.current?.body !== body)
      pending.current = { body, key: newIdempotencyKey() };
    try {
      await messaging.createInquiry(
        orderId,
        type,
        text,
        ids,
        pending.current.key,
      );
      router.replace({
        pathname: "/chats/[farmId]",
        params: { farmId: order.data.farmId, orderId },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "접수하지 못했어요");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <HeaderBar title="주문 문제 문의" onBack={() => router.back()} />
      <Scroll>
        <View style={{ padding: 20, gap: 24 }}>
          <View
            style={{
              padding: 20,
              borderRadius: 20,
              backgroundColor: "#F3F0E8",
              gap: 8,
            }}
          >
            <T variant="heading">농가에 알려 주세요</T>
            <T>{order.data?.productName ?? "주문 불러오는 중…"}</T>
            <T variant="sub" muted>
              {order.data
                ? `${order.data.optionLabel} × ${order.data.quantity} · ${order.data.orderNo}`
                : ""}
            </T>
          </View>
          <Segmented
            value={type}
            onChange={(v) => setType(v as Inquiry["type"])}
            options={[
              { value: "DAMAGE", label: "파손" },
              { value: "CONDITION", label: "상태" },
              { value: "TASTE", label: "맛" },
              { value: "OTHER", label: "기타" },
            ]}
          />
          <Input
            label="어떤 점이 불편하셨나요?"
            value={text}
            onChangeText={setText}
            multiline
            height={180}
            maxLength={1000}
            counter
            placeholder="받으신 상품의 상태와 문의 내용을 알려 주세요"
          />
          <PrivatePhotos
            ids={ids}
            onChange={setIds}
            upload={(f) => uploadAttachment(f, { orderId })}
            load={privateImage}
            disabled={busy}
            onBusy={setUploading}
          />
          <T variant="caption" muted>
            사진은 나와 해당 농가만 볼 수 있어요. 문의는 1:1 채팅으로 전달되며,
            환불·보상은 별도 확인이 필요해요.
          </T>
          {error || order.error ? (
            <T color={tokens.color.error}>{error || String(order.error)}</T>
          ) : null}
          <Button
            label="농가에 문의 보내기"
            loading={busy}
            disabled={uploading || !text.trim() || !order.data?.paidAt}
            onPress={submit}
          />
        </View>
      </Scroll>
    </Screen>
  );
}
