// SCR-24 AI 상품 초안 (FEAT-03, M-10~12, N-04) — design: p-scr-24, s-24-loading, p-scr-24-result, s-24-fail
import { ApiError, catalog, type Draft, type DraftFields } from "@farmclub/api";
import {
  BottomBar,
  Button,
  HeaderBar,
  Icon,
  Notice,
  Screen,
  Scroll,
  T,
  safe,
  tokens,
} from "@farmclub/ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, TextInput, View } from "react-native";

import { useHideTabBar } from "../../../lib/session";
import { errMsg } from "../../../lib/views";

const MAX = 3000;
const LABEL: Record<keyof DraftFields, string> = {
  name: "상품명",
  variety: "품종",
  options: "중량 옵션",
  expectedBrix: "예상 당도",
  grade: "등급",
  deliveryWindow: "받는 시기",
  description: "설명",
};
const KEYS = Object.keys(LABEL) as (keyof DraftFields)[];

function shown(k: keyof DraftFields, v: DraftFields[keyof DraftFields]) {
  if (v == null) return "";
  if (k === "options") return (v as string[]).join(" · ");
  if (k === "expectedBrix") return `${v}Brix`;
  return String(v);
}

export default function NewProduct() {
  useHideTabBar();
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function make() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setFailed(false);
    setError(null);
    try {
      const d = await catalog.createDraft(text);
      if (d.failed) setFailed(true);
      else setDraft(d);
    } catch (e) {
      // 실패·시간 초과: 붙여넣은 글은 그대로 두고 직접 입력으로(AC-03-3)
      if (e instanceof ApiError && e.code === "VALIDATION_ERROR")
        setError(e.message);
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function toEdit(draftId?: string) {
    setCreating(true);
    setError(null);
    try {
      const p = await catalog.create(draftId);
      router.replace(`/products/${p.productId}/edit`);
    } catch (e) {
      setError(errMsg(e, "만들지 못했어요. 다시 시도해 주세요."));
      setCreating(false);
    }
  }

  const back = () =>
    draft
      ? setDraft(null)
      : router.canGoBack()
        ? router.back()
        : router.replace("/products");

  /* ---------- 결과 ---------- */
  if (draft) {
    const x = draft.extracted;
    // 받는 시기는 문구의 말(예: ‘11월 중순’)을 날짜로 다시 정해야 해서 늘 확인 필요
    const need = KEYS.filter((k) => k === "deliveryWindow" || x[k] == null);
    const filled = KEYS.length - need.length;
    return (
      <Screen>
        <HeaderBar title="새 상품" onBack={back} />
        <Scroll bottom={140}>
          <View style={{ paddingHorizontal: 20, gap: 8, paddingTop: 8 }}>
            <T variant="heading" accessibilityRole="header">
              초안이 나왔어요
            </T>
            <T variant="body">
              {KEYS.length}칸 중 {filled}칸을 채웠어요.{"\n"}
              {need.length ? (
                <>
                  <T variant="body" weight="bold">
                    빈 칸 {need.length}개
                  </T>
                  만 확인해 주세요.
                </>
              ) : (
                "편집에서 한 번 더 확인해 주세요."
              )}
            </T>
          </View>
          <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
            {KEYS.map((k) =>
              need.includes(k) ? (
                <View
                  key={k}
                  style={{
                    gap: 4,
                    padding: 16,
                    paddingHorizontal: 16,
                    marginVertical: 8,
                    borderWidth: 1.5,
                    borderStyle: "dashed",
                    borderColor: tokens.color.text,
                    borderRadius: tokens.radius.md,
                    backgroundColor: tokens.color.surface,
                  }}
                >
                  <T variant="sub" weight="bold">
                    확인 필요 · {LABEL[k]}
                  </T>
                  <T variant="sub" muted>
                    {k === "deliveryWindow" && x.deliveryWindow
                      ? `‘${x.deliveryWindow}’은 날짜로 정해 주세요.`
                      : "문구에 없어요. 편집에서 정해 주세요."}
                  </T>
                </View>
              ) : (
                <View
                  key={k}
                  style={{
                    gap: 4,
                    paddingVertical: 16,
                    borderTopWidth: 1,
                    borderTopColor: tokens.color.border,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <T variant="sub" muted>
                      {LABEL[k]}
                    </T>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Icon
                        name="check"
                        size={14}
                        color={tokens.color.textMuted}
                      />
                      <T variant="caption" muted>
                        AI가 채움
                      </T>
                    </View>
                  </View>
                  <T variant="body">{shown(k, x[k])}</T>
                </View>
              ),
            )}
            {draft.priceMentioned ? (
              <T variant="sub" muted style={{ marginTop: 16 }}>
                문구의 ‘{draft.priceMentioned}’은 넣지 않았어요. 가격은 예약
                기간별 설정에서 정해요.
              </T>
            ) : null}
            {error ? (
              <Notice title={error} tone="error" style={{ marginTop: 16 }} />
            ) : null}
          </View>
        </Scroll>
        <BottomBar>
          <Button
            label="편집으로"
            size="producer"
            loading={creating}
            onPress={() => toEdit(draft.draftId)}
          />
        </BottomBar>
      </Screen>
    );
  }

  /* ---------- 입력·처리 중·실패 ---------- */
  return (
    <Screen>
      <HeaderBar title="새 상품" onBack={back} />
      <Scroll bottom={180}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <T variant="sub" muted>
            쓰던 문구를 붙여넣으면 AI가 상품 정보를 채워요.
          </T>
        </View>
        {failed ? (
          <Notice
            title="초안을 만들지 못했어요"
            body="붙여넣은 글은 그대로 있어요. 직접 입력하거나 다시 해 보세요."
            style={{ marginHorizontal: 20, marginTop: 20 }}
          />
        ) : null}
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: failed ? 16 : 24,
            gap: 8,
          }}
        >
          <TextInput
            accessibilityLabel="카톡·밴드에 쓰던 문구"
            value={text}
            onChangeText={(v) => setText(v.slice(0, MAX))}
            editable={!busy}
            multiline
            placeholder="카톡·밴드에 쓰던 문구를 붙여넣으세요"
            placeholderTextColor={tokens.color.textMuted}
            style={{
              height: 200,
              borderRadius: tokens.radius.md,
              padding: 16,
              fontSize: tokens.fontSize.input,
              lineHeight: 26,
              fontFamily: tokens.fontFamily,
              color: busy ? tokens.color.textMuted : tokens.color.text,
              backgroundColor: busy
                ? tokens.color.surface
                : tokens.color.background,
              borderWidth: busy ? 0 : 1.5,
              borderColor: text ? tokens.color.text : tokens.color.border,
              textAlignVertical: "top",
            }}
          />
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <T variant="caption" muted>
              가격은 예약 기간별로 정해요
            </T>
            <T variant="caption" muted>
              {text.length.toLocaleString("ko-KR")} / 3,000
            </T>
          </View>
          {error ? (
            <T variant="sub" color={tokens.color.error}>
              {error}
            </T>
          ) : null}
        </View>
      </Scroll>
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: safe("bottom", 16),
          gap: 4,
          backgroundColor: tokens.color.background,
        }}
      >
        {busy ? (
          <>
            <View
              accessibilityRole="progressbar"
              aria-busy
              style={{
                height: 56,
                borderRadius: tokens.radius.md,
                backgroundColor: tokens.color.surface,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
              }}
            >
              <ActivityIndicator color={tokens.color.textMuted} />
              <T variant="body" weight="semibold" muted>
                초안 만드는 중
              </T>
            </View>
            <View style={{ minHeight: 48, justifyContent: "center" }}>
              <T variant="sub" muted center>
                20초쯤 걸려요
              </T>
            </View>
          </>
        ) : failed ? (
          <>
            <Button
              label="직접 입력하기"
              size="producer"
              loading={creating}
              onPress={() => toEdit()}
            />
            <Button
              label="다시 해 보기"
              variant="text"
              onPress={make}
              style={{ minHeight: 48 }}
            />
          </>
        ) : (
          <>
            <Button
              label="초안 만들기"
              size="producer"
              disabled={!text.trim()}
              onPress={make}
            />
            <Button
              label="직접 입력할게요"
              variant="text"
              loading={creating}
              onPress={() => toEdit()}
              style={{ minHeight: 48 }}
            />
          </>
        )}
      </View>
    </Screen>
  );
}
