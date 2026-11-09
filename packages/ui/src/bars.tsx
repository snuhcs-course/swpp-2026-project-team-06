import { useCallback, useEffect, useState, type ReactNode } from "react";
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
import { useKeyboardShown } from "./keyboard";
import { leaveSheet, sheetAnimation } from "./sheetLeave";
import { T } from "./Text";
import { tokens } from "./tokens";
import { focusRing, safe, showFocus } from "./web";

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
  rightWidth?: number;
  border?: boolean;
};

/** 하위 화면 머리: 높이 56, ‹ + 왼쪽 18 굵은 제목(가운데 제목은 쓰지 않는다, DEV-293). 뒤로가 없으면 제목이 왼쪽 시작선 16에서 시작한다 */
export function HeaderBar({ title, onBack, close, right, rightWidth = 48, border }: BarProps) {
  return (
    <View
      style={[
        styles.bar,
        !onBack && { paddingLeft: tokens.space.gutter },
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
      ) : null}
      <T
        variant="heading"
        accessibilityRole={title ? "header" : undefined}
        style={{ flex: 1 }}
        numberOfLines={1}
      >
        {title ?? ""}
      </T>
      <View style={[styles.side, { width: rightWidth }]}>{right}</View>
    </View>
  );
}

/** 탭 첫 화면 머리: 높이 56, 왼쪽 22 굵은 제목(DEV-293). subtitle은 예전 호출부 호환용이고 새 화면은 넘기지 않는다(부제 삭제) */
export function LargeTitle({
  title,
  subtitle,
  right,
  style,
}: {
  title: string;
  subtitle?: string;
  /** 제목 줄 오른쪽(예: 도움말 버튼) */
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ paddingHorizontal: tokens.space.gutter }, style]}>
      <View
        style={{
          minHeight: tokens.height.header,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <T variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </T>
        {right}
      </View>
      {subtitle ? (
        <T variant="sub" muted style={{ paddingBottom: 8 }}>
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
  testID,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  testID?: string;
  /** 사진 위 버튼: 검정 45% 원형 40 + 흰 아이콘(`tokens.color.photoOverlay`) */
  onPhoto?: boolean;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={(st) =>
        [
          styles.iconBtn,
          showFocus(st as { focused?: boolean }) && focusRing,
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
  testID?: string;
};

/** 고정 4탭: 전체 너비, 높이 72 + 안전 영역, 선택 아이콘/라벨 주황. */
export function TabBar({ items }: { items: TabItem[] }) {
  // Android 앱에서 키보드가 떠 있으면 숨긴다: 루트가 키보드만큼 올라가 탭 바가 입력칸을 가린다(DEV-205). 웹은 언제나 보인다
  if (useKeyboardShown()) return null;
  return (
    <View pointerEvents="box-none" style={styles.tabWrap}>
      <View style={styles.tabBar} accessibilityRole="tablist">
        {items.map((it) => (
          <Pressable
            key={it.key}
            accessibilityRole="tab"
            aria-selected={it.active}
            accessibilityLabel={
              it.badge ? `${it.label}, 안 읽음 ${it.badge}` : it.label
            }
            onPress={it.onPress}
            testID={it.testID}
            style={[styles.tab]}
          >
            <Icon
              name={it.icon}
              color={it.active ? tokens.color.accent : tokens.color.textMuted}
            />
            <T
              variant="caption"
              weight="semibold"
              color={it.active ? tokens.color.accent : tokens.color.textMuted}
              numberOfLines={1}
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
        numberOfLines={1}
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
  aboveTabs = false,
}: {
  summary?: ReactNode;
  summaryRight?: ReactNode;
  children: ReactNode;
  aboveTabs?: boolean;
}) {
  // TabBar와 같은 이유로 Android 앱에서 키보드가 떠 있는 동안 숨긴다(DEV-205). 웹은 언제나 보인다
  if (useKeyboardShown()) return null;
  return (
    <View
      style={[
        styles.bottomBar,
        glass,
        aboveTabs && {
          bottom: safe("bottom", tokens.height.tabBar),
          paddingBottom: 16,
        },
      ]}
    >
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
            <T
              variant="body"
              weight="bold"
              numberOfLines={1}
              style={{ flexShrink: 0 }}
            >
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

/** 떠 있는 작성 버튼("+ 소식", "+ 새 상품"). 탭 바 위 오른쪽 16, 높이 52. */
export function Fab({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
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

/**
 * 시트 안 버튼으로 다른 화면으로 갈 때 쓴다(DEV-225). `leave(close, go)`는 시트를 애니메이션 없이 닫고
 * 같은 틱에 이동하므로 새 화면 위에 시트가 남지 않는다. `instant`를 그 시트의 `Sheet`에 넘긴다.
 * 닫힌 뒤 바로 꺼지므로 다음에 열 때는 그대로 아래에서 올라온다.
 */
export function useSheetLeave() {
  const [instant, setInstant] = useState(false);
  useEffect(() => {
    if (instant) setInstant(false);
  }, [instant]);
  const leave = useCallback(
    (close: () => void, go: () => void) =>
      leaveSheet(() => setInstant(true), close, go),
    [],
  );
  return { instant, leave };
}

/** 아래에서 올라오는 시트. 뒤 화면 위에 검정 40%. 제목 18(heading). */
export function Sheet({
  visible,
  onClose,
  title,
  instant,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** 다른 화면으로 가며 닫을 때 애니메이션 없이 바로 닫는다. `useSheetLeave().instant`를 넘긴다 */
  instant?: boolean;
  children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType={sheetAnimation(instant)}
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

/* ---------------- PeekSheet ---------------- */

/**
 * 화면 아래에 붙어 있는 시트. 닫혀 있어도 peek 줄과 footer(하단 버튼)는 늘 보이고,
 * 손잡이·peek을 누르면 children이 펼쳐진다. 펼친 동안만 뒤 화면을 어둡게 가린다.
 */
export function PeekSheet({
  hideClosedPeek = false,
  open,
  onOpenChange,
  peek,
  footer,
  label,
  children,
}: {
  hideClosedPeek?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  peek: ReactNode;
  footer?: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      {open ? (
        <Pressable
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: tokens.color.overlay },
          ]}
          // 바깥을 눌러 접는 영역. 손잡이 버튼과 이름이 겹치지 않게 보조기기에는 숨긴다.
          accessible={false}
          aria-hidden
          onPress={() => onOpenChange(false)}
        />
      ) : null}
      <View
        testID="peek-sheet"
        style={[styles.peekSheet, sheetGlass, hideClosedPeek && !open ? { borderTopLeftRadius: 0, borderTopRightRadius: 0, backgroundColor: tokens.color.background, shadowOpacity: 0 } : undefined]}
        accessibilityViewIsModal={open}
      >
        {open || !hideClosedPeek ? <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? `${label} 접기` : `${label} 펼치기`}
          aria-expanded={open}
          onPress={() => onOpenChange(!open)}
          style={(st) => [
            { paddingTop: 8, paddingBottom: 4, gap: 10 },
            showFocus(st as { focused?: boolean }) && focusRing,
          ]}
        >
          <View style={styles.handle} />
          {peek}
        </Pressable> : null}
        {/* 접혀도 내용은 마운트해 둔다(업로드·입력 중인 상태 보존). 화면에서만 숨긴다. */}
        <ScrollView
          style={[{ maxHeight: 520 }, !open && { display: "none" }]}
          contentContainerStyle={{ gap: 12, paddingBottom: 4 }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {footer}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  peekSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignSelf: "center",
    width: "100%",
    maxWidth: tokens.maxWidth,
    borderTopLeftRadius: tokens.radius.md,
    borderTopRightRadius: tokens.radius.md,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    paddingHorizontal: tokens.space.gutter,
    paddingBottom: safe("bottom", 20),
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
  },
  bar: {
    height: tokens.height.header,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    // 뒤로 아이콘(48 칸 가운데 24)이 왼쪽 시작선 16에 오게 4
    paddingHorizontal: 4,
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
    backgroundColor: tokens.color.photoOverlay,
    alignItems: "center",
    justifyContent: "center",
  },
  tabWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: safe("bottom", 0),
    backgroundColor: tokens.color.background,
    alignItems: "center",
  },
  tabBar: {
    width: "100%",
    maxWidth: tokens.maxWidth,
    height: tokens.height.tabBar,
    borderTopWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.background,
    flexDirection: "row",
    alignItems: "center",
  },
  tab: {
    flex: 1,
    height: tokens.height.tabBar,
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
    height: tokens.height.button,
    paddingHorizontal: 20,
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
