// 화면이 뒤에 있는지(DEV-33). 웹은 탭이 숨겨졌을 때(document.hidden), 앱은 백그라운드일 때 polling을 쉰다.
// react-native-web의 AppState가 document.visibilityState를 그대로 비추므로 한 구현으로 두 플랫폼을 덮는다.
import { AppState } from "react-native";

export function inBackground(): boolean {
  const s = AppState.currentState;
  return s === "background" || s === "inactive";
}
