import { editTrackingNumber, type Carrier } from "@farmclub/api";
import { Input } from "@farmclub/ui";
import { useRef, useState } from "react";
import { Platform, type TextInput } from "react-native";

type Selection = { start: number; end: number };

/** 공통 Input을 쓰고, 숫자 위치를 기준으로 커서를 유지하는 송장 입력. */
export function TrackingNumberInput({ carrier, value, onChange, editable, error }: {
  carrier: Carrier | null;
  value: string;
  onChange: (value: string) => void;
  editable: boolean;
  error?: string;
}) {
  const input = useRef<TextInput>(null);
  const previousSelection = useRef<Selection>({ start: 0, end: 0 });
  const [selection, setSelection] = useState<Selection | undefined>(undefined);
  return <Input
    inputRef={input}
    label="송장 번호"
    optional
    keyboardType={carrier && carrier !== "ETC" ? "number-pad" : "default"}
    editable={editable}
    value={value}
    selection={selection}
    onSelectionChange={event => { previousSelection.current = event.nativeEvent.selection; }}
    onChangeText={raw => {
      const node = input.current as unknown as HTMLInputElement | null;
      // 웹은 입력 직후 DOM 위치, 네이티브는 직전 선택과 바뀐 글자 수를 사용한다.
      const cursor = Math.max(0, Math.min(raw.length,
        previousSelection.current.start + raw.length - value.length +
        previousSelection.current.end - previousSelection.current.start));
      const nextSelection = Platform.OS === "web" && node?.selectionStart != null
        ? { start: node.selectionStart, end: node.selectionEnd ?? node.selectionStart }
        : { start: cursor, end: cursor };
      const result = editTrackingNumber(carrier, value, raw, nextSelection, previousSelection.current);
      previousSelection.current = result.selection;
      setSelection(result.selection);
      onChange(result.text);
    }}
    placeholder="예: 6012-3456-7890"
    error={error}
    hint="넣으면 소비자가 배송을 조회할 수 있어요"
    maxLength={50 + (value.match(/-/g)?.length ?? 0)}
  />;
}
