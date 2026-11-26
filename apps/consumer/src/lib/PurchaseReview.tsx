import { engagement } from "@farmclub/api";
import { Button, Icon, Notice, Skeleton, T, focusRing, tokens } from "@farmclub/ui";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useEngagementSession } from "./engagementSession";
import { useFocusedAsync } from "./useFocusedAsync";

export function PurchaseReview({ orderId }: { orderId: string }) {
  const session = useEngagementSession();
  if (!session.valid()) return null;
  return <ReviewCard key={`${orderId}:${session.key}`} orderId={orderId} />;
}

function ReviewCard({ orderId }: { orderId: string }) {
  const session = useEngagementSession();
  const review = useFocusedAsync(() => engagement.getReview(orderId), [orderId, session.key]);
  const [stars, setStars] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { setStars(review.data?.stars ?? null); }, [review.data]);
  const save = async () => {
    if (!stars || lock.current || !session.valid()) return;
    lock.current = true; setBusy(true); setMessage(""); setError("");
    try {
      const result = await engagement.review(orderId, stars);
      if (!session.valid()) return;
      review.setData(() => result);
      setMessage("후기를 저장했어요");
    } catch (e) {
      if (session.valid()) setError(e instanceof Error ? e.message : "후기를 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      lock.current = false;
      if (session.valid()) setBusy(false);
    }
  };
  return (
    <View testID="purchase-review" style={{ marginHorizontal: tokens.space.gutter, marginTop: 24, padding: 16, backgroundColor: tokens.color.surface, borderRadius: tokens.radius.md, gap: 12 }}>
      <T variant="heading">첫 수확의 기쁨을 나눠 주세요</T>
      <T>직접 받은 상품은 어땠나요? 구매가 확정된 주문의 별점만 농가 온도에 반영해요.</T>
      {review.loading && !review.data ? <Skeleton width="100%" height={48} /> : null}
      {review.error ? <Notice title="저장된 후기를 불러오지 못했어요" tone="error" action={<Button label="후기 다시 불러오기" variant="text" onPress={() => void review.reload()} />} /> : null}
      {review.data && session.valid() ? <>
        <View accessibilityRole="radiogroup" accessibilityLabel="상품 별점" style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`${value}점`} accessibilityState={{ checked: stars === value, disabled: busy }} disabled={busy} onPress={() => { setStars(value); setMessage(""); setError(""); }} style={({ pressed, ...state }) => [{ flexGrow: 1, flexBasis: 48, minWidth: 48, minHeight: 56, alignItems: "center", justifyContent: "center", gap: 4, borderRadius: tokens.radius.sm, opacity: pressed ? 0.7 : 1, backgroundColor: stars === value ? tokens.color.background : undefined }, (state as { focused?: boolean }).focused && focusRing]}>
              <Icon name={stars && stars >= value ? "starFill" : "star"} size={24} color={stars && stars >= value ? tokens.color.accent : tokens.color.textMuted} />
              <T variant="sub">{value}점</T>
            </Pressable>
          ))}
        </View>
        <Button label={review.data.stars == null ? "후기 저장" : "후기 수정"} variant="outline" onPress={() => void save()} disabled={stars == null || stars === review.data.stars} loading={busy} />
      </> : null}
      {message ? <T color={tokens.color.accent} weight="semibold">{message}</T> : null}
      {error ? <T color={tokens.color.error}>{error}</T> : null}
    </View>
  );
}
