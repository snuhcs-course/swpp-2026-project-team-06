import type { ReactNode } from "react";
import {
  Modal,
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

// 웹 전용 흐림. react-native-web이 CSS로 그대로 넘긴다.
const glass = {
  backgroundColor: tokens.color.glass,
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
} as unknown as ViewStyle;
const sheetGlass = {
  backgroundColor: tokens.color.sheet,
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
} as unknown as ViewStyle;

/* ---------------- Header ---------------- */

type BarProps = {
  title?: string;
  onBack?: () => void;
  /** 닫기(X) 아이콘으로 */
  close?: boolean;
  right?: ReactNode;
  border?: boolean;
};

/** 할 일 화면 머리: 48 높이 바(뒤로 + 가운데 제목 17 굵게) */
export function HeaderBar({ title, onBack, close, right, border }: BarProps) {
  return (
    <View
      style={[
        styles.bar,
        border && {
          borderBottomWidth: 1,
          borderBottomColor: tokens.color.border,
        },
      ]}
    >
      {onBack ? (
        <IconButton
          icon={close ? "close" : "back"}
          label={close ? "닫기" : "뒤로"}
          onPress={onBack}
        />
      ) : (
        <View style={styles.side} />
      )}
      <T
        variant="body"
        weight="semibold"
        center
        style={{ flex: 1 }}
        numberOfLines={1}
      >
        {title ?? ""}
      </T>
      <View style={styles.side}>{right}</View>
    </View>
  );
}

/** 탭 첫 화면 머리: 왼쪽 정렬 큰 제목 34 */
export function LargeTitle({
  title,
  subtitle,
  style,
}: {
  title: string;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { paddingHorizontal: tokens.space.gutter, paddingTop: 56, gap: 8 },
        style,
      ]}
    >
      <T variant="title" accessibilityRole="header">
        {title}
      </T>
      {subtitle ? (
        <T variant="sub" muted>
          {subtitle}
        </T>
      ) : null}
    </View>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  onPhoto,
  size = 24,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  /** 사진 위 버튼: 검정 32% 원형 40 + 흰 아이콘 */
  onPhoto?: boolean;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(st) =>
        [
          styles.iconBtn,
          (st as { focused?: boolean }).focused && focusRing,
        ] as never
      }
    >
      {onPhoto ? (
        <View style={styles.photoBtn}>
          <Icon name={icon} size={22} color="#FFFFFF" />
        </View>
      ) : (
        <Icon name={icon} size={size} />
      )}
    </Pressable>
  );
}

/* ---------------- Tab bar ---------------- */

export type TabItem = {
  key: string;
  label: string;
  icon: IconName;
  active: boolean;
  badge?: number;
  onPress: () => void;
};

/** 떠 있는 둥근 탭 바: 좌우·아래 12(+안전 영역), 높이 64, 글자 15, 선택 탭만 면 색 알약 */
export function TabBar({ items }: { items: TabItem[] }) {
  return (
    <View pointerEvents="box-none" style={styles.tabWrap}>
      <View style={[styles.tabBar, glass]} accessibilityRole="tablist">
        {items.map((it) => (
          <Pressable
            key={it.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: it.active }}
            aria-selected={it.active}
            accessibilityLabel={
              it.badge ? `${it.label}, 안 읽음 ${it.badge}` : it.label
            }
            onPress={it.onPress}
            style={[
              styles.tab,
              it.active && { backgroundColor: tokens.color.surface },
            ]}
          >
            <Icon
              name={it.icon}
              color={it.active ? tokens.color.text : tokens.color.textMuted}
            />
            <T
              variant="caption"
              weight="semibold"
              color={it.active ? tokens.color.text : tokens.color.textMuted}
            >
              {it.label}
            </T>
            {it.badge ? (
              <View style={styles.tabBadge}>
                <Badge count={it.badge} />
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function Badge({ count }: { count: number }) {
  return (
    <View style={styles.badge}>
      <T
        variant="caption"
        weight="bold"
        color={tokens.color.onAccent}
        style={{ lineHeight: 20 }}
      >
        {count > 99 ? "99+" : String(count)}
      </T>
    </View>
  );
}

/* ---------------- Bottom bar ---------------- */

/** 하단 고정 바: 흰 반투명 + blur, 위 구분선. 요약 한 줄 + 버튼. */
export function BottomBar({
  summary,
  summaryRight,
  children,
}: {
  summary?: ReactNode;
  summaryRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={[styles.bottomBar, glass]}>
      {summary || summaryRight ? (
        <View style={styles.summary}>
          {typeof summary === "string" ? (
            <T variant="sub" muted style={{ flex: 1 }}>
              {summary}
            </T>
          ) : (
            summary
          )}
          {typeof summaryRight === "string" ? (
            <T variant="body" weight="bold">
              {summaryRight}
            </T>
          ) : (
            summaryRight
          )}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** 떠 있는 작성 버튼("+ 소식", "+ 새 상품"). 탭 바 위 오른쪽. */
export function Fab({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: pressed
            ? tokens.color.accentPressed
            : tokens.color.accent,
        },
      ]}
    >
      <Icon name="plus" size={22} color={tokens.color.onAccent} />
      <T variant="body" weight="semibold" color={tokens.color.onAccent}>
        {label}
      </T>
    </Pressable>
  );
}

/* ---------------- Sheet ---------------- */

/** 아래에서 올라오는 시트. 뒤 화면 위에 검정 40%. 제목 22. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="닫기"
          onPress={onClose}
        />
        <View style={[styles.sheet, sheetGlass]} accessibilityViewIsModal>
          <View style={styles.handle} />
          {title ? (
            <View style={styles.sheetHead}>
              <T variant="heading" style={{ flex: 1 }}>
                {title}
              </T>
              <IconButton icon="close" label="닫기" onPress={onClose} />
            </View>
          ) : null}
          <ScrollView
            style={{ maxHeight: 640 }}
            contentContainerStyle={{ gap: 12 }}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: tokens.height.header,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    backgroundColor: tokens.color.background,
  },
  side: { width: 48, alignItems: "flex-end" },
  iconBtn: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  photoBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: tokens.color.photoButton,
    alignItems: "center",
    justifyContent: "center",
  },
  tabWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: safe("bottom", 12),
    alignItems: "center",
  },
  tabBar: {
    width: "100%",
    maxWidth: tokens.maxWidth - 24,
    height: tokens.height.tabBar,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    height: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  tabBadge: { position: "absolute", top: 0, left: "50%", marginLeft: 8 },
  badge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: tokens.color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: tokens.space.gutter,
    paddingTop: 12,
    paddingBottom: safe("bottom", 28),
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    gap: 12,
  },
  summary: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  fab: {
    position: "absolute",
    right: 16,
    bottom: safe("bottom", 88),
    height: 56,
    paddingHorizontal: 24,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  overlay: {
    flex: 1,
    backgroundColor: tokens.color.overlay,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sheet: {
    width: "100%",
    maxWidth: tokens.maxWidth,
    borderTopLeftRadius: tokens.radius.md,
    borderTopRightRadius: tokens.radius.md,
    paddingHorizontal: tokens.space.gutter,
    paddingTop: 8,
    paddingBottom: safe("bottom", 28),
    gap: 12,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: tokens.color.border,
  },
  sheetHead: { flexDirection: "row", alignItems: "center" },
});
