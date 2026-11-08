import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { AccessibilityInfo, Animated, View } from "react-native";
import { tokens } from "@farmclub/ui";

export const FieldFeedbackContext = createContext<{ fields: Record<string, string>; clear: (key: string) => void }>({ fields: {}, clear: () => {} });
export function FieldFeedback({ field, children }: { field: string; children: ReactNode }) {
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
      if (cancelled || reduced) return;
      animation = Animated.loop(Animated.sequence([
        Animated.timing(opacity, { toValue: 0.2, duration: 450, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: false }),
      ]), { iterations: 3 });
      animation.start();
    });
    return () => { cancelled = true; animation?.stop(); opacity.setValue(1); };
  }, [invalid, fields, field, opacity]);
  return <View ref={node} testID={invalid ? `invalid-field-${field}` : undefined}>
    {children}
    {invalid ? <Animated.View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, borderWidth: 2, borderRadius: 8, borderColor: tokens.color.error, backgroundColor: "rgba(180,35,24,0.06)", opacity }} /> : null}
  </View>;
}
