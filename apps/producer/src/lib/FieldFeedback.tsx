import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { AccessibilityInfo, Animated, View } from "react-native";
import { tokens } from "@farmclub/ui";

// attempt: 누를 때마다 올리는 번호. 주면 스크롤은 누를 때만 하고, 칸을 고쳐 fields가 줄어도 다시 스크롤하지 않는다(DEV-361).
// 주지 않으면 예전처럼 fields가 바뀔 때 첫 칸으로 스크롤한다.
export const FieldFeedbackContext = createContext<{ fields: Record<string, string>; clear: (key: string) => void; attempt?: number }>({ fields: {}, clear: () => {} });
/**
 * 칸 하나(또는 칸 묶음)의 오류 표시. 첫 오류 칸으로 스크롤하고 testID `invalid-field-{field}`를 단다.
 * outline=false(글 입력 칸 하나): 바깥 강조 상자 없이 입력 칸 자기 오류 테두리·문구만 쓴다(PM 11/18).
 * 기본(outline=true)은 입력 칸 하나로 가리킬 수 없는 묶음(옵션 칩, 날짜 고르기, 기간·가격 표)에 쓴다.
 */
export function FieldFeedback({ field, children, outline = true }: { field: string; children: ReactNode; outline?: boolean }) {
  const { fields, attempt } = useContext(FieldFeedbackContext);
  const invalid = !!fields[field];
  const opacity = useRef(new Animated.Value(1)).current;
  const node = useRef<View>(null);
  const scrollKey = attempt ?? fields;
  useEffect(() => {
    if (!invalid || Object.keys(fields)[0] !== field) return;
    (node.current as unknown as { scrollIntoView?: (options: object) => void })?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    // scrollKey가 바뀔 때만 스크롤한다(칸 강조가 줄어드는 것으로는 움직이지 않음)
  }, [scrollKey]);
  useEffect(() => {
    if (!invalid) return;
    let cancelled = false;
    let animation: Animated.CompositeAnimation | undefined;
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
