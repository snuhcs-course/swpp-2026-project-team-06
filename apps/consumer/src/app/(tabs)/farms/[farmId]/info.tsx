import { farms } from "@farmclub/api";
import {
  Button,
  Sheet,
  HeaderBar,
  ProfileAvatar,
  Screen,
  Scroll,
  T,
  tokens,
  useAsync,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { useEffect, useState } from "react";
import { useSession } from "../../../../lib/session";
import { LoadError, copyText } from "../../../../lib/views";
import { useToast } from "../../../../lib/toast";
export default function FarmInfo() {
  const { farmId } = useLocalSearchParams<{ farmId: string }>();
  const router = useRouter();
  const { user, requireLogin, resume, clearResume } = useSession();
  const farm = useAsync(() => farms.get(farmId), [farmId, user?.userId]);
  const [confirm, setConfirm] = useState(false);
  const here = `/farms/${farmId}/info`;
  const start = () => router.push(`/chats/${farmId}?start=1`);
  const chat = () => (farm.data?.isFollowing ? start() : setConfirm(true));
  useEffect(() => {
    if (
      user &&
      farm.data &&
      !farm.loading &&
      resume?.next === here &&
      resume.action === "chat"
    ) {
      clearResume();
      chat();
    }
  }, [user?.userId, farm.data, farm.loading, resume]);
  const toast = useToast();
  return (
    <Screen>
      <HeaderBar
        title="농가 정보"
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace(`/farms/${farmId}`)
        }
      />
      <Scroll bottom={tokens.height.tabBarClearance}>
        {farm.error ? (
          <LoadError error={farm.error} onRetry={farm.reload} />
        ) : null}
        {farm.data ? (
          <View style={{ padding: 20, gap: 24 }}>
            <ProfileAvatar
              name={farm.data.name}
              uri={farm.data.photo}
              size={64}
            />
            <T variant="title">{farm.data.name}</T>
            <T muted>{farm.data.region}</T>
            <T>{farm.data.intro}</T>
            <Button
              label="소식방으로"
              onPress={() => router.replace(`/farms/${farmId}`)}
            />
            <Button
              label="1:1 채팅"
              variant="secondary"
              onPress={() => requireLogin("chat", here, chat)}
            />
            <Button
              label="농가 링크 공유"
              variant="text"
              onPress={async () =>
                toast.show(
                  (await copyText(farm.data!.shareUrl))
                    ? "링크를 복사했어요"
                    : farm.data!.shareUrl,
                )
              }
            />
          </View>
        ) : null}
      </Scroll>
      <Sheet visible={confirm} onClose={() => setConfirm(false)}>
        <T variant="heading">팔로우하고 대화를 시작해요</T>
        <T>농가를 팔로우하면 소식과 함께 1:1로 이야기할 수 있어요.</T>
        <Button
          label="시작하기"
          onPress={() => {
            setConfirm(false);
            start();
          }}
        />
        <Button
          label="아니요"
          variant="secondary"
          onPress={() => setConfirm(false)}
        />
      </Sheet>
      {toast.node}
    </Screen>
  );
}
