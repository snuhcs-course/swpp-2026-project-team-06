import { engagement } from "@farmclub/api";
import { Button, HeaderBar, Icon, Screen, Scroll, Skeleton, T, tokens, type IconName } from "@farmclub/ui";
import { Redirect, useRouter, type Href } from "expo-router";
import { View } from "react-native";
import { useSession } from "../../../lib/session";
import { useEngagementSession } from "../../../lib/engagementSession";
import { useFocusedAsync } from "../../../lib/useFocusedAsync";
import { goBackOr } from "../../../lib/nav";
import { LoadError } from "../../../lib/views";

const icons: Record<string, IconName> = {
  first_follow: "heart", first_reaction: "star", first_message: "chat", first_purchase: "box", first_review: "pencil",
};

export default function Achievements() {
  const { ready, user } = useSession();
  const session = useEngagementSession();
  if (ready && !user) return <Redirect href={{ pathname: "/login", params: { next: "/me/achievements" } }} />;
  if (!session.valid()) return <Screen><HeaderBar title="나의 도전과제" /><Skeleton width="100%" height={140} /></Screen>;
  return <AchievementDashboard key={session.key} />;
}

function AchievementDashboard() {
  const router = useRouter();
  const session = useEngagementSession();
  const state = useFocusedAsync(() => engagement.achievements(), [session.key]);
  const data = session.valid() ? state.data : null;
  return (
    <Screen>
      <HeaderBar title="나의 도전과제" onBack={() => goBackOr(router, "/me")} />
      <Scroll bottom={tokens.height.tabBarClearance}>
        <View style={{ padding: tokens.space.gutter, gap: 24 }}>
          <View testID="achievement-summary" style={{ backgroundColor: tokens.color.surface, borderRadius: tokens.radius.md, padding: 20, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Icon name="sparkles" size={28} color={tokens.color.accent} />
              <T variant="title" style={{ flex: 1 }}>농가와 가까워지는 작은 시작</T>
            </View>
            <T>마음에 드는 농가를 찾고, 소식에 공감하고, 첫 인사를 건네 보세요.</T>
            {data ? <>
              <T weight="semibold" color={tokens.color.accent}>{data.total}개 중 {data.completedCount}개 달성</T>
              <View accessibilityRole="progressbar" accessibilityLabel={`도전과제 ${data.total}개 중 ${data.completedCount}개 달성`} accessibilityValue={{ min: 0, max: data.total, now: data.completedCount }} style={{ height: 6, backgroundColor: tokens.color.border, borderRadius: tokens.radius.full, overflow: "hidden" }}>
                <View style={{ height: 6, width: `${data.total ? data.completedCount / data.total * 100 : 0}%`, backgroundColor: tokens.color.accent, borderRadius: tokens.radius.full }} />
              </View>
            </> : null}
            <T variant="sub" muted>현재 저장된 활동 기준이에요. 팔로우·공감을 취소하거나 주문이 환불되면 달성 상태도 바뀔 수 있어요.</T>
          </View>
          {state.error ? <LoadError error={state.error} onRetry={state.reload} /> : null}
          {!data && state.loading ? <View style={{ gap: 16 }}><Skeleton width="100%" height={112} /><Skeleton width="100%" height={112} /></View> : null}
          {data?.tasks.map((task) => (
            <View key={task.id} testID={`achievement-${task.id}`} style={{ borderWidth: 1, borderColor: tokens.color.border, borderRadius: tokens.radius.md, padding: 20, gap: 12 }}>
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}><Icon name={task.completed ? "check" : (icons[task.id] ?? "star")} size={22} color={task.completed ? tokens.color.accent : tokens.color.textMuted} /></View>
                <T variant="heading" style={{ flex: 1 }}>{task.title}</T>
                <T variant="sub" weight="semibold" color={task.completed ? tokens.color.accent : tokens.color.textMuted}>{task.completed ? "달성" : "도전 중"}</T>
              </View>
              <T>{task.description}</T>
              {!task.completed ? <Button label={`${task.title} 하러 가기`} variant="outline" onPress={() => router.push(task.action as Href)} /> : null}
            </View>
          ))}
        </View>
      </Scroll>
    </Screen>
  );
}
