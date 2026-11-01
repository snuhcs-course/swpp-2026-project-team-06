import {
  hasHealthClaim,
  hasMoney,
  hasPlatformText,
  type SourceExclusion,
  type SourceRefinementResult,
} from "@farmclub/api";
import { Button, Sheet, T, tokens } from "@farmclub/ui";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

export const AI_POLICY_NOTE =
  "가격·배송비·받는 시기는 AI가 채우지 않아요. 다음 단계(판매·가격)에서 직접 채워 주세요. 건강 효능 문구는 넣을 수 없어요.";

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
      {hasPlatformText(value) ? (
        <T variant="caption" muted>
          팜클럽 공통 정책과 겹치는 문구인지 확인해 주세요
        </T>
      ) : null}
    </>
  );
}
const nextStep = "다음 단계(판매·가격)에서 직접 채워 주세요";
const commonPolicy = "팜클럽 공통 정책으로 안내돼서 상세에 넣지 않았어요";
const explanation = (item: SourceExclusion) => {
  if (item.reason === "health") return "건강 효능 문구는 넣을 수 없어요";
  if (item.reason === "platform" || item.reason === "price") {
    // A return fee belongs to the policy explanation even though it contains an amount.
    if (/반품|교환|환불|보상|고객센터|운영\s*시간|구매처|주문|결제|입금/.test(item.value))
      return commonPolicy;
    return nextStep;
  }
  return {
    pii: "개인정보가 있어 상세에 넣지 않았어요",
    other_product: "다른 상품의 내용이라 넣지 않았어요",
    unsupported: "자료에서 근거를 확인하지 못해 넣지 않았어요",
    duplicate: "같은 내용이 있어 한 번만 넣었어요",
    unused: "이번 상세에 사용하지 않은 문구예요",
  }[item.reason];
};
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
  const groups = new Map<string, SourceExclusion[]>();
  for (const item of opened?.items ?? []) {
    const label = explanation(item);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return (
    <>
      {entries.map(({ name, items, key }) => <Pressable
        key={key}
        testID="excluded-chip"
        accessibilityRole="button"
        accessibilityLabel={`${name} · AI가 뺀 문구 ${items.length}개`}
        onPress={() => setQueue((old) => [key, ...old.filter((k) => k !== key)])}
        style={{
          margin: 20,
          alignSelf: "flex-start",
          borderRadius: 999,
          padding: 12,
          minHeight: 48,
          backgroundColor: tokens.color.surface,
        }}
      >
        <T variant="sub">{name} · AI가 뺀 문구 {items.length}개</T>
      </Pressable>)}
      <Sheet visible={!!opened} onClose={close}>
        <View testID="excluded-modal" style={{ gap: 16 }}>
          <T variant="title">{opened?.name} · AI가 이런 문구는 뺐어요</T>
          <ScrollView
            style={{ maxHeight: 400 }}
            contentContainerStyle={{ gap: 16 }}
          >
            {[...groups].map(([label, entries]) => (
              <View key={label} style={{ gap: 8 }}>
                <T weight="semibold">{label}</T>
                {entries.map((item) => (
                  <View
                    key={`${item.candidateId}:${item.reason}`}
                    testID={`excluded-item-${item.reason}`}
                  >
                    <T>{item.value}</T>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
          <T variant="caption" muted>
            맨 위 &apos;AI가 뺀 문구&apos;에서 다시 볼 수 있어요
          </T>
          <Button label="확인" onPress={close} />
        </View>
      </Sheet>
    </>
  );
}
