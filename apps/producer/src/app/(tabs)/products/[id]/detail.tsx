import {
  ApiError,
  isMock,
  newIdempotencyKey,
  productWorkspace,
  sourceAnalysis,
  type ProductWorkspace,
} from "@farmclub/api";
import { Button, HeaderBar, Notice, Screen, T, tokens } from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { goBackOr } from "../../../../lib/nav";
import { NewProductComposer } from "../../../../lib/NewProductComposer";
import { useHideTabBar, useSession } from "../../../../lib/session";

/**
 * 상품 수정(상품 카드·'상품 수정'·예전 `/edit`·`/stages`·딥 링크). DEV-361 PR C: 상품 하나를 이 화면(composer)에서 고친다.
 * 자료 분석이 켜진 서버는 상품에 묶인 자료 작업(batch)을 열어 composer로 바꿔 연다(DEV-346).
 * Mock·자료 분석이 꺼진 서버·서버가 composer로 못 옮긴 페이지는 같은 composer를 상품만으로 연다(AI 없음, C-1).
 * `?terms=1`은 composer까지 넘겨 판매 조건 시트를 연다(C-13).
 */
export default function ProductDetailEditor() {
  const { id, terms, from } = useLocalSearchParams<{ id: string; terms?: string; from?: string }>();
  const router = useRouter();
  const { user } = useSession();
  const [productOnly, setProductOnly] = useState(isMock);
  // 예전 편집기 수정본이 composer 작업과 겹쳐 서버가 composer로 열지 않았다(DEV-346 LEGACY_REVISION, C-17)
  const [blocked, setBlocked] = useState<ProductWorkspace | null>(null);
  const [error, setError] = useState("");
  // 서버가 응답했지만 실패(5xx·예상 밖 4xx)면 상품만으로도 열 수 있게 한다
  const [serverError, setServerError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [discard, setDiscard] = useState<number | null>(null);
  const key = useRef(newIdempotencyKey());
  useEffect(() => {
    if (isMock || !id || productOnly) return;
    let alive = true;
    setError("");
    void (async () => {
      const config = await sourceAnalysis.config();
      if (!config.enabled) return null;
      const workspace = await productWorkspace
        .open(id, key.current, discard !== null, discard ?? undefined, true)
        .catch((e) => {
          // composer를 모르는 예전 서버는 이 칸을 400(VALIDATION_ERROR fields.composer)으로 거절한다 → 상품만 열기
          if (e instanceof ApiError && e.details?.fields?.composer) return null;
          throw e;
        });
      if (alive && workspace?.composerBlocked === "LEGACY_REVISION") {
        setBlocked(workspace);
        return "blocked" as const;
      }
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
        if (!alive || opened === "blocked") return;
        if (!opened) setProductOnly(true);
        else {
          // '이미 반영한 초안' 기억(DEV-184)은 지우지 않는다: 서버가 페이지를 다시 옮기면 초안 id가 새로 생겨 맞지 않는다.
          router.replace({
            pathname: "/products/source-analysis",
            // 다른 화면에서 반영한 페이지로 새로 불러왔으면 composer가 알린다(DEV-346)
            params: {
              batchId: opened.batchId,
              composer: "1",
              ...(opened.notice ? { notice: opened.notice } : {}),
              ...(terms === "1" ? { terms: "1" } : {}),
              ...(from === "sales" ? { from } : {}),
            },
          });
        }
      })
      .catch((e) => {
        if (!alive) return;
        setServerError(e instanceof ApiError);
        setError("상품을 열지 못했어요. 다시 시도해 주세요.");
      });
    return () => {
      alive = false;
    };
  }, [id, attempt, router, productOnly, discard, terms, from]);
  if (productOnly && id) return <NewProductComposer key={`${user?.userId ?? ""}:${id}`} productId={id} />;
  return (
    <Opening
      error={error}
      blocked={!!blocked}
      onRetry={() => setAttempt((n) => n + 1)}
      onDiscard={() => {
        if (!blocked) return;
        // 같은 키로 다른 본문을 보내지 않게 새 멱등 키
        key.current = newIdempotencyKey();
        setBlocked(null);
        setDiscard(blocked.version);
      }}
      onProductOnly={serverError || blocked ? () => setProductOnly(true) : undefined}
    />
  );
}

/** composer로 넘어가기 전 여는 중·실패 화면(작업 화면이라 탭 바를 숨긴다). */
function Opening({
  error,
  blocked,
  onRetry,
  onDiscard,
  onProductOnly,
}: {
  error: string;
  blocked: boolean;
  onRetry: () => void;
  onDiscard: () => void;
  onProductOnly?: () => void;
}) {
  useHideTabBar();
  const router = useRouter();
  return (
    <Screen>
      <HeaderBar title="상품 수정" onBack={() => goBackOr(router, "/products")} />
      <View style={{ padding: tokens.space.gutter, gap: tokens.space.md }}>
        {blocked ? (
          <>
            <Notice
              title="예전 판매페이지 화면에 반영하지 않은 수정이 있어요."
              body="그 수정을 버리고 열거나, 판매페이지는 그대로 두고 상품만 열 수 있어요."
            />
            <Button label="그 수정 버리고 열기" onPress={onDiscard} />
            {onProductOnly ? <Button label="상품만 열기" variant="outline" onPress={onProductOnly} /> : null}
          </>
        ) : error ? (
          <>
            <T>{error}</T>
            <Button label="다시 열기" onPress={onRetry} />
            {onProductOnly ? (
              <>
                <Button label="상품만 열기" variant="outline" onPress={onProductOnly} />
                <T variant="caption" muted>
                  상품만 열면 AI 초안과 판매페이지 편집기는 쓸 수 없어요
                </T>
              </>
            ) : null}
          </>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <ActivityIndicator color={tokens.color.accent} />
            <T>상품을 열고 있어요</T>
          </View>
        )}
      </View>
    </Screen>
  );
}
