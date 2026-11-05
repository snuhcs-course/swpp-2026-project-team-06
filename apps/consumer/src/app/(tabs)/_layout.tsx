import { messaging, allPages } from "@farmclub/api";
import { TabBar, type IconName } from "@farmclub/ui";
import { Tabs } from "expo-router";
import { CommonActions } from "expo-router/react-navigation";
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

// 하위 스택이 있는 탭(내 주문·채팅·내 정보)
const STACK_TABS = new Set(["orders", "chats", "me"]);

// 탭을 누르면 언제나 그 탭의 첫 화면(ia.md 4장, DEV-224 b1). 다른 탭에서 연 하위 화면(방·주문 완료)과 그 params를 남기지 않는다.
// 숨은 탭에서 연 하위 화면은 탭 route의 params(screen·params)로만 남아 있어 navigate에 빈 params를 꼭 넘긴다.
function openTabRoot(
  navigation: unknown,
  route: { name: string; state?: unknown },
  stack: boolean,
) {
  const nav = navigation as unknown as {
    dispatch: (a: object) => void;
    navigate: (name: string, params?: object) => void;
  };
  if (!stack) return nav.navigate(route.name);
  const nested = route.state as
    | {
        key?: string;
        index?: number;
        routes?: { name: string; params?: object }[];
      }
    | undefined;
  // 첫 화면이 이미 바닥에 있으면 그 params(내 주문 filter·채팅 view)는 지킨다
  const root = nested?.routes?.[0];
  const keep = root?.name === "index" ? (root.params ?? {}) : {};
  if (nested?.key && ((nested.index ?? 0) > 0 || root?.name !== "index"))
    nav.dispatch({
      ...CommonActions.reset({
        index: 0,
        routes: [{ name: "index", params: keep }],
      }),
      target: nested.key,
    });
  nav.navigate(route.name, { screen: "index", params: keep });
}

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
                (t.name === "index" &&
                  (current === "farms" || current === "products")) ||
                (t.name === "chats" && current === "news");
              return {
                key: t.name,
                label: t.label,
                icon: t.icon,
                active,
                badge: t.name === "chats" ? unread : undefined,
                onPress: () => {
                  const go = () =>
                    openTabRoot(
                      navigation,
                      state.routes[idx],
                      STACK_TABS.has(t.name),
                    );
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
      <Tabs.Screen name="products" options={{ href: null }} />
    </Tabs>
  );
}
