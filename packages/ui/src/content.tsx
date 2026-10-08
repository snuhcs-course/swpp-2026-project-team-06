import { useEffect, type ReactNode } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { Icon, type IconName } from "./Icon";
import { T } from "./Text";
import { tokens } from "./tokens";
import { focusRing, safe } from "./web";

/* ---------------- Screen ---------------- */

/** 화면 바탕. 데스크톱에서는 최대 폭 480으로 가운데, 바깥은 면색(D-04). fullBleed가 아니면 위 안전 영역만큼 내린다(D-24). */
export function Screen({
  children,
  style,
  fullBleed,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  fullBleed?: boolean;
}) {
  return (
    <View style={styles.outer}>
      <View
        style={[
          styles.screen,
          !fullBleed && { paddingTop: safe("top", 0) },
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

/** 스크롤 영역. bottom = 아래 여백(탭 바 96, 하단 바 140 등) */
export function Scroll({
  children,
  bottom = 40,
  gap,
}: {
  children: ReactNode;
  bottom?: number;
  gap?: number;
}) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: bottom, gap }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

/** bleed: 가로 스크롤처럼 내용은 화면 끝까지, 제목만 좌우 여백 20 */
export function Section({
  title,
  right,
  children,
  style,
  bleed,
}: {
  title?: string;
  right?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  bleed?: boolean;
}) {
  return (
    <View
      style={[
        {
          paddingHorizontal: bleed ? 0 : tokens.space.gutter,
          paddingTop: tokens.space.section,
          gap: 12,
        },
        style,
      ]}
    >
      {title ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            justifyContent: "space-between",
            paddingHorizontal: bleed ? tokens.space.gutter : 0,
          }}
        >
          <T variant="heading" accessibilityRole="header">
            {title}
          </T>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[{ height: 1, backgroundColor: tokens.color.border }, style]}
    />
  );
}

/* ---------------- Chip ---------------- */

/** 칩은 D-day·품절만 */
export function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <T variant="caption" weight="semibold">
        {label}
      </T>
    </View>
  );
}

/* ---------------- Photo ---------------- */

/** 사진. 없으면 자리 표시(D-10): 면색 + 보조색 아이콘(상품 = 감귤, 농가 = 집, 사람 = 이름 첫 글자) */
export function Photo({
  uri,
  width,
  height,
  radius = tokens.radius.md,
  dim,
  alt,
  style,
  kind = "product",
  name,
}: {
  uri?: string | null;
  width: number | "100%";
  height: number;
  radius?: number;
  dim?: boolean;
  alt?: string;
  style?: StyleProp<ViewStyle>;
  kind?: "product" | "farm" | "person";
  name?: string;
}) {
  const ph = Math.max(20, Math.min(40, Math.round(height * 0.32)));
  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          overflow: "hidden",
          backgroundColor: tokens.color.surface,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {!uri ? (
        kind === "person" ? (
          <T variant="sub" weight="bold" muted accessibilityRole="text">
            {(name ?? "?").slice(0, 1)}
          </T>
        ) : (
          <View accessibilityLabel={alt ? `${alt} 사진 없음` : "사진 없음"}>
            <Icon
              name={kind === "farm" ? "home" : "citrus"}
              size={ph}
              color={tokens.color.textMuted}
            />
          </View>
        )
      ) : null}
      {uri ? (
        <Image
          source={{ uri }}
          accessibilityLabel={alt}
          resizeMode="cover"
          style={[
            { width: "100%", height: "100%" },
            dim && ({ opacity: 0.5, filter: "grayscale(1)" } as never),
          ]}
        />
      ) : null}
    </View>
  );
}

/* ---------------- Product row ---------------- */

export type ProductRowProps = {
  photo?: string | null;
  name: string;
  sub?: string;
  price?: string;
  /** D-day 또는 품절 */
  chip?: string;
  /** 칩 옆 보조 문구(품절 시 다음 단계 날짜 등) */
  chipNote?: string;
  /** "37명 예약" 13 보조 글자, 오른쪽 아래 */
  reserved?: string;
  dim?: boolean;
  /** 사진 크기: 104 기본, 88 목록 */
  photoSize?: number;
  onPress?: () => void;
  status?: ReactNode;
  first?: boolean;
};

/** 상품 행: 사진 104 정사각(모서리 16), 상품명 17 최대 2줄, 보조 15, 가격 17 굵게 + 칩, 예약 수 13 */
export function ProductRow({
  photo,
  name,
  sub,
  price,
  chip,
  chipNote,
  reserved,
  dim,
  photoSize = 104,
  onPress,
  status,
  first,
}: ProductRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.prow, !first && styles.prowBorder]}
    >
      <Photo
        uri={photo}
        width={photoSize}
        height={photoSize}
        dim={dim}
        alt={name}
      />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <T variant="body" weight="semibold" numberOfLines={2}>
          {name}
        </T>
        {status}
        {sub ? (
          <T variant="sub" muted numberOfLines={1}>
            {sub}
          </T>
        ) : null}
        {price || chip ? (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              marginTop: 4,
            }}
          >
            {price ? (
              <T variant="body" weight="bold">
                {price}
              </T>
            ) : null}
            {chip ? <Chip label={chip} /> : null}
          </View>
        ) : null}
        {chipNote ? (
          <T variant="caption" muted>
            {chipNote}
          </T>
        ) : null}
        {reserved ? (
          <T variant="caption" muted>
            {reserved}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
}

/* ---------------- List row ---------------- */

export function ListRow({
  label,
  value,
  sub,
  onPress,
  chevron = true,
  icon,
  last,
  right,
}: {
  label: string;
  value?: string;
  sub?: string;
  onPress?: () => void;
  chevron?: boolean;
  icon?: IconName;
  last?: boolean;
  right?: ReactNode;
}) {
  const content = (
    <>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant="body" weight={value ? "regular" : "semibold"}>
          {label}
        </T>
        {sub ? (
          <T variant="sub" muted numberOfLines={2}>
            {sub}
          </T>
        ) : null}
      </View>
      {value ? (
        <T
          variant="body"
          numberOfLines={1}
          style={{ flexShrink: 1, textAlign: "right" }}
        >
          {value}
        </T>
      ) : null}
      {right}
      {onPress && chevron ? (
        <Icon
          name={icon ?? "chevron"}
          size={20}
          color={tokens.color.textMuted}
        />
      ) : null}
    </>
  );
  const style = [styles.lrow, last && styles.lrowLast];
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={style}>
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}

/* ---------------- Segmented ---------------- */

export function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <View style={styles.seg} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on }}
            aria-selected={on}
            onPress={() => onChange(o.value)}
            style={[
              styles.segItem,
              on && { backgroundColor: tokens.color.background },
            ]}
          >
            <T variant="sub" weight="semibold" muted={!on}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------------- Checkbox / Radio ---------------- */

export function Checkbox({
  checked,
  onPress,
  label,
  children,
}: {
  checked: boolean;
  onPress?: () => void;
  label?: string;
  children?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        flexDirection: "row",
        gap: 12,
        alignItems: "flex-start",
        minHeight: 48,
      }}
    >
      <View
        style={[
          styles.cb,
          checked
            ? { backgroundColor: tokens.color.text }
            : { borderWidth: 1.5, borderColor: tokens.color.textMuted },
        ]}
      >
        {checked ? <Icon name="check" size={16} color="#FFFFFF" /> : null}
      </View>
      <View style={{ flex: 1 }}>
        {children ?? (label ? <T variant="body">{label}</T> : null)}
      </View>
    </Pressable>
  );
}

export function Radio({ selected }: { selected: boolean }) {
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 999,
        borderWidth: selected ? 7 : 1.5,
        borderColor: selected ? tokens.color.text : tokens.color.textMuted,
      }}
    />
  );
}

/* ---------------- Stage bar ---------------- */

export type StageCell = {
  label: string;
  price: string;
  date: string;
  current: boolean;
};

/** 단계 막대: 칸마다 세 줄(단계/가격/날짜), 같은 너비 */
export function StageBar({ stages }: { stages: StageCell[] }) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {stages.map((s) => (
        <View key={s.label} style={{ flex: 1, gap: 8, minWidth: 0 }}>
          <View
            style={{
              height: 4,
              borderRadius: 999,
              backgroundColor: s.current
                ? tokens.color.text
                : tokens.color.border,
            }}
          />
          <View>
            <T
              variant="caption"
              weight="semibold"
              muted={!s.current}
              numberOfLines={1}
            >
              {s.label}
            </T>
            <T variant="caption" muted={!s.current} numberOfLines={1}>
              {s.price}
            </T>
            <T variant="caption" muted numberOfLines={1}>
              {s.date}
            </T>
          </View>
        </View>
      ))}
    </View>
  );
}

/* ---------------- Empty / Skeleton / Toast / Notice ---------------- */

export function EmptyState({
  icon,
  title,
  body,
  action,
  big,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
  big?: boolean;
}) {
  return (
    <View
      style={{
        paddingTop: 56,
        paddingHorizontal: 32,
        alignItems: "center",
        gap: 8,
      }}
    >
      {icon ? (
        <Icon name={icon} size={40} color={tokens.color.textMuted} />
      ) : null}
      <T variant="body" weight="semibold" center>
        {title}
      </T>
      {body ? (
        <T variant="sub" muted center>
          {body}
        </T>
      ) : null}
      {action}
      {big ? null : null}
    </View>
  );
}

export function Skeleton({
  width,
  height,
  radius = tokens.radius.sm,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      accessibilityLabel="불러오는 중"
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: tokens.color.surface,
        },
        style,
      ]}
    />
  );
}

/** 짧은 알림: 검정 알약 48, 글자 17, 2초(D-19). tone="error"는 공통 오류 ‘연결이 불안정해요’ + 다시 시도(4초) */
export function Toast({
  message,
  onHide,
  tone = "success",
  onRetry,
  bottom = 168,
}: {
  message: string | null;
  onHide: () => void;
  tone?: "success" | "error";
  onRetry?: () => void;
  bottom?: number;
}) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onHide, tone === "error" ? 4000 : 2000);
    return () => clearTimeout(t);
  }, [message, onHide, tone]);
  if (!message) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.toastWrap, { bottom: safe("bottom", bottom) }]}
      accessibilityLiveRegion="polite"
    >
      <View
        style={[styles.toast, onRetry && { paddingRight: 8 }]}
        accessibilityRole="alert"
      >
        <Icon
          name={tone === "error" ? "alert" : "check"}
          size={20}
          color="#FFFFFF"
        />
        <T variant="body" weight="semibold" color="#FFFFFF">
          {message}
        </T>
        {onRetry ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onHide();
              onRetry();
            }}
            style={(st) =>
              [
                {
                  minWidth: 48,
                  minHeight: 48,
                  paddingHorizontal: 12,
                  alignItems: "center",
                  justifyContent: "center",
                },
                (st as { focused?: boolean }).focused && focusRing,
              ] as never
            }
          >
            <T
              variant="body"
              weight="semibold"
              color="#FFFFFF"
              style={{ textDecorationLine: "underline" }}
            >
              다시 시도
            </T>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** 팔로우 토글(D-01): 팔로우 전은 강조색, 팔로잉은 면색 + 체크. 다시 누르면 확인 없이 끊는다(토스트는 부르는 쪽) */
export function FollowButton({
  following,
  onPress,
  loading,
  style,
}: {
  following: boolean;
  onPress: () => void;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: following, busy: loading }}
      accessibilityLabel={
        following ? "팔로잉, 누르면 팔로우를 끊어요" : "팔로우"
      }
      disabled={loading}
      onPress={onPress}
      style={({ pressed, ...st }) =>
        [
          styles.follow,
          following
            ? { backgroundColor: tokens.color.surface }
            : {
                backgroundColor: pressed
                  ? tokens.color.accentPressed
                  : tokens.color.accent,
              },
          (st as { focused?: boolean }).focused && focusRing,
          style,
        ] as never
      }
    >
      {following ? (
        <Icon name="check" size={20} color={tokens.color.text} />
      ) : null}
      <T
        variant="body"
        weight="semibold"
        color={following ? tokens.color.text : tokens.color.onAccent}
      >
        {following ? "팔로잉" : "팔로우"}
      </T>
    </Pressable>
  );
}

/** 면 색 안내 상자(오류·변경 안내). tone=error면 제목을 오류색으로 */
export function Notice({
  title,
  body,
  tone,
  action,
  style,
}: {
  title: string;
  body?: string;
  tone?: "error";
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View accessibilityRole="alert" style={[styles.notice, style]}>
      <T
        variant="body"
        weight="bold"
        color={tone === "error" ? tokens.color.error : undefined}
      >
        {title}
      </T>
      {body ? <T variant="sub">{body}</T> : null}
      {action}
    </View>
  );
}

/** 테스트 서비스 띠 */
export function TestBand({ text }: { text: string }) {
  return (
    <View
      style={{
        minHeight: 48,
        justifyContent: "center",
        paddingHorizontal: tokens.space.gutter,
        backgroundColor: tokens.color.surface,
      }}
    >
      <T variant="sub">{text}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: tokens.color.surface,
    alignItems: "center",
  },
  screen: {
    flex: 1,
    width: "100%",
    maxWidth: tokens.maxWidth,
    backgroundColor: tokens.color.background,
    overflow: "hidden",
  },
  chip: {
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: tokens.color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  prow: {
    flexDirection: "row",
    gap: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  prowBorder: { borderTopWidth: 1, borderTopColor: tokens.color.border },
  lrow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
  },
  lrowLast: { borderBottomWidth: 1, borderBottomColor: tokens.color.border },
  seg: {
    flexDirection: "row",
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.sm,
    padding: 4,
  },
  segItem: {
    flex: 1,
    height: 48,
    borderRadius: tokens.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  cb: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  toastWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  follow: {
    flex: 1,
    height: tokens.height.button,
    borderRadius: tokens.radius.md,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: tokens.color.text,
  },
  notice: {
    padding: 16,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface,
    gap: 4,
  },
});
