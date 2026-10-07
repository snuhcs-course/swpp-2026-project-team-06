import { Stack } from "expo-router";

import { SessionProvider } from "../lib/session";

export default function Layout() {
  return (
    <SessionProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#FFFFFF" },
        }}
      />
    </SessionProvider>
  );
}
