import { allPages, messaging } from "@farmclub/api";
import { TabBar, type IconName } from "@farmclub/ui";
import { Tabs, usePathname } from "expo-router";
import { useEffect, useState } from "react";

import { useSession } from "../../lib/session";

// 생산자 하단 탭 4개: 현황 · 상품 · 채팅 · 환경설정 (screens.md 결정 2). 채팅에 안 읽은 메시지 배지.
const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: "index", label: "현황", icon: "chart" },
  { name: "products", label: "상품", icon: "box" },
  { name: "chats", label: "채팅", icon: "chat" },
  { name: "settings", label: "환경설정", icon: "settings" },
];

export default function TabsLayout() {
  const { user, tabBarHidden } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(0);

  useEffect(() => {
    if (user?.farmStatus !== "APPROVED") return;
    let alive = true;
    const load = () =>
      allPages(
        (cursor) => messaging.producerChats({ limit: 50, cursor }),
        () => !alive,
      )
        .then(
          (r) =>
            alive &&
            setOpen(r.reduce((sum, item) => sum + item.unreadCount, 0)),
        )
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [user, pathname]);

  return (
    <Tabs
      key={user?.userId ?? "guest"}
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: "#FFFFFF" },
      }}
      tabBar={({ state, navigation }) =>
        tabBarHidden ? null : (
          <TabBar
            items={TABS.map((t) => {
              const current = state.routes[state.index]?.name;
              const active =
                current === t.name ||
                (t.name === "settings" && current === "farm");
              return {
                key: t.name,
                label: t.label,
                icon: t.icon,
                active,
                badge: t.name === "chats" ? open : undefined,
                onPress: () => {
                  if (active) navigation.navigate(t.name, { screen: "index" });
                  else navigation.navigate(t.name);
                },
              };
            })}
          />
        )
      }
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="products" />
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="settings" />
      <Tabs.Screen name="farm" options={{ href: null }} />
    </Tabs>
  );
}
