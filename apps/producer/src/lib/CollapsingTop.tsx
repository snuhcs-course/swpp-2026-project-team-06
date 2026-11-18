// 화면 위쪽 줄(단계 표시 등)을 스크롤에 따라 부드럽게 숨기고 되살린다(DEV-361 PR C, PM 11/18).
// 아래로 스크롤하면 머리 아래로 올라가며 사라지고(150~200ms), 위로 스크롤하거나 맨 위면 다시 보인다.
// 내용이 그 아래로 지나갈 때는 딱딱한 선 대신 옅은 그림자로 경계를 둔다. 동작 줄이기 설정이면 바로 바꾼다.
// 숨겨도 화면 읽기에는 남아 단계 상태를 읽을 수 있다(투명도만 바꾸고 숨김 속성은 주지 않음).
import { tokens } from "@farmclub/ui";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, View } from "react-native";

/** 스크롤 방향을 보고 위쪽 줄을 보일지 정한다. `onScroll`을 `Scroll`에 넘기고, `height`만큼 내용 맨 위에 자리를 둔다 */
export function useCollapsingTop() {
  const [visible, setVisible] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [height, setHeight] = useState(0);
  const last = useRef(0);
  const onScroll = useCallback((y: number) => {
    const dy = y - last.current;
    if (y <= 4) setVisible(true);
    else if (dy > 6) setVisible(false);
    else if (dy < -6) setVisible(true);
    if (Math.abs(dy) > 6 || y <= 4) last.current = y;
    setScrolled(y > 4);
  }, []);
  return { visible, scrolled, height, setHeight, onScroll };
}

export function CollapsingTop({
  visible,
  scrolled,
  onHeight,
  children,
}: {
  visible: boolean;
  scrolled: boolean;
  onHeight: (h: number) => void;
  children: ReactNode;
}) {
  const progress = useRef(new Animated.Value(1)).current;
  const [reduce, setReduce] = useState(false);
  const [h, setH] = useState(0);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
  }, []);
  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reduce ? 0 : 180,
      useNativeDriver: false,
    }).start();
  }, [visible, reduce, progress]);
  return (
    <Animated.View
      testID="collapsing-top"
      pointerEvents={visible ? "box-none" : "none"}
      onLayout={(e) => {
        const next = Math.round(e.nativeEvent.layout.height);
        setH(next);
        onHeight(next);
      }}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1,
        backgroundColor: tokens.color.background,
        paddingBottom: 12,
        opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-(h || 48), 0] }) }],
        // 내용이 아래로 지나갈 때만 옅은 그림자(맨 위에서는 경계 없음)
        ...(scrolled ? { boxShadow: "0 8px 12px -10px rgba(0,0,0,0.25)" } : {}),
      }}
    >
      {children}
    </Animated.View>
  );
}

/** 위쪽 줄 높이만큼 내용 맨 위에 두는 자리 */
export function CollapsingSpacer({ height }: { height: number }) {
  return <View style={{ height }} />;
}
