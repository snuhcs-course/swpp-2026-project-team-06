import { allPages, messaging } from "@farmclub/api";
import { TabBar, inBackground, type IconName } from "@farmclub/ui";
import { Tabs, usePathname } from "expo-router";
import { CommonActions } from "expo-router/react-navigation";
import { useEffect, useState } from "react";
import { ActivityIndicator, AppState } from "react-native";

import { useSession } from "../../lib/session";
import { TabScreenBoundary } from "../../lib/ScreenBoundary";

// 생산자 하단 탭 4개: 현황 · 상품 · 채팅 · 설정 (screens.md 결정 2, DEV-294에서 '환경설정' → '설정'). 채팅에 안 읽은 메시지 + AI 답변 확인 요청(DEV-296) 배지.
const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: "index", label: "현황", icon: "chart" },
  { name: "products", label: "상품", icon: "box" },
  { name: "chats", label: "채팅", icon: "chat" },
  { name: "settings", label: "설정", icon: "settings" },
];

// 하위 스택이 있는 탭(상품·채팅)
const STACK_TABS = new Set(["products", "chats"]);

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
  const { user, ready, tabBarHidden } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(0);

  useEffect(() => {
    if (user?.farmStatus !== "APPROVED") return;
    let alive = true;
    // DEV-325: 탭이 숨겨졌거나 앱이 백그라운드면 배지 요청을 쉬고, 돌아오면 바로 한 번 읽는다(useLiveList와 같은 규칙).
    const load = () => {
      if (inBackground()) return;
      void allPages(
        (cursor) => messaging.producerChats({ limit: 50, cursor }),
        () => !alive,
      )
        .then(
          (r) =>
            alive &&
            // 안 읽은 메시지 + 열린 AI 답변 확인 요청(DEV-296)
            setOpen(
              r.reduce(
                (sum, item) => sum + item.unreadCount + (item.aiCheckRequests ?? 0),
                0,
              ),
            ),
        )
        .catch(() => undefined);
    };
    load();
    const t = setInterval(load, 8000);
    const resumed = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });
    return () => {
      alive = false;
      clearInterval(t);
      resumed?.remove();
    };
  }, [user, pathname]);

  if (!ready) return <ActivityIndicator accessibilityLabel="화면을 준비하고 있어요" />;

  return (
    <Tabs
      // DEV-473: 탭 안 화면이 죽으면 그 화면만 오류 안내로 바꾼다(탭 바는 남는다). 레이아웃 없는 탭 화면(현황·설정)과
      // 앞으로 (tabs) 바로 아래에 더할 화면도 여기서 받는다. 탭 폴더 Stack은 각자 같은 경계를 다시 둔다
      unstable_screenErrorBoundary={TabScreenBoundary}
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
                testID: `tab-${t.name}`,
                onPress: () => {
                  const idx = state.routes.findIndex((r) => r.name === t.name);
                  openTabRoot(navigation, state.routes[idx], STACK_TABS.has(t.name));
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
