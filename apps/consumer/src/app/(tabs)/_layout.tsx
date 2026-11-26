import { accountGated, allPages, messaging } from "@farmclub/api";
import { TabBar, inBackground, type IconName } from "@farmclub/ui";
import { Tabs } from "expo-router";
import { CommonActions } from "expo-router/react-navigation";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { useSession } from "../../lib/session";
import { TabScreenBoundary } from "../../lib/ScreenBoundary";

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
  const { user, tabsKey, tabBarHidden, requireLogin } = useSession();
  const [unread, setUnread] = useState(0);
  // DEV-494: 관문(비밀번호 변경·온보딩·재동의) 중에는 서버가 채팅 목록을 403으로 막는다. 그때 배지를 읽으면
  // 403 → 내 정보 다시 읽기 → effect 다시 실행 → 또 403의 고리가 돌았다. 관문 중엔 읽지 않고, 의존값은 원시값만 쓴다
  const uid = user?.userId ?? null;
  const badgeOn = !!user && !accountGated(user);

  useEffect(() => {
    if (!uid || !badgeOn) {
      setUnread(0);
      return;
    }
    let alive = true;
    // DEV-325: 탭이 숨겨졌거나 앱이 백그라운드면 배지 요청을 쉬고, 돌아오면 바로 한 번 읽는다(useLiveList와 같은 규칙).
    const load = () => {
      if (inBackground()) return;
      void allPages(
        (cursor) => messaging.chats({ limit: 50, cursor }),
        () => !alive,
      )
        .then(
          (r) => alive && setUnread(r.reduce((n, c) => n + c.unreadCount, 0)),
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
  }, [uid, badgeOn]);

  return (
    <Tabs
      // DEV-473: 탭 안 화면이 죽으면 그 화면만 오류 안내로 바꾼다(탭 바는 남는다). 레이아웃 없는 탭 화면(홈)과
      // 앞으로 (tabs) 바로 아래에 더할 화면도 여기서 받는다. 탭 폴더 Stack은 각자 같은 경계를 다시 둔다
      unstable_screenErrorBoundary={TabScreenBoundary}
      // 계정이 바뀌면(로그인·로그아웃·토큰 교체) 탭 아래 화면 상태를 버린다. 저장된 토큰을 auth/me로 확인하는 동안
      // 누른 동작은 남긴다(DEV-481: 전 key `user?.userId ?? "guest"`는 답이 오는 순간 탭을 다시 만들어 그 동작을 지웠다)
      key={tabsKey}
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
