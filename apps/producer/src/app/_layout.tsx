import { Stack } from "expo-router";
import { KeyboardRoot } from "@farmclub/ui";
import { StatusBar } from "expo-status-bar";

import { RootBoundary, StackScreenBoundary } from "../lib/ScreenBoundary";
import { SessionProvider } from "../lib/session";
import { TourProvider } from "../lib/Tour";

// DEV-473 마지막 그물: 세션·탭 레이아웃처럼 화면 위의 층이 죽으면 앱 전체 대신 오류 안내를 그린다
export { RootBoundary as ErrorBoundary };

export default function Layout() {
  return (
    <SessionProvider>
      {/* 앱은 상태 표시줄 아이콘을 어둡게(흰 배경). Android 기본값은 밝은 아이콘이라 보이지 않았다(DEV-33). 웹에는 영향 없음 */}
      <StatusBar style="dark" />
      <TourProvider>
        {/* Android 앱: 키보드가 입력칸을 가리지 않게 화면을 키보드 위로 올린다(DEV-205). 웹은 그대로 */}
        <KeyboardRoot>
          <Stack
            // DEV-473: 탭 밖 화면(주문서·출하 등)이 죽으면 그 화면만 오류 안내로 바꾼다
            unstable_screenErrorBoundary={StackScreenBoundary}
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: "#FFFFFF" },
            }}
          />
        </KeyboardRoot>
      </TourProvider>
    </SessionProvider>
  );
}
