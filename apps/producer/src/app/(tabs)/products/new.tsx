import {
  catalog,
  isMock,
  newIdempotencyKey,
  sourceAnalysis,
} from "@farmclub/api";
import { Button, HeaderBar, Screen, T, tokens } from "@farmclub/ui";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useHideTabBar } from "../../../lib/session";

export default function NewProduct() {
  useHideTabBar();
  const router = useRouter();
  const product = useRef<ReturnType<typeof catalog.create> | null>(null);
  const request = useRef<ReturnType<typeof sourceAnalysis.create> | null>(null);
  const key = useRef(newIdempotencyKey());
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [productId, setProductId] = useState<string | null>(null);
  useEffect(() => {
    if (isMock) return;
    let alive = true;
    setError("");
    if (!product.current) product.current = catalog.create();
    if (!request.current)
      request.current = product.current.then((p) =>
        sourceAnalysis.create(
          [{ name: p.name || "새 상품", productId: p.productId }],
          key.current,
        ),
      );
    void product.current
      .then((p) => {
        if (alive) setProductId(p.productId);
      })
      .catch(() => {});
    void request.current
      .then((batch) => {
        if (alive)
          router.replace({
            pathname: "/products/source-analysis",
            params: { batchId: batch.id },
          });
      })
      .catch(() => {
        if (alive) setError("자료 작업을 열지 못했어요. 연결을 확인해 주세요.");
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
            {productId ? (
              <>
                <Button
                  label="자료 작업 다시 열기"
                  onPress={() => {
                    request.current = null;
                    setAttempt((n) => n + 1);
                  }}
                />
                <Button
                  label="상품 정보 직접 입력"
                  variant="outline"
                  onPress={() => router.replace(`/products/${productId}/edit`)}
                />
              </>
            ) : (
              <Button
                label="상품 목록 확인"
                onPress={() => router.replace("/products")}
              />
            )}
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
