import { messaging, allPages } from "@farmclub/api";
import { TabBar, type IconName } from "@farmclub/ui";
import { Tabs } from "expo-router";
import { useEffect, useState } from "react";

import { useSession } from "../../lib/session";

// 하단 탭 4개: 발견 · 내 주문 · 채팅 · 내 정보 (screens.md 결정 2). 내 주문·채팅·내 정보는 로그인 필요.
const TABS: {
  name: string;
  label: string;
  icon: IconName;
  needsLogin: boolean;
  href: string;
}[] = [
  {
    name: "index",
    label: "발견",
    icon: "compass",
    needsLogin: false,
    href: "/",
  },
  {
    name: "orders",
    label: "내 주문",
    icon: "box",
    needsLogin: true,
    href: "/orders",
  },
  {
    name: "chats",
    label: "채팅",
    icon: "chat",
    needsLogin: true,
    href: "/chats",
  },
  { name: "me", label: "내 정보", icon: "user", needsLogin: true, href: "/me" },
];

export default function TabsLayout() {
  const { user, tabBarHidden, requireLogin } = useSession();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    let alive = true;
    const load = () =>
      allPages(
        (cursor) => messaging.chats({ limit: 50, cursor }),
        () => !alive,
      )
        .then(
          (r) => alive && setUnread(r.reduce((n, c) => n + c.unreadCount, 0)),
        )
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [user]);

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
              const idx = state.routes.findIndex((r) => r.name === t.name);
              const current = state.routes[state.index]?.name;
              // 농가 목록·농가 페이지는 발견 탭 안
              const active =
                current === t.name ||
                (t.name === "index" && current === "farms") ||
                (t.name === "chats" && current === "news");
              return {
                key: t.name,
                label: t.label,
                icon: t.icon,
                active,
                badge: t.name === "chats" ? unread : undefined,
                onPress: () => {
                  const go = () => {
                    const route = state.routes[idx];
                    if (active)
                      navigation.navigate(route.name, { screen: "index" });
                    else navigation.navigate(route.name);
                  };
                  // 내 주문·채팅·내 정보 탭은 관문 시트(로그인 / 나중에)를 먼저 띄운다(screens.md 3장)
                  if (t.needsLogin && !user) requireLogin("tab", t.href);
                  else go();
                },
              };
            })}
          />
        )
      }
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="news" options={{ href: null }} />
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="me" />
      <Tabs.Screen name="farms" options={{ href: null }} />
    </Tabs>
  );
}
