import {
  Redirect,
  Stack,
  usePathname,
  useGlobalSearchParams,
} from "expo-router";
import { selectedOrderGroup } from "../../../lib/orderGroups";
import { useSession } from "../../../lib/session";
import { TabScreenBoundary } from "../../../lib/ScreenBoundary";
export default function Layout() {
  const { user, ready } = useSession();
  const pathname = usePathname();
  const { filter } = useGlobalSearchParams<{ filter?: string }>();
  const next =
    pathname === "/orders"
      ? `/orders?filter=${selectedOrderGroup(filter)}`
      : pathname;
  if (!ready) return null;
  if (!user)
    return <Redirect href={{ pathname: "/login", params: { next } }} />;
  return (
    <Stack
      // DEV-473: 이 탭 안 화면이 죽으면 그 화면만 오류 안내로 바꾼다(탭 바는 남는다)
      unstable_screenErrorBoundary={TabScreenBoundary}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#FFFFFF" },
      }}
    />
  );
}
