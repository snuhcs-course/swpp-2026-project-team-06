// 화면 오류 경계(DEV-473, screens.md 3장 ‘화면 오류’). 화면이 그리다 예외로 죽으면 빈 화면 대신 ScreenError를 그린다.
// 경계는 두 겹이다(apps/producer/tasks/DEV-473.md 결정 사항).
// - 화면 한 장: 탭 폴더 Stack의 unstable_screenErrorBoundary(TabScreenBoundary), 레이아웃 없는 탭 화면(현황·설정)의
//   export ErrorBoundary(TabScreenBoundary), 탭 밖 화면(출하·소식 보내기·정지 안내 등)은 루트 Stack의
//   unstable_screenErrorBoundary(StackScreenBoundary). 죽은 화면 하나만 바뀌어 탭 바·스택은 그대로다.
// - 마지막 그물: 루트 _layout의 export ErrorBoundary(RootBoundary). 세션·탭 레이아웃 자체가 죽은 경우.
import { SUPPORT_ID, type User } from "@farmclub/api";
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

import { homeFor } from "./gate";
import { useSession } from "./session";

/** 승인 농가의 운영팀 대화방(채팅 탭 1:1 목록의 farmclub 방) */
export const ERROR_SUPPORT_APPROVED = `/chats/${SUPPORT_ID}`;
/** 정지·반려 농가의 운영팀 대화방(관문이 열어 둔 탭 밖 주소, AC-34-9). 승인 농가도 같은 방이 열린다 */
export const ERROR_SUPPORT_OTHER = "/support";

/** 상태별 운영팀 대화방 주소. 승인 농가만 탭이 있다 */
export function supportPathFor(user: User | null): string {
  return user?.farmStatus === "APPROVED"
    ? ERROR_SUPPORT_APPROVED
    : ERROR_SUPPORT_OTHER;
}

/** 죽은 화면이 든 스택을 첫 화면 하나로 되돌린다. 첫 화면이 죽은 화면이면 새 키로 바꿔 다음에 열 때 새로 그린다.
 * 탭 첫 화면(현황·설정)은 스택이 아니라 그대로 둔다 */
export function useLeaveDeadStack() {
  const navigation = useNavigation();
  return () => {
    const state = navigation.getState();
    if (state?.type !== "stack") return;
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
  };
}

/** 홈으로: 상태별 첫 화면(승인 농가는 현황 `/`). 죽은 화면을 스택에서 빼고 홈으로 바꿔 간다(지금 기록을 바꿔 쓰므로
 * 뒤로 가기·탭 다시 누르기로 죽은 화면에 돌아가지 않는다). 죽은 화면이 홈 자신이면 다시 그린다 */
function useGoHome(retry: ErrorBoundaryProps["retry"]) {
  const r = useRouter();
  const pathname = usePathname();
  const { user } = useSession();
  const leave = useLeaveDeadStack();
  return () => {
    const home = homeFor(user).home;
    if (pathname === home) return void retry();
    leave();
    // 스택을 되돌린 기록 이동(웹은 history.go)이 끝난 뒤에 홈으로 가야 죽은 화면 기록이 남지 않는다
    setTimeout(() => r.replace(home as never), 0);
  };
}

function ScreenBoundary({
  error,
  retry,
  aboveTabs,
}: ErrorBoundaryProps & { aboveTabs: boolean }) {
  const r = useRouter();
  const home = useGoHome(retry);
  const { user } = useSession();
  // 로그인 전·확인 중(가입 신청·심사 중) 농가는 운영팀 방이 없어 링크를 숨긴다
  const status = user?.farmStatus;
  const canSupport =
    status === "APPROVED" || status === "SUSPENDED" || status === "REJECTED";
  return (
    <ScreenError
      error={error}
      retry={retry}
      home={home}
      support={canSupport ? () => r.push(supportPathFor(user) as never) : undefined}
      aboveTabs={aboveTabs}
    />
  );
}

/** 탭 안 화면 한 장. 탭 바가 남으므로 버튼을 탭 바 위로 올린다 */
export function TabScreenBoundary(props: ErrorBoundaryProps) {
  return <ScreenBoundary {...props} aboveTabs />;
}

/** 탭 밖 화면 한 장 */
export function StackScreenBoundary(props: ErrorBoundaryProps) {
  return <ScreenBoundary {...props} aboveTabs={false} />;
}

/** 마지막 그물. 루트 레이아웃(세션)이 통째로 빠진 상태라 세션·내비게이터를 쓰지 않는다.
 * 홈은 `/`(관문이 상태별 첫 화면으로 보낸다), 운영팀은 상태와 상관없이 열리는 `/support`.
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
  return (
    <ScreenError
      error={error}
      retry={retry}
      home={() => go("/")}
      support={() => go(ERROR_SUPPORT_OTHER)}
    />
  );
}
