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
import { useSession } from "./session";
import { groupSourceExclusions, sourceExclusionReasons } from "./sourceExclusionReasons";

export const AI_POLICY_NOTE = "가격·배송비·받는 시기는 다음 단계에서 직접 입력해요";

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
const acknowledgedExclusions = new Map<string, string>();

/** Only mounted by producer editing screens, never by the buyer page renderer. */
export function SourceExclusions({
  batchId,
  products,
  visible = true,
}: {
  batchId: string;
  visible?: boolean;
  products: { id: string; name: string; result?: SourceRefinementResult }[];
}) {
  const { user } = useSession();
  const [queue, setQueue] = useState<string[]>([]);
  const seen = useRef(new Map<string, string>());
  const entries = products.flatMap(({ id, name, result }) =>
    user && result?.refinementVersion && result.excluded.length
      ? [{ name, items: result.excluded, version: result.refinementVersion,
          storageKey: `farmclub-producer:excluded-seen:${user.userId}:${batchId}:${id}`,
          key: `farmclub-producer:excluded-seen:${user.userId}:${batchId}:${id}:${result.refinementVersion}` }]
      : [],
  );
  const entryKeys = JSON.stringify(entries.map(({ key, storageKey, version }) => ({ key, storageKey, version })));
  useEffect(() => {
    const pending: string[] = [];
    const legacySeen = new Map<string, boolean>();
    for (const { key, storageKey, version } of JSON.parse(entryKeys) as { key: string; storageKey: string; version: string }[]) {
      if (seen.current.get(storageKey) === version) continue;
      seen.current.set(storageKey, version);
      if (acknowledgedExclusions.get(storageKey) === version) continue;
      const legacyKey = `farmclub-producer:excluded-seen:${batchId}:${version}`;
      if (!legacySeen.has(legacyKey)) {
        try {
          const previous = sessionStorage.getItem(legacyKey);
          legacySeen.set(legacyKey, !!previous);
          sessionStorage.removeItem(legacyKey);
        } catch { legacySeen.set(legacyKey, false); }
      }
      let acknowledged = legacySeen.get(legacyKey) ?? false;
      try {
        acknowledged = localStorage.getItem(storageKey) === version || acknowledged;
      } catch { /* In-memory fallback still works when storage is unavailable. */ }
      if (acknowledged) {
        acknowledgedExclusions.set(storageKey, version);
        try { localStorage.setItem(storageKey, version); } catch { /* Session fallback. */ }
        continue;
      }
      pending.push(key);
    }
    if (pending.length) setQueue((old) => [...old, ...pending]);
  }, [entryKeys, batchId]);
  const opened = queue.map((key) => entries.find((entry) => entry.key === key)).find(Boolean);
  const openedKey = opened?.key;
  const dismiss = () => setQueue((old) => old.filter((key) => key !== openedKey));
  const acknowledge = () => {
    if (opened) {
      acknowledgedExclusions.set(opened.storageKey, opened.version);
      try { localStorage.setItem(opened.storageKey, opened.version); } catch { /* Session fallback. */ }
    }
    dismiss();
  };
  if (!entries.length || !visible) return null;
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
      <Modal visible={!!opened} transparent animationType="slide" onRequestClose={dismiss}>
        <View style={{ flex: 1, justifyContent: "flex-end", alignItems: "center", backgroundColor: tokens.color.overlay }}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="닫기" onPress={dismiss} />
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
              <Button label="확인" onPress={acknowledge} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
