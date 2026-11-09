// 앱(iOS·Android) 키보드 처리(DEV-205 Android, DEV-295 iOS). 웹은 브라우저가 처리하므로 아무것도 바꾸지 않는다.
import { useEffect, useState, type ReactNode } from "react";
import { Keyboard, KeyboardAvoidingView, Platform } from "react-native";

const native = Platform.OS === "ios" || Platform.OS === "android";

/**
 * 앱 루트에서 화면 전체를 감싼다. 키보드 높이만큼 아래 여백을 넣어 입력칸·하단 바를 키보드 위로 올린다.
 * - Android: edge-to-edge(Android 15+ 강제)라 창이 키보드만큼 줄지 않는다(adjustResize 무효, DEV-205).
 * - iOS: 창이 원래 줄지 않아 채팅 입력칸이 키보드에 가렸다(DEV-295). 루트가 화면 전체라 오프셋은 0이다.
 * 웹은 children을 그대로 돌려준다(감싸는 View도 없음).
 */
export function KeyboardRoot({ children }: { children: ReactNode }) {
  if (!native) return <>{children}</>;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      {children}
    </KeyboardAvoidingView>
  );
}

/**
 * 앱에서 키보드가 떠 있는지. 웹은 언제나 false.
 * 떠 있으면 탭 바·하단 바를 숨기고 입력줄 아래 안전 영역 여백을 뺀다(키보드가 그 자리를 덮는다).
 * iOS는 will 이벤트로 키보드 애니메이션과 같이 바꾼다.
 */
export function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!native) return;
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", () => setShown(true)),
      hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}
