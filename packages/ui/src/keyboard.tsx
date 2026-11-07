// Android 앱 키보드 처리(DEV-205). 웹은 브라우저가 처리하므로 아무것도 바꾸지 않는다.
import { useEffect, useState, type ReactNode } from "react";
import { Keyboard, KeyboardAvoidingView, Platform } from "react-native";

const android = Platform.OS === "android";

/**
 * 앱 루트에서 화면 전체를 감싼다. Android는 edge-to-edge(Android 15+ 강제)라 창이 키보드만큼 줄지 않아(adjustResize 무효)
 * 키보드 높이만큼 아래 여백을 넣어 입력칸·하단 바를 키보드 위로 올린다. 웹·iOS는 children을 그대로 돌려준다(감싸는 View도 없음).
 */
export function KeyboardRoot({ children }: { children: ReactNode }) {
  if (!android) return <>{children}</>;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      {children}
    </KeyboardAvoidingView>
  );
}

/** Android 앱에서 키보드가 떠 있는지. 웹·iOS는 언제나 false */
export function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!android) return;
    const show = Keyboard.addListener("keyboardDidShow", () => setShown(true)),
      hide = Keyboard.addListener("keyboardDidHide", () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}
