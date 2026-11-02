// farmclub 문의 대화방(DEV-150, FEAT-34 AC-34-6~8). 운영팀이 직접 답하고 AI는 답하지 않는다.
// 농가 1:1(/chats/:farmId)과 달리 농가가 없어 전용 경로를 쓴다. 사진 첨부는 받지 않는다.
import { messaging, newIdempotencyKey, privateImage } from "@farmclub/api";
import {
  ChatThread,
  ConversationHeader,
  Screen,
  SupportAvatar,
  T,
  tokens,
} from "@farmclub/ui";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { useHideTabBar } from "../../../lib/session";

export default function SupportChat() {
  useHideTabBar();
  const router = useRouter();
  const [active, setActive] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );
  const load = useCallback(() => messaging.supportMessages(), []);
  return (
    <Screen>
      <ConversationHeader
        name="farmclub"
        subtitle="고객센터"
        avatar={<SupportAvatar size={40} />}
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace("/chats?view=private")
        }
      />
      <View
        testID="support-intro"
        style={{
          padding: 12,
          gap: 4,
          borderBottomWidth: 1,
          borderBottomColor: tokens.color.border,
        }}
      >
        <T weight="semibold">farmclub 운영팀에 물어보세요</T>
        <T variant="caption" muted>
          주문·입금·배송이나 앱 사용 중 궁금한 점을 적어 보내면 운영팀이
          확인하고 답해 드려요. 이 대화방은 AI가 아니라 사람이 답해요.
        </T>
      </View>
      <ChatThread
        active={active}
        load={load}
        read={(id) => messaging.supportRead(id)}
        makeKey={newIdempotencyKey}
        loadPhoto={privateImage}
        send={(text, _ids, key) => messaging.supportSend(text, key)}
      />
    </Screen>
  );
}
