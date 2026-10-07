import { Redirect, Stack, usePathname } from "expo-router";
import { useSession } from "../../../lib/session";
export default function Layout() {
  const { user, ready } = useSession();
  const next = usePathname();
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
