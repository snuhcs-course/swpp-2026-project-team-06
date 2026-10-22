import { Stack } from "expo-router";

import { SessionProvider } from "../lib/session";
import { TourProvider } from "../lib/Tour";

export default function Layout() {
  return (
    <SessionProvider>
      <TourProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#FFFFFF" },
          }}
        />
      </TourProvider>
    </SessionProvider>
  );
}
