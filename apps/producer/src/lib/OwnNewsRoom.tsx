import {
  farms,
  messaging,
  newIdempotencyKey,
  productPrices,
} from "@farmclub/api";
import { Button, NewsRoom, RoomShelf, T, useAsync } from "@farmclub/ui";
import { useRouter } from "expo-router";
import { useCallback, useEffect } from "react";
import { useSession } from "./session";
import { copyText } from "./views";

export default function OwnNewsRoom({ active }: { active: boolean }) {
  const { user, toast } = useSession();
  const router = useRouter();
  const farmId = user?.farmId ?? "";
  const farm = useAsync(() => farms.get(farmId), [farmId]);
  useEffect(() => {
    if (active) void farm.reload();
  }, [active, farm.reload]);
  const products = useAsync(
    () => productPrices(farm.data?.products ?? []),
    [farm.data?.products],
  );
  const load = useCallback(
    (cursor?: string) => messaging.roomMessages(farmId, { limit: 50, cursor }),
    [farmId],
  );
  const fanReplies = useCallback(
    (broadcastId: string, cursor?: string) =>
      messaging.fanReplies(farmId, broadcastId, { limit: 50, cursor }),
    [farmId],
  );
  const readFanReplies = useCallback(
    (broadcastId: string, lastReadMessageId: string) =>
      messaging.readFanReplies(farmId, broadcastId, lastReadMessageId),
    [farmId],
  );
  return (
    <>
      {/* 한 줄 ‘판매 중 N개 · 팔로워 N명’, 기본 접힘(DEV-295, Figma 7:90) */}
      <RoomShelf
        key={farmId}
        products={products.data ?? farm.data?.products ?? []}
        summary={farm.data ? `팔로워 ${farm.data.followerCount}명` : undefined}
        onProduct={(id) => router.push(`/products/${id}/edit`)}
      />
      {farm.error ? (
        <>
          <T muted>판매 품목을 불러오지 못했어요</T>
          <Button
            label="판매 품목 다시 시도"
            variant="text"
            onPress={farm.reload}
          />
        </>
      ) : null}
      {user && farmId ? (
        <NewsRoom
          key={farmId + user.userId}
          userId={user.userId}
          producer
          active={active}
          load={load}
          makeKey={newIdempotencyKey}
          onAttach={() => router.push("/broadcast/new")}
          edit={(id, text, version, key) => messaging.editRoomMessage(farmId, id, text, version, key)}
          send={(text, key, replyId, replyVersion) => messaging.sendRoom(farmId, text, key, replyId, replyVersion)}
          recipientCount={farm.data?.followerCount ?? null}
          remove={(id) => messaging.deleteNews(id)}
          copy={copyText}
          notify={toast}
          react={(id, liked) =>
            liked ? messaging.unreact(id) : messaging.react(id)
          }
          // 소식별 ‘답장 N ›’ 팬 답장 시트(DEV-297, Figma 7:93)
          fanReplies={fanReplies}
          readFanReplies={readFanReplies}
          onPrivateReply={async (consumerId, replyId) => {
            try {
              await messaging.producerStart(consumerId, replyId);
              router.push(`/chats/${consumerId}`);
            } catch (e) {
              toast(e instanceof Error ? e.message : "대화를 열지 못했어요");
            }
          }}
        />
      ) : null}
    </>
  );
}
