import { isMock, newIdempotencyKey, productWorkspace } from "@farmclub/api";
import { Button, HeaderBar, Screen, T, tokens } from "@farmclub/ui";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useHideTabBar } from "../../../lib/session";

export default function NewProduct() {
  useHideTabBar();
  const router = useRouter();
  const request = useRef<ReturnType<typeof productWorkspace.open> | null>(null);
  const key = useRef(newIdempotencyKey());
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    if (isMock) return;
    let alive = true;
    setError("");
    if (!request.current)
      request.current = productWorkspace.open(undefined, key.current);
    void request.current
      .then((workspace) => {
        if (alive)
          router.replace({
            pathname: "/products/source-analysis",
            params: { batchId: workspace.batchId },
          });
      })
      .catch(() => {
        if (alive) setError("새 상품을 열지 못했어요. 다시 시도해 주세요.");
      });
    return () => {
      alive = false;
    };
  }, [attempt, router]);
  if (isMock) return <Redirect href="/products/manual" />;
  return (
    <Screen>
      <HeaderBar title="새 상품" onBack={() => router.replace("/products")} />
      <View style={{ padding: tokens.space.gutter, gap: tokens.space.md }}>
        {error ? (
          <>
            <T>{error}</T>
            <Button
              label="자료 작업 다시 열기"
              onPress={() => {
                request.current = null;
                setAttempt((n) => n + 1);
              }}
            />
          </>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <ActivityIndicator color={tokens.color.accent} />
            <T>새 상품 자료 화면을 열고 있어요</T>
          </View>
        )}
      </View>
    </Screen>
  );
}
