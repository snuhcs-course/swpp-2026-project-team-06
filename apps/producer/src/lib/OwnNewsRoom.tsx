import {
  farms,
  messaging,
  newIdempotencyKey,
  productPrices,
} from "@farmclub/api";
import { Button, NewsRoom, ProductShelf, T, useAsync } from "@farmclub/ui";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { useSession } from "./session";

export default function OwnNewsRoom({ active }: { active: boolean }) {
  const { user, toast } = useSession();
  const router = useRouter();
  const farmId = user?.farmId ?? "";
  const farm = useAsync(() => farms.get(farmId), [farmId]);
  const products = useAsync(
    () => productPrices(farm.data?.products ?? []),
    [farm.data?.products],
  );
  const load = useCallback(
    (cursor?: string) => messaging.roomMessages(farmId, { limit: 50, cursor }),
    [farmId],
  );
  return (
    <>
      <ProductShelf
        key={farmId}
        defaultExpanded={false}
        products={products.data ?? farm.data?.products ?? []}
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
          send={(text, key) => messaging.sendRoom(farmId, text, key)}
          react={(id, liked) =>
            liked ? messaging.unreact(id) : messaging.react(id)
          }
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
