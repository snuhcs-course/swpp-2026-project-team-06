import { Stack } from "expo-router";
import { KeyboardRoot } from "@farmclub/ui";
import { StatusBar } from "expo-status-bar";

import { SessionProvider } from "../lib/session";

export default function Layout() {
  return (
    <SessionProvider>
      {/* 앱은 상태 표시줄 아이콘을 어둡게(흰 배경). Android 기본값은 밝은 아이콘이라 보이지 않았다(DEV-33). 웹에는 영향 없음 */}
      <StatusBar style="dark" />
      {/* Android 앱: 키보드가 입력칸을 가리지 않게 화면을 키보드 위로 올린다(DEV-205). 웹은 그대로 */}
      <KeyboardRoot>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#FFFFFF" },
          }}
        />
      </KeyboardRoot>
    </SessionProvider>
  );
}
