import { useState } from "react";
import { View, TextInput } from "react-native";
import { Button, T } from "@farmclub/ui";
import type { PageReviewAction, PageReviewItem } from "@farmclub/api";
export function PageReviewActions({ item, value, busy, onAction, onEdit }: {
    item: PageReviewItem;
    value: string;
    busy: boolean;
    onAction: (action: PageReviewAction, note: string, suggestion?: string) => void;
    onEdit: () => void;
}) {
    const [note, setNote] = useState("");
    const [original, setOriginal] = useState(false);
    const changed = value !== item.originalValue;
    return <View style={{ gap: 10 }}>
    <Button label={original ? "원문 접기" : "원문과 비교"} variant="text" disabled={busy} onPress={() => setOriginal(!original)}/>
    {original ? <View style={{ padding: 12, backgroundColor: "#FFFCF6", gap: 6 }}>
      {item.pages.length ? <T variant="caption">자료 {item.pages.join(", ")}쪽</T> : null}
      <T>{item.originalValue}</T>
    </View> : null}
    {!item.pending ? <><T>검토를 저장했어요.</T><Button label="검토 되돌리기" variant="outline" disabled={busy} onPress={() => onAction("REOPEN", "")}/></> : <>
      {item.requiresNote ? <><T variant="caption">자료의 금액과 실제 판매 설정을 확인한 내용을 적어 주세요.</T><TextInput accessibilityLabel="금액 확인 메모" value={note} onChangeText={setNote} editable={!busy} multiline style={{ borderWidth: 1, borderColor: "#D9C8AF", padding: 12, minHeight: 70 }}/></> : null}
      <View style={{ gap: 8 }}>
        {(item.canKeep || changed) ? <Button label={changed ? "수정 내용으로 확인" : "확인했어요"} disabled={busy || (item.requiresNote && !note.trim())} onPress={() => onAction(changed ? "EDIT" : "KEEP", note)}/> : <T variant="caption">이 문구는 수정하거나 본문에서 제외해 주세요.</T>}
        {item.suggestedValue ? <Button label="제안된 수정 사용" variant="outline" disabled={busy} onPress={() => onAction("EDIT", note, item.suggestedValue!)}/> : null}
        <Button label="직접 수정" variant="outline" disabled={busy} onPress={onEdit}/>
        <Button label="본문에서 제외" variant="text" disabled={busy} onPress={() => onAction("OMIT", note)}/>
      </View>
    </>}
  </View>;
}
