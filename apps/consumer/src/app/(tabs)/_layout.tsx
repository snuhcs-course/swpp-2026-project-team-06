import { tokens } from "@farmclub/ui";
import { Tabs } from "expo-router";

// 하단 탭 4개: ia.md 4장. 비로그인 시 메시지·주문·내 정보 → 로그인(SCR-05)은 DEV-3.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarLabelStyle: { fontSize: tokens.fontSize.body },
      }}
    >
      <Tabs.Screen name="farms" options={{ title: "농가" }} />
      <Tabs.Screen name="inbox" options={{ title: "메시지" }} />
      <Tabs.Screen name="orders" options={{ title: "주문" }} />
      <Tabs.Screen name="me" options={{ title: "내 정보" }} />
    </Tabs>
  );
}
