// farmclub 운영팀 대화방 `/support` (DEV-209, FEAT-34 AC-34-9) — design: docs/design/proposals/dev-209-suspended-rejected-contact.html
// 정지·반려 농가가 상태 화면에서 연다. 탭 밖 주소라 관문(lib/gate)이 정지·반려 상태에서도 연다.
// 방이 없는 정지·반려 농가는 서버가 처음 열 때 만든다. AI는 답하지 않고, 사진은 지금 farmclub 방처럼 붙인다.
import {
  messaging,
  newIdempotencyKey,
  privateImage,
  uploadAttachment,
} from "@farmclub/api";
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

import { useSession } from "../lib/session";

const NOTE: Record<string, string> = {
  SUSPENDED: "계정이 정지된 동안에는 이 대화방만 쓸 수 있어요",
  REJECTED: "신청 결과에 궁금한 점을 남겨 주세요. 운영팀이 이 대화방으로 답해 드려요.",
};

export default function Support() {
  const router = useRouter();
  const { user } = useSession();
  const [active, setActive] = useState(false);
  const [threadId, setThreadId] = useState<string>();
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );
  const load = useCallback(async (cursor?: string) => {
    const p = await messaging.producerSupportMessages({ cursor });
    setThreadId(p.thread.threadId);
    return p;
  }, []);
  const status = user?.farmStatus ?? "";
  // 뒤로: 정지·반려 상태 화면으로. 승인 농가는 채팅 목록으로
  const back =
    status === "SUSPENDED"
      ? "/suspended"
      : status === "REJECTED"
        ? "/pending"
        : "/chats?view=private";
  return (
    <Screen>
      <ConversationHeader
        name="farmclub"
        subtitle="운영팀"
        avatar={<SupportAvatar size={40} />}
        onBack={() => router.replace(back as never)}
      />
      {NOTE[status] ? (
        <View
          testID="support-status-note"
          style={{
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: tokens.color.border,
          }}
        >
          <T variant="sub" muted center>
            {NOTE[status]}
          </T>
        </View>
      ) : null}
      <ChatThread
        producer
        active={active}
        load={load}
        makeKey={newIdempotencyKey}
        read={(id) => messaging.producerSupportRead(id)}
        loadPhoto={privateImage}
        upload={(f) => uploadAttachment(f, { threadId })}
        send={(text, ids, key) => messaging.producerSupportSend(text, ids, key)}
        placeholder="운영팀에 문의 남기기"
      />
    </Screen>
  );
}
