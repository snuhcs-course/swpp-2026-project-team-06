// 화면 오류 경계(DEV-473, screens.md 3장 ‘화면 오류’). 화면이 그리다 예외로 죽으면 빈 화면 대신 ScreenError를 그린다.
// 경계는 두 겹이다(apps/consumer/tasks/DEV-473.md 결정 사항).
// - 화면 한 장: 레이아웃 prop unstable_screenErrorBoundary. (tabs)/_layout의 Tabs와 탭 폴더 Stack은 TabScreenBoundary,
//   탭 밖 화면은 루트 Stack의 StackScreenBoundary. expo-router가 죽은 화면 하나만 장면 안에서 감싸서
//   탭 바·스택은 그대로고, ‘다시 시도’는 그 화면만 다시 그린다.
// - 받는 것: 그리기(render)와 effect 안에서 바로 던진 예외. 이벤트 핸들러(onPress 등)와 then·setTimeout 같은 비동기
//   콜백의 예외는 React 경계 밖이라 어떤 경계도 받지 못한다(screens.md ‘화면 오류’).
// - 마지막 그물: 루트 _layout의 export ErrorBoundary(RootBoundary). 세션·탭 레이아웃 자체가 죽은 경우.
import { getToken } from "@farmclub/api";
import { ScreenError } from "@farmclub/ui";
import {
  router,
  useNavigation,
  usePathname,
  useRouter,
  type ErrorBoundaryProps,
} from "expo-router";
import { CommonActions } from "expo-router/react-navigation";
import { Platform } from "react-native";

import { useSession } from "./session";

/** 홈(발견) */
export const ERROR_HOME = "/";
/** farmclub 운영팀 대화방 */
export const ERROR_SUPPORT = "/chats/support";

/** 죽은 화면이 든 스택을 첫 화면 하나로 되돌린다. 첫 화면이 죽은 화면이면 새 키로 바꿔 다음에 열 때 새로 그린다.
 * 탭 첫 화면(레이아웃 없는 탭)은 스택이 아니라 그대로 둔다 */
export function useLeaveDeadStack() {
  const navigation = useNavigation();
  /** 죽은 화면을 스택에서 꺼냈으면(주소가 바뀌면) true */
  return (): boolean => {
    const state = navigation.getState();
    if (state?.type !== "stack") return false;
    const first = state.routes[0];
    navigation.dispatch({
      ...CommonActions.reset({
        index: 0,
        // 키를 빼면 새 화면으로 다시 만든다
        routes: [
          state.index > 0 ? first : { name: first.name, params: first.params },
        ],
      } as Parameters<typeof CommonActions.reset>[0]),
      target: state.key,
    });
    return state.index > 0;
  };
}

/** 죽은 화면을 스택에서 꺼낸 뒤 go()로 홈에 간다.
 * 웹은 주소 기록이 있다. expo-router(useLinking)는 상태가 바뀔 때마다 그때의 전체 상태를 읽어 기록을 고치는데,
 * 꺼내기와 홈 이동이 한 번에 읽히면 ‘탭 바꿈 = 새 기록 push’로만 보여 죽은 화면 기록이 홈 앞에 남는다(뒤로 가기로
 * 다시 열림). 그래서 꺼내기가 기록 이동(history.go)으로 끝나 주소가 바뀐 것을 본 다음에 홈으로 바꿔 쓴다.
 * 1초 안에 안 바뀌면 그대로 간다. 앱은 주소 기록이 없어 바로 간다 */
function useAfterLeave() {
  const leave = useLeaveDeadStack();
  return (go: () => void) => {
    const web = Platform.OS === "web" && typeof window !== "undefined";
    const dead = web ? window.location.pathname : "";
    if (!leave() || !web) return go();
    const started = Date.now();
    const wait = () => {
      if (window.location.pathname !== dead || Date.now() - started > 1000) go();
      else requestAnimationFrame(wait);
    };
    requestAnimationFrame(wait);
  };
}

/** 홈으로: 죽은 화면을 스택에서 빼고 홈으로 바꿔 간다(지금 기록을 바꿔 쓰므로 뒤로 가기·탭 다시 누르기로
 * 죽은 화면에 돌아가지 않는다). 죽은 화면이 홈 자신이면 다시 그린다 */
function useGoHome(retry: ErrorBoundaryProps["retry"]) {
  const r = useRouter();
  const pathname = usePathname();
  const afterLeave = useAfterLeave();
  return () => {
    if (pathname === ERROR_HOME) return void retry();
    afterLeave(() => r.replace(ERROR_HOME));
  };
}

function useOpenSupport() {
  const r = useRouter();
  const { requireLogin } = useSession();
  // 비로그인은 다른 채팅 탭 진입처럼 관문 시트(로그인 / 나중에)부터
  return () => requireLogin("tab", ERROR_SUPPORT, () => r.push(ERROR_SUPPORT));
}

function ScreenBoundary({
  error,
  retry,
  aboveTabs,
}: ErrorBoundaryProps & { aboveTabs: boolean }) {
  const home = useGoHome(retry);
  const support = useOpenSupport();
  // 죽은 화면이 운영팀 방 자신이면 같은 방을 또 열어 다시 죽으므로 링크를 숨긴다
  const inSupport = usePathname() === ERROR_SUPPORT;
  return (
    <ScreenError
      error={error}
      retry={retry}
      home={home}
      support={inSupport ? undefined : support}
      aboveTabs={aboveTabs}
    />
  );
}

/** 탭 안 화면 한 장. 탭 바가 남으므로 버튼을 탭 바 위로 올린다 */
export function TabScreenBoundary(props: ErrorBoundaryProps) {
  return <ScreenBoundary {...props} aboveTabs />;
}

/** 탭 밖 화면 한 장(주문서·입금 안내·로그인 등) */
export function StackScreenBoundary(props: ErrorBoundaryProps) {
  return <ScreenBoundary {...props} aboveTabs={false} />;
}

/** 마지막 그물. 루트 레이아웃(세션)이 통째로 빠진 상태라 세션·내비게이터를 쓰지 않는다.
 * 웹은 주소를 바꿔 앱을 새로 띄우고(지금 주소를 바꿔 써서 뒤로 가기로 돌아오지 않는다), 앱은 다시 그린 뒤 이동한다 */
export function RootBoundary({ error, retry }: ErrorBoundaryProps) {
  const go = (path: string) => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.replace(path);
      return;
    }
    void retry().then(() => {
      try {
        router.replace(path as never);
      } catch {
        // 다시 그린 뒤에도 내비게이터가 없으면 그대로 둔다(다시 그린 화면이 첫 화면)
      }
    });
  };
  const support = getToken()
    ? ERROR_SUPPORT
    : `/login?next=${encodeURIComponent(ERROR_SUPPORT)}`;
  return (
    <ScreenError
      error={error}
      retry={retry}
      home={() => go(ERROR_HOME)}
      support={() => go(support)}
    />
  );
}
