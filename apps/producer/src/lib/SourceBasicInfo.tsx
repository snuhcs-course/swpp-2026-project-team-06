import {
  sourceAnalysis as api,
  type SourceBatch,
  type SourceBasicInfo as BasicInfo,
} from "@farmclub/api";
import { T, tokens } from "@farmclub/ui";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { TextInput, View } from "react-native";

type Input = { variety: string; size: string; brix: string };
const empty: BasicInfo = { variety: "", size: "", expectedBrix: null };
const values = (batch: SourceBatch) =>
  Object.fromEntries(
    batch.targets.map((t) => {
      const b = t.basicInfo ?? empty;
      return [
        t.id,
        {
          variety: b.variety,
          size: b.size,
          brix: b.expectedBrix == null ? "" : String(b.expectedBrix),
        },
      ];
    }),
  );
const encode = (input: Record<string, Input>) =>
  Object.entries(input).map(([targetId, b]) => {
    const brix = b.brix.trim();
    if (brix && (!/^\d+(\.\d+)?$/.test(brix) || Number(brix) > 100))
      throw new Error("예상 당도는 0~100 사이 숫자로 입력해 주세요.");
    return {
      targetId,
      basicInfo: {
        variety: b.variety.trim(),
        size: b.size.trim(),
        expectedBrix: brix ? Number(brix) : null,
      },
    };
  });

export function SourceBasicInfo({
  batch,
  disabled,
  flushRef,
  onDirty,
  onSaved,
}: {
  batch: SourceBatch;
  disabled: boolean;
  flushRef: MutableRefObject<
    ((required?: boolean) => Promise<void>) | undefined
  >;
  onDirty: (dirty: boolean) => void;
  onSaved: (batch: SourceBatch) => void;
}) {
  const [inputs, setInputs] = useState<Record<string, Input>>(() =>
    values(batch),
  );
  const current = useRef(inputs),
    saved = useRef(inputs),
    pending = useRef<Promise<void> | null>(null);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (
      pending.current ||
      JSON.stringify(current.current) !== JSON.stringify(saved.current)
    )
      return;
    const next = values(batch);
    current.current = saved.current = next;
    setInputs(next);
  }, [batch]);

  const save = async () => {
    while (pending.current) await pending.current;
    if (JSON.stringify(current.current) === JSON.stringify(saved.current))
      return;
    const snapshot = current.current;
    const targets = encode(snapshot);
    const task = (async () => {
      const latest = await api.get(batch.id);
      // Attachment changes may increment the batch version. Keep those changes,
      // but never silently replace another editor's basic-info changes.
      const latestValues = values(latest);
      if (
        JSON.stringify(encode(latestValues)) !==
          JSON.stringify(encode(saved.current)) &&
        JSON.stringify(encode(latestValues)) !== JSON.stringify(targets)
      )
        throw new Error(
          "다른 화면에서 기본 정보가 바뀌었어요. 입력을 복사한 뒤 새로고침해 주세요.",
        );
      await api.saveBasicInfo(batch.id, latest.version, targets);
      saved.current = snapshot;
      if (mounted.current) {
        setError("");
        onDirty(
          JSON.stringify(current.current) !== JSON.stringify(saved.current),
        );
        const refreshed = await api.get(batch.id);
        if (mounted.current) onSaved(refreshed);
      }
    })();
    pending.current = task;
    try {
      await task;
    } finally {
      pending.current = null;
    }
  };
  const persist = async (required = false) => {
    try {
      if (
        required &&
        Object.values(current.current).some((b) => !b.variety.trim())
      )
        throw new Error("과일 품종명을 입력해 주세요.");
      await save();
      // A blur save may have started before the final keystroke.
      await save();
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : "기본 정보를 저장하지 못했어요.",
        );
      throw e;
    }
  };
  useEffect(() => {
    flushRef.current = (required = false) => persist(required);
    return () => {
      flushRef.current = undefined;
    };
  });

  return (
    <View
      testID="source-basic-info"
      style={{
        gap: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: tokens.color.border,
        borderRadius: 16,
      }}
    >
      <T>기본 정보</T>
      <T variant="caption" muted>
        품종명은 꼭 입력해 주세요. 사이즈와 예상 당도는 아는 경우만 적어 주세요.
      </T>
      {batch.targets.map((target) => (
        <View key={target.id} style={{ gap: 12 }}>
          {batch.targets.length > 1 ? (
            <T variant="caption">{target.name}</T>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {(
              [
                ["variety", "과일 품종명", "예: 온주밀감", 100],
                ["size", "사이즈", "예: 중과, 지름 6~7cm", 200],
                ["brix", "예상 당도 (°Bx)", "예: 12.5", 8],
              ] as const
            ).map(([key, label, placeholder, maxLength]) => (
              <View
                key={key}
                style={{
                  gap: 5,
                  ...(key === "variety"
                    ? { width: "100%" }
                    : { flex: 1, minWidth: 100 }),
                }}
              >
                <T variant="caption" muted>
                  {label}
                  {key === "variety" ? " *" : ""}
                </T>
                <TextInput
                  accessibilityLabel={
                    batch.targets.length > 1 ? `${target.name} ${label}` : label
                  }
                  value={inputs[target.id]?.[key] ?? ""}
                  placeholder={placeholder}
                  placeholderTextColor="#B5B5B5"
                  editable={!disabled}
                  maxLength={maxLength}
                  keyboardType={key === "brix" ? "decimal-pad" : "default"}
                  onChangeText={(value) => {
                    const next = {
                      ...current.current,
                      [target.id]: {
                        ...current.current[target.id],
                        [key]: value,
                      },
                    };
                    current.current = next;
                    setInputs(next);
                    setError("");
                    onDirty(true);
                  }}
                  onBlur={() => {
                    void persist().catch(() => {});
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: tokens.color.border,
                    borderRadius: 10,
                    minHeight: 44,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 15,
                    fontFamily: tokens.fontFamily,
                    fontWeight: "400",
                    color: tokens.color.text,
                    backgroundColor: "white",
                    opacity: disabled ? 0.5 : 1,
                  }}
                />
              </View>
            ))}
          </View>
        </View>
      ))}
      {error ? (
        <View accessibilityRole="alert">
          <T variant="caption">{error}</T>
        </View>
      ) : null}
    </View>
  );
}
