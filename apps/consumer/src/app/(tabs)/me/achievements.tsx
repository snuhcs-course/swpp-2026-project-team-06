import { engagement, type Achievement } from "@farmclub/api";
import { BrandLogo, HeaderBar, Icon, Screen, Scroll, Skeleton, T, focusRing, tokens, type IconName } from "@farmclub/ui";
import { Redirect, useRouter, type Href } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useSession } from "../../../lib/session";
import { useEngagementSession } from "../../../lib/engagementSession";
import { useFocusedAsync } from "../../../lib/useFocusedAsync";
import { goBackOr } from "../../../lib/nav";
import { LoadError } from "../../../lib/views";

const activities: Record<string, { icon: IconName; label: string; caption?: string }> = {
  first_follow: { icon: "heart", label: "팔로우" },
  first_reaction: { icon: "star", label: "공감", caption: "소식에 좋아요를 남겨요" },
  first_message: { icon: "chat", label: "인사" },
  first_purchase: { icon: "box", label: "구매" },
  first_review: { icon: "pencil", label: "후기" },
};

export default function Achievements() {
  const { ready, user } = useSession();
  const session = useEngagementSession();
  if (ready && !user) return <Redirect href={{ pathname: "/login", params: { next: "/me/achievements" } }} />;
  if (!session.valid()) return <Screen><HeaderBar title="나의 도전과제" /><Skeleton width="100%" height={140} /></Screen>;
  return <AchievementDashboard key={session.key} />;
}

function ActivityRow({ task, onPress, last }: { task: Achievement; onPress: () => void; last: boolean }) {
  const activity = activities[task.id] ?? { icon: "star" as const, label: task.title };
  const description = activities[task.id]?.caption ?? task.description;
  const content = <>
    <View style={[styles.activityIcon, { backgroundColor: task.completed ? tokens.color.accentSoft : tokens.color.surface }]}>
      <Icon name={activity.icon} size={23} color={task.completed ? tokens.color.accent : tokens.color.textMuted} />
      {task.completed ? <View style={styles.checkBadge}><Icon name="check" size={11} color={tokens.color.onAccent} /></View> : null}
    </View>
    <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <T weight="semibold">{task.title}</T>
        <View style={[styles.status, task.completed && { backgroundColor: tokens.color.accentSoft }]}>
          <T variant="caption" weight="semibold" color={task.completed ? tokens.color.accentPressed : tokens.color.textMuted}>{task.completed ? "달성" : "도전 중"}</T>
        </View>
      </View>
      <T variant="sub" muted>{description}</T>
    </View>
    {!task.completed ? <Icon name="chevron" size={20} color={tokens.color.textMuted} /> : null}
  </>;
  const style = [styles.activity, !last && { borderBottomWidth: 1, borderBottomColor: tokens.color.border }];
  return <View testID={`achievement-${task.id}`}>
    {task.completed ? <View style={style}>{content}</View> : (
      <Pressable accessibilityRole="button" accessibilityLabel={`${task.title}, 도전 중. ${description}. 하러 가기`} onPress={onPress}
        style={({ pressed, ...state }) => [style, pressed && { backgroundColor: tokens.color.surface }, (state as { focused?: boolean }).focused && focusRing]}>
        {content}
      </Pressable>
    )}
  </View>;
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
        <View style={{ padding: tokens.space.gutter, gap: 28 }}>
          <View testID="achievement-summary" style={styles.summary}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <View style={{ flex: 1, gap: 5 }}>
                <T variant="sub" muted>농가와 가까워지는</T>
                <T variant="title">나의 작은 발자국</T>
                {data ? <T variant="sub" color={tokens.color.accentPressed} weight="semibold">{data.total}개 중 {data.completedCount}개 달성</T> : <Skeleton width={112} height={20} />}
              </View>
              <View style={styles.brandMark}><BrandLogo variant="icon" width={42} decorative /></View>
            </View>
            {data ? <View accessibilityRole="progressbar" accessibilityLabel={`도전과제 ${data.total}개 중 ${data.completedCount}개 달성`}
              accessibilityValue={{ min: 0, max: data.total, now: data.completedCount }} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              {data.tasks.map(task => {
                const activity = activities[task.id] ?? { icon: "star" as const, label: task.title };
                return <View key={task.id} style={{ alignItems: "center", gap: 7, flex: 1 }} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <View style={[styles.stamp, task.completed ? styles.stampComplete : styles.stampPending]}>
                    <Icon name={activity.icon} size={21} color={task.completed ? tokens.color.onAccent : tokens.color.textMuted} />
                  </View>
                  <T variant="caption" weight={task.completed ? "semibold" : "regular"} color={task.completed ? tokens.color.accentPressed : tokens.color.textMuted}>{activity.label}</T>
                </View>;
              })}
            </View> : <Skeleton width="100%" height={63} />}
          </View>
          {state.error ? <LoadError error={state.error} onRetry={state.reload} /> : null}
          {!data && state.loading ? <View style={{ gap: 16 }}><Skeleton width="100%" height={112} /><Skeleton width="100%" height={112} /></View> : null}
          {data ? <View style={{ gap: 12 }}>
            <View style={{ gap: 4 }}>
              <T variant="heading">하나씩, 내 속도로</T>
              <T variant="sub" muted>마음이 가는 활동부터 시작해 보세요.</T>
            </View>
            <View style={styles.activities}>
              {data.tasks.map((task, index) => <ActivityRow key={task.id} task={task} last={index === data.tasks.length - 1} onPress={() => router.push(task.action as Href)} />)}
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingTop: 4 }}>
              <View style={{ paddingTop: 2 }}><Icon name="question" size={16} color={tokens.color.textMuted} /></View>
              <T variant="sub" muted style={{ flex: 1 }}>현재 저장된 활동 기준이에요. 팔로우·공감을 취소하거나 주문이 환불되면 달성 상태도 바뀔 수 있어요.</T>
            </View>
          </View> : null}
        </View>
      </Scroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { padding: 20, gap: 20, borderRadius: tokens.radius.md, backgroundColor: tokens.color.surface },
  brandMark: { width: 70, height: 70, borderRadius: tokens.radius.full, alignItems: "center", justifyContent: "center", backgroundColor: tokens.color.background },
  stamp: { width: 38, height: 38, borderRadius: tokens.radius.full, alignItems: "center", justifyContent: "center" },
  stampComplete: { backgroundColor: tokens.color.accent, borderWidth: 1, borderColor: tokens.color.accent },
  stampPending: { backgroundColor: tokens.color.background, borderWidth: 1, borderStyle: "dashed", borderColor: tokens.color.border },
  activities: { borderWidth: 1, borderColor: tokens.color.border, borderRadius: tokens.radius.md, paddingHorizontal: 16 },
  activity: { minHeight: 90, paddingVertical: 16, flexDirection: "row", alignItems: "center", gap: 14 },
  activityIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  checkBadge: { position: "absolute", right: -3, bottom: -3, width: 18, height: 18, borderRadius: tokens.radius.full, borderWidth: 2, borderColor: tokens.color.background, backgroundColor: tokens.color.accent, alignItems: "center", justifyContent: "center" },
  status: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: tokens.radius.full, backgroundColor: tokens.color.surface },
});
