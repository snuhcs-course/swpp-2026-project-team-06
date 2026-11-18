import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { AccessibilityInfo, Animated, View } from "react-native";
import { tokens } from "@farmclub/ui";

export const FieldFeedbackContext = createContext<{ fields: Record<string, string>; clear: (key: string) => void }>({ fields: {}, clear: () => {} });
/**
 * 칸 하나(또는 칸 묶음)의 오류 표시. 첫 오류 칸으로 스크롤하고 testID `invalid-field-{field}`를 단다.
 * outline=false(글 입력 칸 하나): 바깥 강조 상자 없이 입력 칸 자기 오류 테두리·문구만 쓴다(PM 11/18).
 * 기본(outline=true)은 입력 칸 하나로 가리킬 수 없는 묶음(옵션 칩, 날짜 고르기, 기간·가격 표)에 쓴다.
 */
export function FieldFeedback({ field, children, outline = true }: { field: string; children: ReactNode; outline?: boolean }) {
  const { fields } = useContext(FieldFeedbackContext);
  const invalid = !!fields[field];
  const opacity = useRef(new Animated.Value(1)).current;
  const node = useRef<View>(null);
  useEffect(() => {
    if (!invalid) return;
    let cancelled = false;
    let animation: Animated.CompositeAnimation | undefined;
    if (Object.keys(fields)[0] === field) {
      (node.current as unknown as { scrollIntoView?: (options: object) => void })?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (cancelled || reduced || !outline) return;
      animation = Animated.loop(Animated.sequence([
        Animated.timing(opacity, { toValue: 0.2, duration: 450, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: false }),
      ]), { iterations: 3 });
      animation.start();
    });
    return () => { cancelled = true; animation?.stop(); opacity.setValue(1); };
  }, [invalid, fields, field, opacity, outline]);
  return <View ref={node} testID={invalid ? `invalid-field-${field}` : undefined}>
    {children}
    {invalid && outline ? <Animated.View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, borderWidth: 2, borderRadius: 8, borderColor: tokens.color.error, backgroundColor: "rgba(180,35,24,0.06)", opacity }} /> : null}
  </View>;
}
