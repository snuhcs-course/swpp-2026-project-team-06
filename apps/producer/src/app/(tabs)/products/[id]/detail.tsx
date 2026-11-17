import {
  ApiError,
  isMock,
  newIdempotencyKey,
  productWorkspace,
  sourceAnalysis,
} from "@farmclub/api";
import { Button, HeaderBar, Screen, T, tokens } from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { goBackOr } from "../../../../lib/nav";
import { ProductPageEditor } from "../../../../lib/ProductPageEditor";
import { useHideTabBar } from "../../../../lib/session";

/**
 * 판매페이지 수정(상품 카드·SCR-25·딥 링크). DEV-346: 모든 상태의 상품을 새 상품과 같은 화면(composer)으로 연다.
 * 서버가 상품에 묶인 자료 작업(batch)을 열고, composer 밖에서 만든 페이지는 처음 한 번 지금 내용 그대로 초안으로 옮긴다.
 * 서버가 옮기지 못한 페이지(composer 칸에 다 안 들어감)·자료 분석이 꺼진 서버·Mock은 기존 편집기.
 */
export default function ProductDetailEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [legacy, setLegacy] = useState(isMock);
  // 기존 편집기 수정본 때문에 composer로 못 옮긴 경우(DEV-346): 거기서 반영하면 composer 작업이 사라진다고 알린다.
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  // 서버가 응답했지만 실패(5xx·예상 밖 4xx)면 기존 편집기로도 열 수 있게 한다(origin/main은 늘 기존 편집기였다).
  const [serverError, setServerError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const key = useRef(newIdempotencyKey());
  useEffect(() => {
    if (isMock || !id) return;
    let alive = true;
    setError("");
    void (async () => {
      const config = await sourceAnalysis.config();
      if (!config.enabled) return null;
      const workspace = await productWorkspace
        .open(id, key.current, false, undefined, true)
        .catch((e) => {
          // composer를 모르는 예전 서버는 이 칸을 400(VALIDATION_ERROR fields.composer)으로 거절한다 → 기존 편집기
          if (e instanceof ApiError && e.details?.fields?.composer) return null;
          throw e;
        });
      // false(서버가 옮기지 못한 페이지)도 기존 편집기
      if (alive && workspace?.composerBlocked === "LEGACY_REVISION") setBlocked(true);
      return workspace?.composer
        ? {
            batchId: workspace.batchId,
            notice:
              workspace.composerNotice === "PAGE_AND_AI_REPLACED"
                ? "replaced-ai"
                : workspace.composerNotice === "PAGE_REPLACED"
                  ? "replaced"
                  : undefined,
          }
        : null;
    })()
      .then((opened) => {
        if (!alive) return;
        if (!opened) setLegacy(true);
        else {
          // '이미 반영한 초안' 기억(DEV-184)은 지우지 않는다: 서버가 페이지를 다시 옮기면 초안 id가 새로 생겨 맞지 않는다.
          router.replace({
            pathname: "/products/source-analysis",
            // 다른 화면에서 반영한 페이지로 새로 불러왔으면 composer가 알린다(DEV-346)
            params: { batchId: opened.batchId, composer: "1", ...(opened.notice ? { notice: opened.notice } : {}) },
          });
        }
      })
      .catch((e) => {
        if (!alive) return;
        setServerError(e instanceof ApiError);
        setError("판매페이지를 열지 못했어요. 다시 시도해 주세요.");
      });
    return () => {
      alive = false;
    };
  }, [id, attempt, router]);
  // 기존 편집기는 origin/main과 같이 자기 화면에서 탭 바를 다룬다.
  if (legacy)
    return (
      <ProductPageEditor
        productId={id}
        warning={
          blocked
            ? "새 화면에 저장한 수정이 있어요. 여기서 반영하면 그 수정은 사라져요."
            : undefined
        }
      />
    );
  return (
    <Opening
      error={error}
      onRetry={() => setAttempt((n) => n + 1)}
      onLegacy={serverError ? () => setLegacy(true) : undefined}
    />
  );
}

/** composer로 넘어가기 전 여는 중·실패 화면(작업 화면이라 탭 바를 숨긴다). */
function Opening({
  error,
  onRetry,
  onLegacy,
}: {
  error: string;
  onRetry: () => void;
  onLegacy?: () => void;
}) {
  useHideTabBar();
  const router = useRouter();
  return (
    <Screen>
      <HeaderBar title="판매페이지" onBack={() => goBackOr(router, "/products")} />
      <View style={{ padding: tokens.space.gutter, gap: tokens.space.md }}>
        {error ? (
          <>
            <T>{error}</T>
            <Button label="다시 열기" onPress={onRetry} />
            {onLegacy ? (
              <>
                <Button label="기존 편집기로 열기" variant="outline" onPress={onLegacy} />
                <T variant="caption" muted>
                  새 화면에 저장한 수정은 기존 편집기에 보이지 않아요
                </T>
              </>
            ) : null}
          </>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <ActivityIndicator color={tokens.color.accent} />
            <T>판매페이지를 열고 있어요</T>
          </View>
        )}
      </View>
    </Screen>
  );
}
