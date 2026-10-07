// SCR-17 하위: 배송지 관리 `/me/addresses` (FEAT-08, 결정 28) — design: s-17-addresses, s-17-deletesheet
import { auth, type Address } from "@farmclub/api";
import {
  BottomBar,
  Button,
  EmptyState,
  HeaderBar,
  Screen,
  Scroll,
  Sheet,
  Skeleton,
  T,
  tokens,
  useAsync,
} from "@farmclub/ui";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";

import { takeFlash } from "../../../../lib/flash";
import { useHideTabBar } from "../../../../lib/session";
import { useToast } from "../../../../lib/toast";
import { LoadError } from "../../../../lib/views";

export default function Addresses() {
  useHideTabBar();
  const router = useRouter();
  const list = useAsync(() => auth.addresses(), []);
  const [target, setTarget] = useState<Address | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast(120);

  useFocusEffect(
    useCallback(() => {
      void list.reload();
      // 배송지 입력에서 저장하고 돌아오면 '저장했어요'
      const m = takeFlash();
      if (m) toast.show(m);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  async function makeDefault(a: Address) {
    try {
      await auth.updateAddress(a.addressId, { isDefault: true });
      await list.reload();
      toast.show("저장했어요");
    } catch (e) {
      toast.fail(e, () => void makeDefault(a));
    }
  }

  async function remove(a: Address) {
    setBusy(true);
    try {
      await auth.deleteAddress(a.addressId);
      setTarget(null);
      await list.reload();
      toast.show("배송지를 지웠어요");
    } catch (e) {
      setTarget(null);
      toast.fail(e, () => void remove(a));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <HeaderBar
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/me")
        }
      />
      <Scroll bottom={140}>
        <T
          variant="title"
          style={{ paddingHorizontal: 20 }}
          accessibilityRole="header"
        >
          배송지
        </T>
        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          {list.error && !list.data ? (
            <LoadError error={list.error} onRetry={list.reload} />
          ) : null}
          {!list.data && !list.error ? (
            <Skeleton width="100%" height={120} />
          ) : null}
          {list.data?.length === 0 ? (
            <EmptyState icon="home" title="저장한 배송지가 없어요" />
          ) : null}
          {list.data?.map((a, i, arr) => (
            <View
              key={a.addressId}
              style={{
                paddingVertical: 16,
                gap: 4,
                borderTopWidth: 1,
                borderTopColor: tokens.color.border,
                borderBottomWidth: i === arr.length - 1 ? 1 : 0,
                borderBottomColor: tokens.color.border,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <T variant="body" weight="semibold">
                  {a.recipientName} · {a.recipientPhone}
                </T>
                {a.isDefault ? (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 999,
                      backgroundColor: tokens.color.surface,
                    }}
                  >
                    <T variant="caption" weight="semibold">
                      기본
                    </T>
                  </View>
                ) : (
                  <TextLink
                    label="기본으로"
                    muted
                    onPress={() => void makeDefault(a)}
                  />
                )}
              </View>
              <T variant="body">
                {a.address}
                {a.addressDetail ? `, ${a.addressDetail}` : ""}
              </T>
              <T variant="sub" muted>
                {a.postalCode}
                {a.label ? ` · ${a.label}` : ""}
              </T>
              <View style={{ flexDirection: "row", gap: 16, marginTop: 4 }}>
                <TextLink
                  label="수정"
                  onPress={() =>
                    router.push({
                      pathname: "/me/addresses/edit",
                      params: { addressId: a.addressId },
                    })
                  }
                />
                <TextLink label="삭제" onPress={() => setTarget(a)} />
              </View>
            </View>
          ))}
        </View>
      </Scroll>
      <BottomBar>
        <Button
          label="새 배송지 추가"
          onPress={() => router.push("/me/addresses/edit")}
        />
      </BottomBar>
      <Sheet visible={!!target} onClose={() => setTarget(null)}>
        <T variant="heading">이 배송지를 지울까요?</T>
        <T variant="body">
          {target?.address}
          {target?.addressDetail ? `, ${target.addressDetail}` : ""} ·{" "}
          {target?.recipientName}
        </T>
        <T variant="sub" muted>
          지난 주문에 적힌 주소는 바뀌지 않아요.
        </T>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Button
            label="아니요"
            variant="secondary"
            onPress={() => setTarget(null)}
            style={{ flex: 1 }}
          />
          <Button
            label="지우기"
            loading={busy}
            onPress={() => target && void remove(target)}
            style={{ flex: 2 }}
          />
        </View>
      </Sheet>
      {toast.node}
    </Screen>
  );
}

/** 15 굵은 글자 버튼, 누르는 영역 48 */
function TextLink({
  label,
  onPress,
  muted,
}: {
  label: string;
  onPress: () => void;
  muted?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ minHeight: 48, minWidth: 48, justifyContent: "center" }}
    >
      <T variant="sub" weight="semibold" muted={muted}>
        {label}
      </T>
    </Pressable>
  );
}
