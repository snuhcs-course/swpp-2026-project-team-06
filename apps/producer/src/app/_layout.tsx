import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { SessionProvider } from "../lib/session";
import { TourProvider } from "../lib/Tour";

export default function Layout() {
  return (
    <SessionProvider>
      {/* 앱은 상태 표시줄 아이콘을 어둡게(흰 배경). Android 기본값은 밝은 아이콘이라 보이지 않았다(DEV-33). 웹에는 영향 없음 */}
      <StatusBar style="dark" />
      <TourProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#FFFFFF" },
          }}
        />
      </TourProvider>
    </SessionProvider>
  );
}
