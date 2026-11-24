import { Stack } from "expo-router";
import { TabScreenBoundary } from "../../../lib/ScreenBoundary";
export default function Layout() {
  return (
    <Stack
      // DEV-473: 이 탭 안 화면이 죽으면 그 화면만 오류 안내로 바꾼다(탭 바는 남는다)
      unstable_screenErrorBoundary={TabScreenBoundary}
      screenOptions={{ headerShown: false }}
    />
  );
}
