import { ApiError, type OrderStatus } from "@farmclub/api";
import { Button, EmptyState, T, tokens } from "@farmclub/ui";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

export const TODAY = "2026-10-07";

export const ORDER_STATUS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "결제 전",
  RESERVED: "예약 완료",
  PREPARING: "출하 준비",
  SHIPPED: "출하",
  DELIVERED: "배송 완료",
  COMPLETED: "구매 확정",
  CANCELED: "취소됨",
  REFUNDED: "환불됨",
  PARTIALLY_REFUNDED: "일부 환불",
};

export const isStatus = (e: unknown, status: number) =>
  e instanceof ApiError && e.status === status;
export const errMsg = (e: unknown, fallback = "잠시 뒤 다시 시도해 주세요.") =>
  e instanceof ApiError ? e.message : fallback;
/** VALIDATION_ERROR details.fields */
export const fieldErrors = (e: unknown): Record<string, string> =>
  e instanceof ApiError &&
  e.details &&
  typeof e.details === "object" &&
  "fields" in e.details
    ? ((e.details as { fields: Record<string, string> }).fields ?? {})
    : {};

export function PhotoShade({
  height = 140,
  from = 0,
}: {
  height?: number;
  from?: number;
}) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[`rgba(0,0,0,${from})`, "rgba(0,0,0,0.6)"]}
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, height }}
    />
  );
}

/** 공통 권한 오류(403, WRONG_APP 아님) — design: s-403 */
export function Forbidden() {
  const router = useRouter();
  return (
    <EmptyState
      icon="lock"
      title="볼 수 없는 화면이에요"
      body="다른 계정의 주문이거나 열 수 없는 주소예요."
      action={
        <Button
          label="첫 화면으로"
          variant="outline"
          size="producer"
          onPress={() => router.replace("/")}
          style={{ marginTop: 12, alignSelf: "center", paddingHorizontal: 24 }}
        />
      }
    />
  );
}

export function LoadError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  if (error instanceof ApiError && error.status === 403) return <Forbidden />;
  return (
    <EmptyState
      icon={
        error instanceof ApiError && error.status === 0 ? "offline" : "alert"
      }
      title="불러오지 못했어요"
      body={errMsg(error)}
      action={
        <Button
          label="다시 시도"
          variant="outline"
          size="producer"
          onPress={onRetry}
          style={{ marginTop: 12, alignSelf: "center", paddingHorizontal: 24 }}
        />
      }
    />
  );
}

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
      <T variant="caption" muted weight="semibold" style={{ marginLeft: 8 }}>
        농가용
      </T>
    </View>
  );
}

/** Mock 전용 개발 상자(점선). 실제 서비스에는 없다. */
export function DevBox({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: tokens.color.textMuted,
        borderRadius: tokens.radius.md,
        padding: 16,
        gap: 8,
      }}
    >
      <T variant="caption" muted weight="semibold">
        개발용 · {title}
      </T>
      {children}
    </View>
  );
}

/** 필드 모양 버튼(날짜·옵션처럼 시트에서 고르는 값) */
export function FieldButton({
  label,
  value,
  placeholder,
  error,
  right,
  onPress,
  hideLabel,
}: {
  label: string;
  value: string;
  placeholder?: string;
  error?: string;
  right?: string;
  onPress: () => void;
  hideLabel?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      {hideLabel ? null : (
        <T variant="sub" weight="semibold">
          {label}
        </T>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || "비어 있음"}`}
        onPress={onPress}
        style={{
          height: 48,
          borderRadius: tokens.radius.sm,
          borderWidth: error ? 1.5 : 1,
          borderColor: error ? tokens.color.error : tokens.color.border,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          backgroundColor: tokens.color.background,
        }}
      >
        <T
          variant="body"
          muted={!value}
          numberOfLines={1}
          style={{ fontSize: tokens.fontSize.input, flexShrink: 1 }}
        >
          {value || placeholder || ""}
        </T>
        {right ? (
          <T variant="sub" weight="semibold">
            {right}
          </T>
        ) : null}
      </Pressable>
      {error ? (
        <T variant="sub" color={tokens.color.error}>
          {error}
        </T>
      ) : null}
    </View>
  );
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
