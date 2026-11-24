import { sourceAnalysis, type SourceCopyAction, type SourceCopyDecision, type SourceCopyPassage, type SourceCopyReview } from "@farmclub/api";
import { Button, Input, SOURCE_MODULES, T, tokens } from "@farmclub/ui";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

const groups = [
  ["COPY_EDIT", "문장 점검", "원문을 유지해요. 공백 제안과 끊긴 문장을 확인해 주세요. 맞춤법·문법 전체 검사는 하지 않아요."],
  ["OWNER_CONFIRMATION", "현재 정보 확인", "날짜·판매 조건이 지금도 맞는지 확인해 주세요. 확인 전 문구는 구매자 본문에 넣지 않아요."],
  ["PLACEMENT", "배치 확인", "이 문구를 넣을 항목을 선택하거나 제외해 주세요."],
  ["SAFETY", "사용 제한 확인", "개인정보·건강 효능·외부 거래 안내 등은 확인만으로 사용할 수 없어요."],
] as const;

const decisionSnapshot = (decision: SourceCopyPassage["decision"]) => JSON.stringify(decision ? [
  decision.action, decision.value ?? null, decision.note ?? null, decision.module ?? null,
] : null);
const actionLabels: Record<SourceCopyAction, string> = {
  KEEP: "원문 그대로 사용", EDIT: "직접 수정", OMIT: "본문에서 제외",
  TRANSFER_TO_SETTINGS: "판매 설정에서 입력", ACCEPT_REPAIR: "최소 수정 사용",
};

export function SourceCopyReview({ batchId, targetId, enabled, reviewVersion, locked, beforeMutation, onReload, onBusy }: {
  batchId: string; targetId: string; enabled: boolean; reviewVersion: number; locked: boolean;
  beforeMutation: () => Promise<boolean>;
  onReload: () => Promise<void>;
  onBusy: (value: boolean) => void;
}) {
  const [data, setData] = useState<SourceCopyReview | null>(null);
  const [choices, setChoices] = useState<Record<string, SourceCopyDecision>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [notice, setNotice] = useState(""), [advanced, setAdvanced] = useState(false);
  const operation = useRef(false), alive = useRef(true);
  // Keep the persisted decision seen at FIRST selection, even when polling refreshes data.
  const decisionBases = useRef(new Map<string, string>());
  const cancelChoice = (binding: string) => {
    decisionBases.current.delete(binding);
    setChoices((old) => Object.fromEntries(Object.entries(old).filter(([key]) => key !== binding)));
  };
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // Refresh server queues without replacing any unsaved choices or text inputs.
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    sourceAnalysis.sourceCopy(batchId, targetId).then((next) => {
      if (active && !operation.current) { setData(next); setError(""); }
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "검토 내용을 불러오지 못했어요."); });
    return () => { active = false; };
  }, [batchId, targetId, enabled, reviewVersion]);
  const disabled = locked || busy;
  const choose = (p: SourceCopyPassage, action: SourceCopyAction) => {
    setNotice("");
    if (!decisionBases.current.has(p.bindingHash))
      decisionBases.current.set(p.bindingHash, decisionSnapshot(p.decision));
    setChoices((old) => ({ ...old, [p.bindingHash]: { ...old[p.bindingHash], bindingHash: p.bindingHash, action,
      ...(action === "EDIT" ? { value: old[p.bindingHash]?.value ?? p.value } : {}),
      ...(p.module ? { module: p.module } : {}),
    } }));
  };
  const mutate = async (enable = false) => {
    if (disabled || operation.current) return;
    operation.current = true;
    setBusy(true); setError(""); setNotice("");
    let parentBusy = false;
    let saved: SourceCopyReview | null = null;
    try {
      if (!enable) {
        for (const choice of Object.values(choices)) {
          const passage = data?.plan.passages.find((p) => p.bindingHash === choice.bindingHash);
          if (choice.action === "EDIT" && !choice.value?.trim()) throw new Error("사용할 문구를 입력해 주세요.");
          if ((choice.action === "EDIT" || (choice.action === "KEEP" && passage?.reasonCodes.OWNER_CONFIRMATION.length)) && !choice.note?.trim())
            throw new Error("수정한 이유나 현재 정보가 맞는지 확인한 내용을 입력해 주세요.");
          if (!["OMIT", "TRANSFER_TO_SETTINGS"].includes(choice.action) && passage?.module === null && !choice.module)
            throw new Error("문구를 넣을 항목을 선택해 주세요.");
        }
      }
      // Flush manually edited fields first; a failed save must stop the review mutation.
      if (!(await beforeMutation())) throw new Error("판매페이지 수정을 저장하지 못했어요. 저장 오류를 확인한 뒤 다시 시도해 주세요.");
      onBusy(true); parentBusy = true;
      const latest = await sourceAnalysis.sourceCopy(batchId, targetId);
      if (enable) await sourceAnalysis.enableSourceCopy(batchId, latest.reviewVersion);
      else {
        const decisions = Object.values(choices);
        if (decisions.some((c) => !latest.plan.passages.some((p) => p.bindingHash === c.bindingHash)))
          throw new Error("원본 자료가 바뀌었어요. 입력은 남아 있어요. 최신 문구를 확인하고 다시 선택해 주세요.");
        if (decisions.some((c) => decisionBases.current.get(c.bindingHash) !==
          decisionSnapshot(latest.plan.passages.find((p) => p.bindingHash === c.bindingHash)!.decision))) {
          if (alive.current) setData(latest);
          throw new Error("다른 화면에서 검토 선택이 바뀌었어요. 입력은 남아 있어요. 현재 저장된 선택을 확인하고 ‘저장 전 선택 취소’를 누른 뒤 다시 선택해 주세요.");
        }
        const next = await sourceAnalysis.saveSourceCopy(batchId, targetId, {
          reviewVersion: latest.reviewVersion, planHash: latest.plan.planHash, decisions,
        });
        saved = next;
      }
      await onReload();
      if (alive.current && saved) { setData(saved); setChoices({}); decisionBases.current.clear(); }
      if (alive.current) setNotice("비공개 검토 내용을 저장했어요. 상품에 반영하려면 기존 반영 절차를 진행해 주세요.");
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "저장하지 못했어요. 입력 내용은 남아 있어요.");
    } finally {
      operation.current = false;
      if (parentBusy) onBusy(false);
      if (alive.current) setBusy(false);
    }
  };
  const retry = async () => {
    if (disabled) return;
    setBusy(true);
    try { setData(await sourceAnalysis.sourceCopy(batchId, targetId)); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "불러오지 못했어요."); }
    finally { setBusy(false); }
  };
  const pending = data?.plan.passages.filter((p) => p.queueKinds.length > 0 || choices[p.bindingHash]) ?? [];
  return <View style={{ gap: 12, padding: tokens.space.gutter }} testID="source-copy-review">
    <T weight="semibold">원문을 살려 상세 채우기</T>
    {!enabled ? <>
      <T variant="sub" muted>원문의 문장을 사용하고, 문장 점검과 현재 정보 확인을 따로 진행해요. 직접 수정한 내용은 보존해요.</T>
      <Button label="원문 유지 방식 사용" disabled={disabled} loading={busy} onPress={() => void mutate(true)} />
    </> : <>
      <T variant="sub" muted>확인 대기 문구는 본문에서 보류해요. 아래 선택은 ‘검토 선택 저장’을 눌러야 저장돼요.</T>
      {data ? groups.filter(([kind]) => advanced || kind === "COPY_EDIT" || kind === "OWNER_CONFIRMATION").map(([kind, title, hint]) => {
        const passages = pending.filter((p) => p.queueKinds.includes(kind) || (choices[p.bindingHash] && p.reasonCodes[kind].length > 0));
        return <View key={kind} style={{ gap: 8 }}>
          <T weight="semibold">{title} · {passages.length}건</T>
          <T variant="caption" muted>{hint}</T>
          {passages.map((p, index) => {
            const choice = choices[p.bindingHash];
            const action = choice?.action;
            const price = p.reasonCodes.OWNER_CONFIRMATION.includes("PRICE_OR_FEE") || p.reasonCodes.SAFETY.includes("MONEY_AMOUNT");
            const date = p.reasonCodes.OWNER_CONFIRMATION.includes("RELATIVE_TIME");
            const blocked = p.status === "BLOCKED" || p.queueKinds.includes("SAFETY");
            const label = (text: string, value: SourceCopyAction) => `${action === value ? "선택됨 · " : ""}${text}`;
            return <View key={p.bindingHash} testID={`source-copy-passage-${p.id}-${kind}`} style={{ gap: 8, padding: 12, borderWidth: 1, borderColor: tokens.color.border, borderRadius: tokens.radius.sm }}>
              <T variant="caption" muted>{index + 1}. {p.status === "READY" ? "확인 완료" : p.status === "EXCLUDED" ? "본문에서 제외" : "본문에서 보류"}</T>
              <T variant="caption" muted>원문</T><T>{p.originalValue}</T>
              {kind === "COPY_EDIT" && p.reasonCodes.COPY_EDIT.includes("POSSIBLE_FRAGMENT") ? <T variant="sub">문장 끝이 끊겼을 수 있어요. 원문을 확인해 주세요.</T> : null}
              {kind === "COPY_EDIT" && p.reasonCodes.COPY_EDIT.includes("EXACT_REPETITION") ? <T variant="sub">같은 문장이 반복돼요. 필요한 문구를 직접 정리해 주세요.</T> : null}
              {kind === "COPY_EDIT" && p.reasonCodes.COPY_EDIT.includes("POSSIBLE_SPACING") ? <T variant="sub">띄어쓰기를 확인해 주세요. 자동으로 고치지 않았어요.</T> : null}
              {choice && decisionBases.current.get(p.bindingHash) !== decisionSnapshot(p.decision) ? <T color={tokens.color.error}>다른 화면에서 저장된 선택이 바뀌었어요. 현재 선택을 확인한 뒤 저장 전 선택을 취소하고 다시 선택해 주세요.</T> : null}
              {p.decision ? <T variant="sub">현재 저장된 선택: {actionLabels[p.decision.action]}</T> : <T variant="caption" muted>현재 저장된 선택: 없음</T>}
              {p.decision?.action === "EDIT" ? <><T variant="caption" muted>저장된 수정 문구</T><T>{p.value}</T></> : null}
              {p.decision?.note ? <T variant="caption" muted>저장된 확인 내용: {p.decision.note}</T> : null}
              {p.repairValue && p.repairValue !== p.originalValue ? <><T variant="caption" muted>최소 수정 제안</T><T>{p.repairValue}</T></> : null}
              {price ? <T variant="sub">가격·배송비는 판매 설정에서 직접 입력해 주세요. 본문에는 넣지 않아요.</T> : null}
              {date ? <T variant="sub">현재 기준으로 정확한 연·월·일이나 조건을 직접 입력하거나 제외해 주세요.</T> : null}
              {!price ? <>
                {!blocked && !date && p.module !== null && kind !== "PLACEMENT" ? <Button compact variant="outline" label={label("원문 그대로 사용", "KEEP")} disabled={disabled} onPress={() => choose(p, "KEEP")} /> : null}
                {!blocked && p.module !== null && p.repairValue && !p.reasonCodes.OWNER_CONFIRMATION.length && !p.reasonCodes.SAFETY.length ? <Button compact variant="outline" label={label("최소 수정 사용", "ACCEPT_REPAIR")} disabled={disabled} onPress={() => choose(p, "ACCEPT_REPAIR")} /> : null}
                <Button compact variant="outline" label={label("직접 수정", "EDIT")} disabled={disabled} onPress={() => choose(p, "EDIT")} />
              </> : null}
              {action === "EDIT" ? <>
                <Input label="사용할 문구" multiline value={choice.value ?? ""} editable={!disabled} onChangeText={(value) => setChoices((old) => ({ ...old, [p.bindingHash]: { ...choice, value } }))} />
                {(kind === "PLACEMENT" || p.module === null) ? <View style={{ gap: 4 }}><T variant="sub">넣을 항목</T>{SOURCE_MODULES.filter(([id]) => !["sizePhoto", "crossSectionPhoto", "packagePhoto", "farmPhotos"].includes(id)).map(([id, title]) => <Button key={id} compact variant="outline" disabled={disabled} label={`${choice.module === id ? "선택됨 · " : ""}${title}`} onPress={() => setChoices((old) => ({ ...old, [p.bindingHash]: { ...choice, module: id } }))} />)}</View> : null}
              </> : null}
              {choice && (action === "EDIT" || (action === "KEEP" && p.reasonCodes.OWNER_CONFIRMATION.length > 0)) ? <Input
                label={action === "EDIT" ? "수정한 이유와 확인한 내용" : "현재도 맞는지 확인한 내용"}
                hint="확인한 날짜나 판매 조건을 구체적으로 적어 주세요."
                value={choice.note ?? ""} editable={!disabled}
                onChangeText={(note) => setChoices((old) => ({ ...old, [p.bindingHash]: { ...choice, note } }))}
              /> : null}
              {price ? <Button compact variant="outline" label={label("판매 설정에서 입력하기로 기록", "TRANSFER_TO_SETTINGS")} disabled={disabled} onPress={() => choose(p, "TRANSFER_TO_SETTINGS")} /> : null}
              <Button compact variant="outline" label={label("본문에서 제외", "OMIT")} disabled={disabled} onPress={() => choose(p, "OMIT")} />
              {choice ? <Button compact variant="text" label="저장 전 선택 취소" disabled={disabled} onPress={() => cancelChoice(p.bindingHash)} /> : null}
            </View>;
          })}
        </View>;
      }) : <T variant="sub" muted>검토 내용을 불러오는 중이에요.</T>}
      <Button compact variant="text" label={advanced ? "배치·사용 제한 접기" : "배치·사용 제한 확인"} disabled={disabled} onPress={() => setAdvanced((v) => !v)} />
      {Object.keys(choices).some((key) => data && !data.plan.passages.some((p) => p.bindingHash === key)) ? <>
        <T variant="sub">자료가 바뀌어 연결되지 않은 선택이 있어요. 입력을 확인한 뒤 이전 선택을 지워 주세요.</T>
        {Object.entries(choices).filter(([key]) => !data?.plan.passages.some((p) => p.bindingHash === key)).map(([key, choice]) => <View key={key} style={{ gap: 4 }}><T>{choice.value || "이전 원문에 대한 선택"}</T><Button compact variant="outline" label="이전 선택 지우기" disabled={disabled} onPress={() => cancelChoice(key)} /></View>)}
      </> : null}
      <Button label="검토 선택 저장" disabled={disabled || !Object.keys(choices).length} loading={busy} onPress={() => void mutate()} />
    </>}
    {error ? <View accessibilityRole="alert" style={{ gap: 8 }}><T color={tokens.color.error}>{error}</T><T variant="caption" muted>입력한 선택과 문구는 그대로 남아 있어요.</T><Button compact variant="outline" label="검토 내용 다시 불러오기" disabled={disabled} onPress={() => void retry()} /></View> : null}
    {notice ? <T variant="sub">{notice}</T> : null}
  </View>;
}
