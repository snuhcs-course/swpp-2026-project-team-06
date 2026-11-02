import {
  hasHealthClaim,
  hasMoney,
  hasPlatformText,
  hasPeriodText,
  type SourceRefinementResult,
} from "@farmclub/api";
import { Button, safe, T, tokens } from "@farmclub/ui";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { groupSourceExclusions, sourceExclusionReasons } from "./sourceExclusionReasons";

export const AI_POLICY_NOTE =
  "가격·배송비·받는 시기는 AI가 채우지 않아요. 다음 단계(판매·가격)에서 직접 채워 주세요. 배송 방법(택배사·포장)은 상세에 남겨요. 건강 효능 문구는 넣을 수 없어요.";

export function StoryTextHint({ value }: { value: string }) {
  return (
    <>
      {hasMoney(value) ? (
        <T variant="caption" color={tokens.color.error}>
          금액은 다음 단계(판매·가격)에서 직접 채워 주세요
        </T>
      ) : null}
      {hasHealthClaim(value) ? (
        <T variant="caption" color={tokens.color.error}>
          건강 효능 문구는 넣을 수 없어요
        </T>
      ) : null}
      {hasPeriodText(value) ? (
        <T variant="caption" muted>
          판매 기간과 받는 시기는 다음 단계(판매·가격)에서 직접 정해 주세요.
        </T>
      ) : null}
      {hasPlatformText(value) ? (
        <T variant="caption" muted>
          팜클럽 공통 정책과 겹치는 문구인지 확인해 주세요
        </T>
      ) : null}
    </>
  );
}
/** Only mounted by producer editing screens, never by the buyer page renderer. */
export function SourceExclusions({
  batchId,
  products,
}: {
  batchId: string;
  products: { name: string; result?: SourceRefinementResult }[];
}) {
  const [queue, setQueue] = useState<string[]>([]);
  const seen = useRef(new Set<string>());
  const entries = products.flatMap(({ name, result }) =>
    result?.refinementVersion && result.excluded.length
      ? [{ name, items: result.excluded, key: `farmclub-producer:excluded-seen:${batchId}:${result.refinementVersion}` }]
      : [],
  );
  const entryKeys = JSON.stringify(entries.map(({ key }) => key));
  useEffect(() => {
    const pending: string[] = [];
    for (const key of JSON.parse(entryKeys) as string[]) {
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      try {
        if (sessionStorage.getItem(key)) continue;
      } catch {
        // Remember inside this screen if storage is unavailable.
      }
      pending.push(key);
    }
    if (pending.length) setQueue((old) => [...old, ...pending]);
  }, [entryKeys]);
  const opened = queue.map((key) => entries.find((entry) => entry.key === key)).find(Boolean);
  const openedKey = opened?.key;
  useEffect(() => {
    if (!openedKey) return;
    try {
      sessionStorage.setItem(openedKey, "1");
    } catch {
      // In-memory fallback above. Queued products are remembered only once displayed.
    }
  }, [openedKey]);
  const close = () => setQueue((old) => old.filter((key) => key !== openedKey));
  if (!entries.length) return null;
  const groups = groupSourceExclusions(opened?.items ?? []);
  const multipleProducts = products.length > 1;
  const productPrefix = (name: string) => multipleProducts ? `${name} · ` : "";
  const accentBackground = `${tokens.color.accent}14`;
  return (
    <>
      {entries.map(({ name, items, key }) => <Pressable
        key={key}
        testID="excluded-chip"
        accessibilityRole="button"
        accessibilityLabel={`${productPrefix(name)}AI가 뺀 문구 ${items.length}개`}
        onPress={() => setQueue((old) => [key, ...old.filter((k) => k !== key)])}
        style={{
          margin: tokens.space.gutter,
          alignSelf: "flex-start",
          borderRadius: tokens.radius.full,
          paddingHorizontal: tokens.space.md,
          paddingVertical: tokens.space.sm,
          minHeight: tokens.touchTarget.min,
          justifyContent: "center",
          backgroundColor: accentBackground,
        }}
      >
        <T variant="sub" weight="semibold" color={tokens.color.accentPressed}>
          {productPrefix(name)}AI가 뺀 문구 {items.length}개
        </T>
      </Pressable>)}
      <Modal visible={!!opened} transparent animationType="slide" onRequestClose={close}>
        <View style={{ flex: 1, justifyContent: "flex-end", alignItems: "center", backgroundColor: tokens.color.overlay }}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="닫기" onPress={close} />
          <View
            testID="excluded-modal"
            accessibilityViewIsModal
            style={{
              width: "100%",
              maxWidth: tokens.maxWidth,
              maxHeight: "90%",
              backgroundColor: tokens.color.background,
              borderTopLeftRadius: tokens.radius.md,
              borderTopRightRadius: tokens.radius.md,
              paddingHorizontal: tokens.space.gutter,
              paddingTop: tokens.space.lg,
              paddingBottom: safe("bottom", tokens.space.lg),
              gap: tokens.space.md,
            }}
          >
            <View style={{ gap: tokens.space.sm, flexShrink: 0 }}>
              <T variant="heading" accessibilityRole="header">
                {productPrefix(opened?.name ?? "")}이 정보들은 상세 페이지에 못 넣어서 빼 뒀어요 🙂
              </T>
              <T variant="caption" muted>
                AI가 자료에서 찾았지만 팜클럽 상세에는 맞지 않는 내용이에요.
              </T>
            </View>
            <ScrollView
              key={openedKey}
              testID="excluded-body"
              style={{ maxHeight: 400, flexShrink: 1 }}
              contentContainerStyle={{ gap: tokens.space.lg, paddingBottom: tokens.space.sm }}
            >
              {[...groups].map(([reason, entries]) => {
                // 표에 없는 사유가 와도 화면이 깨지지 않게 근거 없음 안내로 대신한다.
                const { label, explanation, detail, accent } =
                  sourceExclusionReasons[reason] ?? sourceExclusionReasons.unsupported;
                return (
                  <View key={reason} style={{ gap: tokens.space.sm }}>
                    <View style={{
                      alignSelf: "flex-start",
                      borderRadius: tokens.radius.full,
                      paddingHorizontal: tokens.space.sm,
                      paddingVertical: tokens.space.xs,
                      backgroundColor: accent ? accentBackground : tokens.color.surface,
                    }}>
                      <T variant="caption" weight="semibold" color={accent ? tokens.color.accentPressed : tokens.color.textMuted}>
                        {label}
                      </T>
                    </View>
                    <T variant="sub" weight="regular">{explanation}</T>
                    {detail ? <T variant="caption" muted>{detail}</T> : null}
                    {entries.map((item) => (
                      <View
                        key={`${item.candidateId}:${item.reason}`}
                        testID={`excluded-item-${item.reason}`}
                        style={{
                          marginLeft: tokens.space.xs,
                          borderLeftWidth: 2,
                          borderLeftColor: `${tokens.color.accent}66`,
                          paddingLeft: tokens.space.sm,
                        }}
                      >
                        <T
                          variant="sub"
                          muted
                          numberOfLines={2}
                          masked={item.reason === "pii"}
                          style={{ fontStyle: "italic" }}
                        >
                          {item.value}
                        </T>
                      </View>
                    ))}
                  </View>
                );
              })}
            </ScrollView>
            <View style={{ gap: tokens.space.sm, flexShrink: 0 }}>
              <T variant="caption" muted>
                맨 위 &apos;AI가 뺀 문구&apos;에서 다시 볼 수 있어요
              </T>
              <Button label="확인" onPress={close} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
