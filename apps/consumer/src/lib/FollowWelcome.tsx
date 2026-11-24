import { farms, type FollowState } from "@farmclub/api";
import { Button, Icon, Sheet, T, tokens, useSheetLeave } from "@farmclub/ui";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { chatViewState } from "./chatViewState";
import { useSession } from "./session";

type Farm = { farmId: string; name: string };
type Welcome = Farm & { fanNumber: number; scope: string; nickname: string };

/** Explicit follows share one saved-result receipt and the same session boundary. */
export function useFollowWelcome(resource: string) {
  const router = useRouter();
  const { user, ready, chatViewScope } = useSession();
  const scope = ready && user && chatViewScope ? `${user.userId}:${chatViewScope.generation}:${resource}` : "";
  const current = useRef(scope);
  current.current = scope;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const lock = useRef<{ scope: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [welcome, setWelcome] = useState<Welcome | null>(null);
  const leave = useSheetLeave();
  const consumed = useRef<Welcome | null>(null);
  const authorized = () => Boolean(scope && current.current === scope && alive.current &&
    chatViewScope && chatViewState.isCurrent(chatViewScope));
  const shown = welcome?.scope === scope && authorized() ? welcome : null;
  const close = () => {
    if (!shown || consumed.current === shown) return;
    consumed.current = shown;
    // Both backdrop/back and CTA consume the same receipt exactly once.
    const target = shown.farmId;
    setWelcome(null);
    leave.leave(() => setWelcome(null), () => {
      if (authorized()) router.replace(`/farms/${target}/info`);
    });
  };
  async function change(farm: Farm, on: boolean): Promise<FollowState | null> {
    if (!authorized() || lock.current?.scope === scope) return null;
    const ticket = { scope };
    lock.current = ticket;
    setPending(scope);
    try {
      const result = on ? await farms.follow(farm.farmId) : await farms.unfollow(farm.farmId);
      if (!authorized()) return null;
      if (on && result.firstFollow && result.fanNumber != null) {
        setWelcome({ ...farm, fanNumber: result.fanNumber, scope, nickname: user?.nickname?.trim() || "고객" });
      }
      return result;
    } catch (error) {
      if (authorized()) throw error;
      return null;
    } finally {
      if (lock.current === ticket) lock.current = null;
      if (authorized()) setPending(null);
    }
  }
  return {
    change,
    busy: pending === scope && authorized(),
    node: (
      <Sheet visible={Boolean(shown)} onClose={close} instant={leave.instant}>
        <View testID="follow-welcome" style={{ alignItems: "flex-start", gap: 16, paddingVertical: 8 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
            <Icon name="heartFill" color={tokens.color.accent} size={28} />
          </View>
          <T variant="sub" weight="semibold" color={tokens.color.accent}>우리 농가의 소중한 손님</T>
          {shown ? (
            <T variant="title" masked>{shown.nickname}님은 {shown.name}을 팔로우한 소중한 {shown.fanNumber.toLocaleString("ko-KR")}번째 손님이에요</T>
          ) : null}
          <T>이제 농가의 소식을 함께 기다려요.</T>
          <T variant="sub" muted>손님 번호는 이 기능 도입 때 확인한 팔로우 기록부터 차례로 매겨요.</T>
        </View>
        <Button label="농가 소개 보기" onPress={close} />
      </Sheet>
    ),
  };
}
