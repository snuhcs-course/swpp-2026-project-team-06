import { RoomMedia } from "@farmclub/ui";
// 소비자 앱 화면에서 여러 번 쓰는 조각
import { ApiError, type NewsItem, type ProductDetail } from "@farmclub/api";
import {
  Button,
  EmptyState,
  HeaderBar,
  Icon,
  Photo,
  Screen,
  Sheet,
  T,
  md,
  tokens,
  won,
} from "@farmclub/ui";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  Linking,
  Platform,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";

/** 사진 아래쪽을 어둡게 (흰 글씨를 얹을 때) */
export function PhotoShade({ height = 240 }: { height?: number }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.64)"]}
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, height }}
    />
  );
}

/** 원형 아바타(썸네일 40, D-09). 사진이 없으면 농가=집, 사람=이니셜 자리 표시(D-10) */
export function Avatar({
  uri,
  size = tokens.thumb.avatar,
  kind = "farm",
  name,
}: {
  uri: string | null | undefined;
  size?: number;
  kind?: "farm" | "person";
  name?: string;
}) {
  return (
    <Photo
      uri={uri}
      width={size}
      height={size}
      radius={999}
      kind={kind}
      name={name}
      alt={name}
    />
  );
}

/** 소식 사진 7:4(D-09). 좌우 여백 20을 뺀 폭 기준 */
export function useNewsPhotoHeight() {
  const { width } = useWindowDimensions();
  const w = Math.min(width, tokens.maxWidth) - tokens.space.gutter * 2;
  return Math.round((w * 4) / 7);
}

/** 소식 카드(좋아요 포함). 농가 이름 줄은 showFarm일 때만 */
export function NewsCard({
  item,
  showFarm,
  onLike,
  onAsk,
  onFarm,
  first,
}: {
  item: NewsItem;
  showFarm?: boolean;
  onLike: () => void;
  onAsk?: () => void;
  onFarm?: () => void;
  first?: boolean;
}) {
  const photoH = useNewsPhotoHeight();
  return (
    <View
      style={{
        gap: 12,
        paddingVertical: 20,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: tokens.color.border,
      }}
    >
      {showFarm ? (
        <Pressable
          accessibilityRole="link"
          onPress={onFarm}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            minHeight: 48,
          }}
        >
          <Avatar uri={item.farmPhoto} name={item.farmName} />
          <T variant="sub" weight="semibold">
            {item.farmName}
          </T>
          <T variant="caption" muted>
            {md(item.createdAt)} ·{" "}
            {item.visibility === "PUBLIC" ? "공개" : "팔로워 전용"}
          </T>
        </Pressable>
      ) : (
        <T variant="caption" muted>
          {md(item.createdAt)}
          {item.visibility === "FOLLOWERS" ? " · 팔로워 전용" : ""}
        </T>
      )}
      {item.photos.map((uri) =>
        /\.(mp4|webm)$/.test(uri) ? (
          <RoomMedia key={uri} uri={uri} />
        ) : (
          <Photo
            key={uri}
            uri={uri}
            width="100%"
            height={photoH}
            alt={item.body.slice(0, 20)}
          />
        ),
      )}
      <T variant="body">{item.body}</T>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <LikeButton
          count={item.reactionCount}
          on={item.myReaction}
          onPress={onLike}
        />
        {onAsk ? (
          <Button
            label="질문하기"
            variant="text"
            onPress={onAsk}
            style={{ marginLeft: "auto" }}
          />
        ) : null}
      </View>
    </View>
  );
}

export function LikeButton({
  count,
  on,
  onPress,
}: {
  count: number;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`좋아요 ${count}${on ? ", 내가 누름" : ""}`}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minHeight: 48,
        paddingRight: 8,
      }}
    >
      <Icon
        name={on ? "heartFill" : "heart"}
        color={on ? tokens.color.text : tokens.color.textMuted}
      />
      <T variant="sub" weight="semibold" muted={!on}>
        좋아요 {count}
      </T>
    </Pressable>
  );
}

/** 옵션·수량 시트 (SCR-04 → SCR-10) */
export function OptionSheet({
  visible,
  product,
  optionId,
  quantity,
  onChange,
  onClose,
  onSubmit,
  submitLabel = "주문서로",
}: {
  visible: boolean;
  product: ProductDetail | null;
  optionId: string;
  quantity: number;
  onChange: (optionId: string, quantity: number) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel?: string;
}) {
  if (!product) return null;
  const stage = product.stages.find(
    (s) => s.stageId === product.currentStageId,
  );
  const price = stage?.options[optionId]?.price ?? 0;
  const selected = stage?.options[optionId];
  const max = Math.min(
    product.maxQuantityPerOrder,
    Math.floor(
      product.remainingGrams /
        ((product.options.find((o) => o.optionId === optionId)?.weightKg ??
          Infinity) *
          1000),
    ),
    selected ? selected.quantity - selected.reservedCount : 0,
  );
  return (
    <Sheet visible={visible} onClose={onClose} title="옵션과 수량">
      <View>
        {product.options.map((o) => {
          const on = o.optionId === optionId;
          const p = stage?.options[o.optionId];
          const left = p
            ? Math.min(
                Math.floor(product.remainingGrams / (o.weightKg * 1000)),
                p.quantity - p.reservedCount,
              )
            : 0;
          return (
            <Pressable
              key={o.optionId}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: left <= 0 }}
              disabled={left <= 0}
              onPress={() =>
                onChange(
                  o.optionId,
                  Math.max(
                    1,
                    Math.min(quantity, product.maxQuantityPerOrder, left),
                  ),
                )
              }
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                minHeight: 60,
                borderTopWidth: 1,
                borderTopColor: tokens.color.border,
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <View style={{ width: 24 }}>
                  {on ? <Icon name="check" /> : null}
                </View>
                <T
                  variant="body"
                  weight={on ? "semibold" : "regular"}
                  muted={left <= 0}
                >
                  {o.label}
                </T>
                {o.note ? (
                  <T variant="sub" muted>
                    {o.note}
                  </T>
                ) : null}
              </View>
              <T
                variant="body"
                weight={on ? "bold" : "regular"}
                muted={left <= 0}
              >
                {left <= 0 ? "품절" : won(p?.price)}
              </T>
            </Pressable>
          );
        })}
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderTopWidth: 1,
          borderTopColor: tokens.color.border,
          paddingTop: 12,
        }}
      >
        <View>
          <T variant="body" weight="semibold">
            수량
          </T>
          <T variant="caption" muted>
            한 번에 최대 {max}개
          </T>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Stepper
            label="빼기"
            text="−"
            disabled={quantity <= 1}
            onPress={() => onChange(optionId, quantity - 1)}
          />
          <T
            variant="body"
            weight="bold"
            style={{ width: 40, textAlign: "center" }}
          >
            {quantity}
          </T>
          <Stepper
            label="더하기"
            text="+"
            disabled={quantity >= max}
            onPress={() => onChange(optionId, quantity + 1)}
          />
        </View>
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <T variant="sub" muted>
          {product.options.find((o) => o.optionId === optionId)?.label} ×{" "}
          {quantity} ·{" "}
          {product.shippingFeeType === "FREE"
            ? "무료배송"
            : `배송비 ${won(product.shippingFee)}`}
        </T>
        <T variant="body" weight="bold">
          {won(price * quantity)}
        </T>
      </View>
      <Button
        label={submitLabel}
        onPress={onSubmit}
        disabled={product.soldOut || quantity < 1 || quantity > max}
      />
    </Sheet>
  );
}

function Stepper({
  label,
  text,
  disabled,
  onPress,
}: {
  label: string;
  text: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 48,
        height: 48,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: tokens.color.border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <T variant="heading" weight="regular" muted={disabled}>
        {text}
      </T>
    </Pressable>
  );
}

/** 불러오기 실패: 원인 + 다시 시도 */
export function LoadError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const msg =
    error instanceof ApiError ? error.message : "잠시 뒤 다시 시도해 주세요.";
  return (
    <EmptyState
      icon={
        error instanceof ApiError && error.status === 0 ? "offline" : "alert"
      }
      title="불러오지 못했어요"
      body={msg}
      action={
        <Button
          label="다시 시도"
          variant="outline"
          onPress={onRetry}
          style={{ marginTop: 12, alignSelf: "center" }}
        />
      }
    />
  );
}

/** 공통 · 권한 오류 (S-403) */
export function Forbidden() {
  const router = useRouter();
  return (
    <Screen>
      <HeaderBar
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/")
        }
      />
      <View style={{ paddingTop: 64 }}>
        <EmptyState
          icon="lock"
          title="볼 수 없는 화면이에요"
          body="다른 계정의 주문이거나 열 수 없는 주소예요."
          action={
            <Button
              label="첫 화면으로"
              variant="outline"
              onPress={() => router.replace("/")}
              style={{ marginTop: 12, alignSelf: "center" }}
            />
          }
        />
      </View>
    </Screen>
  );
}

export const isStatus = (e: unknown, status: number) =>
  e instanceof ApiError && e.status === status;

/** 웹 공유: 클립보드 복사 */
export async function copyText(text: string) {
  try {
    await (
      globalThis as {
        navigator?: { clipboard?: { writeText: (t: string) => Promise<void> } };
      }
    ).navigator?.clipboard?.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** 바깥 주소 열기. 웹은 새 창(window.open), 앱은 Linking */
export function openExternal(url: string) {
  if (Platform.OS === "web") {
    const w = (
      globalThis as { open?: (u: string, t?: string, f?: string) => unknown }
    ).open;
    if (w) {
      w(url, "_blank", "noopener");
      return;
    }
  }
  void Linking.openURL(url);
}

/** 워드마크: farmclub 700 · 자간 -0.03em · 강조색 점 */
export function Wordmark() {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
      <T
        variant="body"
        weight="bold"
        style={{ fontSize: 20, lineHeight: 22, letterSpacing: -0.6 }}
      >
        farmclub
      </T>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          backgroundColor: tokens.color.accent,
          marginLeft: 4,
          marginBottom: 4,
        }}
      />
    </View>
  );
}
