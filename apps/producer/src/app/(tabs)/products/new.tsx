import {
  isMock,
  newIdempotencyKey,
  productWorkspace,
  sourceAnalysis,
  type ProductWorkspace,
} from "@farmclub/api";
import { Button, HeaderBar, Screen, T, tokens } from "@farmclub/ui";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useHideTabBar } from "../../../lib/session";

export default function NewProduct() {
  useHideTabBar();
  const router = useRouter();
  // null이면 자료 분석이 꺼진 서버(운영 배포 보류)라 기존 문구/직접 입력으로 간다(DEV-84)
  const request = useRef<Promise<ProductWorkspace | null> | null>(null);
  const key = useRef(newIdempotencyKey());
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    if (isMock) return;
    let alive = true;
    setError("");
    if (!request.current)
      request.current = sourceAnalysis
        .config()
        .then((config) =>
          config.enabled ? productWorkspace.open(undefined, key.current) : null,
        );
    void request.current
      .then((workspace) => {
        if (!alive) return;
        if (!workspace) router.replace("/products/manual");
        else
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
