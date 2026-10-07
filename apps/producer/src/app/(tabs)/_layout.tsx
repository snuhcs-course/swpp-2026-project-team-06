import { tokens } from "@farmclub/ui";
import { Tabs } from "expo-router";

// 하단 탭 4개: ia.md 4장. 승인 전 생산자는 SCR-21(/pending)만 열린다(ia.md 6장) — 막는 처리는 DEV-3·DEV-4.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarLabelStyle: { fontSize: tokens.fontSize.body },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "현황" }} />
      <Tabs.Screen name="products" options={{ title: "상품" }} />
      <Tabs.Screen name="questions" options={{ title: "질문함" }} />
      <Tabs.Screen name="farm" options={{ title: "농가" }} />
    </Tabs>
  );
}
