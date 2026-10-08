import {
  Redirect,
  Stack,
  usePathname,
  useGlobalSearchParams,
} from "expo-router";
import { selectedOrderGroup } from "../../../lib/orderGroups";
import { useSession } from "../../../lib/session";
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
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#FFFFFF" },
      }}
    />
  );
}
