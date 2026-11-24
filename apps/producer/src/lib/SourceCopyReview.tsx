import { sourceAnalysis, type SourceCopyAction, type SourceCopyDecision, type SourceCopyPassage, type SourceCopyReview } from "@farmclub/api";
import { Button, Input, SOURCE_MODULES, T, tokens } from "@farmclub/ui";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

const groups = [
  ["COPY_EDIT", "문장 점검", "원문을 유지해요. 공백 제안과 끊긴 문장을 확인해 주세요. 맞춤법·문법 전체 검사는 하지 않아요."],
  ["OWNER_CONFIRMATION", "현재 정보 확인", "날짜·판매 조건이 지금도 맞는지 확인해 주세요. 원문은 비공개 초안에 남고, 확인을 마쳐야 공개할 수 있어요."],
  ["PLACEMENT", "배치 확인", "내용을 확인하고 알맞은 항목으로 옮기거나 제외해 주세요. 담을 수 없는 원문도 아래에 전부 보여요."],
  ["SAFETY", "사용 제한 확인", "비공개 초안의 문구를 공개하기 전에 확인해 주세요. 개인정보·질병 효능·다른 상품의 문구는 안전하게 수정하거나 제외해야 해요."],
] as const;

const requiresNote = (p: SourceCopyPassage) => p.reasonCodes.OWNER_CONFIRMATION.length > 0 || p.reasonCodes.SAFETY.some((reason) => !["PRIVATE_VALUE", "HEALTH_CLAIM", "OTHER_PRODUCT"].includes(reason));
const reasonMessages: Record<string, string> = {
  OCR_SPLIT: "자료를 읽는 과정에서 단어가 줄 사이에 끊겼을 수 있어요. 원문과 최소 수정 제안을 비교해 주세요.",
  CONTINUATION_CONTEXT: "인접한 원문을 연결했어요. 서로 다른 항목에서 가져온 문구이므로 연결된 문맥이 자연스러운지 확인해 주세요.",
  POSSIBLE_FRAGMENT: "문장 끝이 끊겼을 수 있어요. 빠진 내용이 있는지 원문을 확인해 주세요.",
  EXACT_REPETITION: "같은 문장이 반복돼요. 그대로 둘지 직접 정리할지 선택해 주세요.",
  POSSIBLE_SPACING: "띄어쓰기가 어색할 수 있어요. 원문을 확인해 주세요.",
  PRICE_OR_FEE: "자료의 가격·배송비가 지금도 맞는지, 실제 판매 설정의 금액과 일치하는지 확인해 주세요.",
  RELATIVE_TIME: "‘올해·이번 주’ 같은 표현은 자료를 만든 때에 따라 뜻이 달라져요. 현재도 맞는지 확인하거나 정확한 날짜로 고쳐 주세요.",
  DATED_OR_HISTORICAL: "과거 연도나 이력이 포함돼 있어요. 현재 상품 설명으로 맞는지, 과거 이야기임이 분명한지 확인해 주세요.",
  SEASON_OR_AVAILABILITY: "수확 시기·제철·재고는 달라질 수 있어요. 지금 판매하는 상품에도 맞는지 확인해 주세요.",
  DISPATCH_OR_DELIVERY: "출고일과 배송 조건이 바뀌었을 수 있어요. 현재 가능한 일정인지 확인해 주세요.",
  PAYMENT_OR_RETURN_TERMS: "결제·입금·교환·반품 안내가 현재 판매 조건과 맞는지 확인해 주세요.",
  TIMING_OR_SALES_TERMS: "시점이나 판매 조건이 포함돼 있어요. 현재도 유효한지 확인해 주세요.",
  COMMON_SCOPE_UNCONFIRMED: "공통 자료의 설명이 이 상품에도 해당하는지 확인하고 알맞은 항목에 직접 배치해 주세요.",
  AMBIGUOUS_MODULE_ROUTING: "어느 항목에 넣을지 분명하지 않아요. 원문 전체를 보고 사용할 위치를 선택해 주세요.",
  FIELD_LIMIT: "한 항목에 담을 수 있는 길이를 넘었어요. 원문 전체는 아래에 남아 있어요. 내용을 나누거나 정리해 주세요.",
  PRIVATE_VALUE: "개인정보가 포함됐을 수 있어요. 공개해도 되는 표현으로 수정하거나 제외해 주세요.",
  MONEY_AMOUNT: "본문의 금액과 실제 판매 설정이 다르면 구매자가 혼동할 수 있어요. 현재 금액과 조건이 일치하는지 확인해 주세요.",
  HEALTH_CLAIM: "질병 예방·치료나 건강 효능으로 읽힐 수 있어요. 공개 전에 효능 주장을 빼고 사실에 맞게 수정하거나 제외해 주세요.",
  EXAGGERATION: "과장되거나 단정적인 홍보 표현일 수 있어요. 근거에 맞는 표현인지 확인한 내용을 적거나 문구를 수정해 주세요.",
  POLICY_TEXT: "예전 거래·환불 정책이나 서비스 설명일 수 있어요. 현재 적용되는 내용인지 확인하고 맞지 않으면 수정하거나 제외해 주세요.",
  PLATFORM_TEXT: "다른 판매처나 외부 거래 안내가 포함됐을 수 있어요. 지금 이 페이지에도 필요한 안내인지 확인하고 수정하거나 제외해 주세요.",
  OTHER_PRODUCT: "다른 상품 설명이 섞였을 수 있어요. 현재 상품에 맞게 수정하거나 제외해 주세요.",
};

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
  const [notice, setNotice] = useState("");
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
    const currentModule = p.optionAssembly?.module ?? p.autoRepair?.module ?? p.module;
    setChoices((old) => ({ ...old, [p.bindingHash]: { ...old[p.bindingHash], bindingHash: p.bindingHash, action,
      ...(action === "EDIT" ? { value: old[p.bindingHash]?.value ?? p.value } : {}),
      ...(currentModule ? { module: currentModule } : {}),
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
          if ((choice.action === "EDIT" || (choice.action === "KEEP" && passage && requiresNote(passage))) && !choice.note?.trim())
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
  const optionBlocks = new Set(data?.plan.passages.filter((p) => p.optionAssembly).map((p) => p.optionAssembly!.passageIds.join("/"))).size;
  const automaticJoins = new Set(data?.plan.passages.filter((p) => p.autoRepair?.type === "SOURCE_ADJACENT_CONTINUATION").map((p) => p.autoRepair!.passageIds.join("/"))).size;
  const pending = data?.plan.passages.filter((p) => p.queueKinds.length > 0 || choices[p.bindingHash]) ?? [];
  const pendingCount = data?.plan.passages.filter((p) => p.reviewPending).length ?? 0;
  return <View style={{ gap: 12, padding: tokens.space.gutter }} testID="source-copy-review">
    <T weight="semibold">원문을 살려 상세 채우기</T>
    {!enabled ? <>
      <T variant="sub" muted>원문의 문장을 사용하고, 문장 점검과 현재 정보 확인을 따로 진행해요. 직접 수정한 내용은 보존해요.</T>
      <Button label="원문 유지 방식 사용" disabled={disabled} loading={busy} onPress={() => void mutate(true)} />
    </> : <>
      <T variant="sub" muted>자료의 문구를 비공개 초안에 담았어요. 아래에서 공개 전에 확인할 이유를 보고 원문 유지·수정·제외를 선택해 주세요. 선택은 ‘검토 선택 저장’을 눌러야 저장돼요.</T>
      {optionBlocks ? <T variant="sub" muted>옵션 {optionBlocks}개의 크기·수량·포장을 한곳에 묶었어요. 원문의 옵션별 관계는 그대로 유지해요.</T> : null}
      {automaticJoins ? <T variant="sub" muted>인접한 원문 {automaticJoins}곳을 자동으로 연결했어요. 단어·수치·조건은 그대로 유지해요. 문맥 확인이 필요한 연결은 아래에 표시해요.</T> : null}
      {data ? <View accessibilityRole="alert" style={{ gap: 4 }} testID="source-copy-publication-warning">
        <T weight="semibold">공개 전 확인 대기 · {pendingCount}건</T>
        <T variant="sub">{pendingCount ? "확인 대기 항목을 모두 처리해야 상품에 반영할 수 있어요. 비공개 저장과 미리보기는 계속할 수 있어요." : "자료 문구의 확인을 마쳤어요. 상품에 반영하기 전에 판매페이지 전체를 확인해 주세요."}</T>
      </View> : null}
      {data ? groups.map(([kind, title, hint]) => {
        const passages = pending.filter((p) => p.queueKinds.includes(kind) || (choices[p.bindingHash] && p.reasonCodes[kind].length > 0));
        return <View key={kind} style={{ gap: 8 }}>
          <T weight="semibold">{title} · {passages.length}건</T>
          <T variant="caption" muted>{hint}</T>
          {passages.map((p, index) => {
            const choice = choices[p.bindingHash];
            const action = choice?.action;
            const price = p.reasonCodes.OWNER_CONFIRMATION.includes("PRICE_OR_FEE") || p.reasonCodes.SAFETY.includes("MONEY_AMOUNT");
            const blocked = p.reasonCodes.SAFETY.some((reason) => ["PRIVATE_VALUE", "HEALTH_CLAIM", "OTHER_PRODUCT"].includes(reason));
            const label = (text: string, value: SourceCopyAction) => `${action === value ? "선택됨 · " : ""}${text}`;
            return <View key={p.bindingHash} testID={`source-copy-passage-${p.id}-${kind}`} style={{ gap: 8, padding: 12, borderWidth: 1, borderColor: tokens.color.border, borderRadius: tokens.radius.sm }}>
              <T variant="caption" muted>{index + 1}. {p.includedInDraft ? "비공개 초안에 포함" : p.status === "EXCLUDED" ? "초안에서 제외" : "아래 원문 확인 · 배치 필요"} · {p.reviewPending ? "공개 전 확인 필요" : "검토 완료"}</T>
              <T variant="caption" muted>원문</T><T>{p.originalValue}</T>
              {[...new Set([...(p.reviewExplanations ?? []), ...Object.values(p.reasonCodes).flat().map((reason) => reasonMessages[reason] ?? "현재 자료의 표현과 사용 위치를 확인해 주세요.")])].map((message) => <T key={message} variant="sub">{message}</T>)}
              {choice && decisionBases.current.get(p.bindingHash) !== decisionSnapshot(p.decision) ? <T color={tokens.color.error}>다른 화면에서 저장된 선택이 바뀌었어요. 현재 선택을 확인한 뒤 저장 전 선택을 취소하고 다시 선택해 주세요.</T> : null}
              {p.decision ? <T variant="sub">현재 저장된 선택: {actionLabels[p.decision.action]}</T> : <T variant="caption" muted>현재 저장된 선택: 없음</T>}
              {p.decision?.action === "EDIT" ? <><T variant="caption" muted>저장된 수정 문구</T><T>{p.value}</T></> : null}
              {p.decision?.note ? <T variant="caption" muted>저장된 확인 내용: {p.decision.note}</T> : null}
              {p.repairValue && p.repairValue !== p.originalValue ? <><T variant="caption" muted>최소 수정 제안</T><T>{p.repairValue}</T></> : null}
              {price ? <T variant="sub">가격·배송비도 초안에 포함돼요. 원문을 유지하려면 현재 가격과 실제 판매 설정이 일치하는지 확인한 내용을 적어 주세요. 검토 선택을 저장해도 실제 판매 설정은 바뀌지 않아요.</T> : null}
              <>
                {!blocked && p.module !== null && kind !== "PLACEMENT" ? <Button compact variant="outline" label={label("원문 그대로 사용", "KEEP")} disabled={disabled} onPress={() => choose(p, "KEEP")} /> : null}
                {!blocked && p.module !== null && p.repairValue && !p.reasonCodes.OWNER_CONFIRMATION.length && !p.reasonCodes.SAFETY.length ? <Button compact variant="outline" label={label("최소 수정 사용", "ACCEPT_REPAIR")} disabled={disabled} onPress={() => choose(p, "ACCEPT_REPAIR")} /> : null}
                <Button compact variant="outline" label={label("직접 수정", "EDIT")} disabled={disabled} onPress={() => choose(p, "EDIT")} />
              </>
              {action === "EDIT" ? <>
                <Input label="사용할 문구" multiline value={choice.value ?? ""} editable={!disabled} onChangeText={(value) => setChoices((old) => ({ ...old, [p.bindingHash]: { ...choice, value } }))} />
                {(kind === "PLACEMENT" || p.module === null) ? <View style={{ gap: 4 }}><T variant="sub">넣을 항목</T>{SOURCE_MODULES.filter(([id]) => !["sizePhoto", "crossSectionPhoto", "packagePhoto", "farmPhotos"].includes(id)).map(([id, title]) => <Button key={id} compact variant="outline" disabled={disabled} label={`${choice.module === id ? "선택됨 · " : ""}${title}`} onPress={() => setChoices((old) => ({ ...old, [p.bindingHash]: { ...choice, module: id } }))} />)}</View> : null}
              </> : null}
              {choice && (action === "EDIT" || (action === "KEEP" && requiresNote(p))) ? <Input
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
