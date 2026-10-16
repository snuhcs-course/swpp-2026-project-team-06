// Published news deep links open the same own-room tab.
import { Redirect, useLocalSearchParams } from "expo-router";
import { Screen, T } from "@farmclub/ui";
import { useSession } from "../../lib/session";
export default function Room() {
  const { farmId } = useLocalSearchParams<{ farmId: string }>();
  const { user } = useSession();
  if (!user) return null;
  return farmId === user.farmId ? (
    <Redirect href="/chats?view=news" />
  ) : (
    <Screen>
      <T>내 농가 소식방만 열 수 있어요.</T>
    </Screen>
  );
}
