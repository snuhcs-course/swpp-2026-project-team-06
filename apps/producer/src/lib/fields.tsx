// 생산자 편집 화면용 입력: 웹 날짜 칸, 숫자 칸(천 단위 + 단위), 기간 선택 달력 시트(D-27).
import { Button, Icon, IconButton, Sheet, T, tokens } from "@farmclub/ui";
import { useEffect, useState, type CSSProperties } from "react";
import { Pressable, TextInput, View } from "react-native";

/** 웹 기본 날짜 고르기(휴대폰에서는 OS 달력이 뜬다) */
export function DateInput({
  label,
  value,
  onChange,
  min,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  error?: boolean;
}) {
  const style: CSSProperties = {
    height: 48,
    boxSizing: "border-box",
    width: "100%",
    border: `${error ? 1.5 : 1}px solid ${error ? tokens.color.error : tokens.color.border}`,
    borderRadius: tokens.radius.sm,
    padding: "0 14px",
    fontSize: tokens.fontSize.input,
    fontFamily: tokens.fontFamily,
    color: tokens.color.text,
    background: tokens.color.background,
  };
  return (
    <View style={{ gap: 8, flex: 1 }}>
      <T variant="sub" weight="semibold">
        {label}
      </T>
      <input
        type="date"
        aria-label={label}
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        style={style}
      />
    </View>
  );
}

/** 숫자 칸: "29,000" + 단위(원·박스·개). 빈 값은 null */
export function NumField({
  label,
  value,
  onChange,
  unit,
  error,
  placeholder,
  hideLabel,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  unit: string;
  error?: boolean;
  placeholder?: string;
  hideLabel?: boolean;
}) {
  const text = value == null ? "" : value.toLocaleString("ko-KR");
  return (
    <View style={{ gap: 8, flex: 1, minWidth: 0 }}>
      {hideLabel ? null : (
        <T variant="sub" weight="semibold">
          {label}
        </T>
      )}
      <View
        style={{
          height: 48,
          borderRadius: tokens.radius.sm,
          borderWidth: error ? 1.5 : 1,
          borderColor: error ? tokens.color.error : tokens.color.border,
          backgroundColor: tokens.color.background,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
        }}
      >
        <TextInput
          accessibilityLabel={label}
          value={text}
          inputMode="numeric"
          placeholder={placeholder}
          placeholderTextColor={tokens.color.textMuted}
          onChangeText={(t) => {
            const d = t.replace(/[^\d.]/g, "");
            onChange(d === "" ? null : Number(d));
          }}
          style={
            {
              flex: 1,
              minWidth: 0,
              height: 46,
              fontSize: tokens.fontSize.input,
              fontFamily: tokens.fontFamily,
              color: tokens.color.text,
              outlineStyle: "none",
            } as never
          }
        />
        <T variant="body" muted style={{ fontSize: tokens.fontSize.input }}>
          {unit}
        </T>
      </View>
    </View>
  );
}

export type DateBlock = { label: string; start: string; end: string };

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const mdOf = (iso: string) =>
  `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;
const spanOf = (a: string, b: string) =>
  a === b
    ? mdOf(a)
    : a.slice(0, 7) === b.slice(0, 7)
      ? `${mdOf(a)}~${Number(b.slice(8, 10))}일`
      : `${mdOf(a)}~${mdOf(b)}`;

/** 고른 기간이 다른 기간(다른 단계)과 겹치면 겹친 날과 고칠 방향을 알려 준다(s-26-datesheet) */
export function overlapMessage(
  a: string,
  b: string,
  blocks: DateBlock[],
): string | null {
  for (const k of blocks) {
    if (a > k.end || b < k.start) continue;
    const from = a > k.start ? a : k.start;
    const to = b < k.end ? b : k.end;
    const fix =
      k.start <= a
        ? `${mdOf(addDays(k.end, 1))}부터 골라 주세요.`
        : `${mdOf(addDays(k.start, -1))}까지 골라 주세요.`;
    return `${k.label}(${spanOf(k.start, k.end)})와 ${spanOf(from, to)}이 겹쳐요. ${fix}`;
  }
  return null;
}

/**
 * 기간(또는 하루) 고르기 달력 시트(D-27) — design: s-25-datesheet, s-26-datesheet.
 * 시작일 → 끝날 순서로 누른다. min보다 이른 날은 고를 수 없다. blocks(다른 단계 기간)와 겹치면 오류를 보이고 저장하지 않는다.
 */
export function DateSheet({
  visible,
  title,
  range,
  start,
  end,
  min,
  blocks = [],
  note,
  onClose,
  onSave,
}: {
  visible: boolean;
  title: string;
  range: boolean;
  start: string | null;
  end?: string | null;
  /** 고를 수 있는 가장 이른 날(포함) */
  min?: string;
  blocks?: DateBlock[];
  note?: string;
  onClose: () => void;
  onSave: (start: string, end: string) => void;
}) {
  const [a, setA] = useState<string | null>(start);
  const [b, setB] = useState<string | null>(end ?? null);
  const [month, setMonth] = useState(() =>
    (start ?? min ?? ymd(2026, 10, 1)).slice(0, 7),
  );
  useEffect(() => {
    if (!visible) return;
    const s0 = start ? start.slice(0, 10) : null;
    setA(s0);
    setB(range ? (end ? end.slice(0, 10) : null) : s0);
    setMonth(
      (s0 && (!min || s0 >= min)
        ? s0
        : (min ?? s0 ?? new Date().toISOString())
      ).slice(0, 7),
    );
  }, [visible, start, end, min, range]);

  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const cells: (string | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => ymd(y, m, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  };

  function tap(d: string) {
    if (!range) {
      setA(d);
      setB(d);
    } else if (!a || b || d < a) {
      setA(d);
      setB(null);
    } else setB(d);
  }

  const done = !!a && !!b;
  const overlap = done ? overlapMessage(a!, b!, blocks) : null;
  const inBlock = (d: string) => blocks.some((k) => d >= k.start && d <= k.end);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <T variant="heading" style={{ flexShrink: 1 }}>
          {title}
        </T>
        <T variant="sub" muted>
          {range ? "시작일과 끝날을 눌러요" : "날짜를 눌러요"}
        </T>
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <IconButton icon="back" label="이전 달" onPress={() => shift(-1)} />
        <T variant="body" weight="bold" accessibilityRole="header">
          {y}년 {m}월
        </T>
        <IconButton icon="chevron" label="다음 달" onPress={() => shift(1)} />
      </View>
      <View>
        <View style={{ flexDirection: "row" }}>
          {WEEK.map((w) => (
            <T
              key={w}
              variant="sub"
              muted
              center
              style={{ width: `${100 / 7}%` }}
            >
              {w}
            </T>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {cells.map((d, i) => {
            if (!d)
              return (
                <View
                  key={`e${i}`}
                  style={{ width: `${100 / 7}%`, height: 48 }}
                />
              );
            const disabled = !!min && d < min;
            const isA = d === a;
            const isB = d === b;
            const edge = isA || isB;
            const inside = !!a && !!b && d > a && d < b;
            const clash = done && d >= a! && d <= b! && inBlock(d);
            const band = range && !!a && !!b && a !== b && (inside || edge);
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityLabel={`${mdOf(d)} ${WEEK[(lead + Number(d.slice(8, 10)) - 1) % 7]}요일${isA ? ", 시작일" : ""}${isB && range ? ", 끝날" : ""}${disabled ? ", 고를 수 없음" : ""}`}
                accessibilityState={{ disabled, selected: edge }}
                disabled={disabled}
                onPress={() => tap(d)}
                style={{
                  width: `${100 / 7}%`,
                  height: 48,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {band ? (
                  <View
                    style={{
                      position: "absolute",
                      top: 4,
                      bottom: 4,
                      left: isA ? "50%" : 0,
                      right: isB ? "50%" : 0,
                      backgroundColor: clash ? "#FDECEA" : tokens.color.surface,
                    }}
                  />
                ) : null}
                <View
                  style={[
                    {
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                    },
                    edge && {
                      backgroundColor: clash
                        ? tokens.color.error
                        : tokens.color.text,
                    },
                  ]}
                >
                  <T
                    variant="body"
                    weight={edge ? "bold" : "regular"}
                    color={
                      edge
                        ? "#FFFFFF"
                        : clash
                          ? tokens.color.error
                          : disabled
                            ? tokens.color.textMuted
                            : tokens.color.text
                    }
                    style={{
                      fontSize: tokens.fontSize.input,
                      opacity: disabled ? 0.45 : 1,
                      textDecorationLine: disabled ? "line-through" : "none",
                    }}
                  >
                    {Number(d.slice(8, 10))}
                  </T>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      {range && a ? (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "baseline",
            borderTopWidth: 1,
            borderTopColor: tokens.color.border,
            paddingTop: 12,
          }}
        >
          <T variant="body" weight="bold">
            {mdOf(a)} ~ {b ? mdOf(b) : "끝날을 눌러요"}
          </T>
          {b ? (
            <T variant="sub" muted>
              {daysBetween(a, b) + 1}일 동안
            </T>
          ) : null}
        </View>
      ) : null}
      {overlap ? (
        <View
          accessibilityRole="alert"
          style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}
        >
          <Icon name="alert" size={20} color={tokens.color.error} />
          <T variant="sub" color={tokens.color.error} style={{ flex: 1 }}>
            {overlap}
          </T>
        </View>
      ) : null}
      {note ? (
        <T variant="sub" muted>
          {note}
        </T>
      ) : null}
      <Button
        label={range ? "이 기간으로" : "이 날로"}
        size="producer"
        disabled={!done || !!overlap}
        onPress={() => done && onSave(a!, b!)}
        style={{ marginTop: 4 }}
      />
    </Sheet>
  );
}

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string) {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000,
  );
}
