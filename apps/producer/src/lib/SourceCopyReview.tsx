import { sourceAnalysis, type SourceCopyAction, type SourceCopyDecision, type SourceCopyPassage, type SourceCopyPresentation, type SourceCopyReview } from "@farmclub/api";
import { Button, Input, SOURCE_MODULES, T, tokens } from "@farmclub/ui";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

/** One shared request per batch/target/reviewVersion for every review panel on the screen. */
const copyCache = new Map<string, Promise<SourceCopyReview>>();
/** After a saved review answer: the next read must come from the server. */
export const clearSourceCopyCache = () => copyCache.clear();
export function sourceCopyOnce(batchId: string, targetId: string, reviewVersion: number) {
  const key = `${batchId}:${targetId}:${reviewVersion}`;
  let hit = copyCache.get(key);
  if (!hit) {
    hit = sourceAnalysis.sourceCopy(batchId, targetId);
    hit.catch(() => copyCache.delete(key));
    copyCache.set(key, hit);
  }
  return hit;
}

const groups = [
  ["COPY_EDIT", "문장 점검", "원문을 유지해요. 공백 제안과 끊긴 문장을 확인해 주세요. 맞춤법·문법 전체 검사는 하지 않아요."],
  ["OWNER_CONFIRMATION", "현재 정보 확인", "날짜·판매 조건이 지금도 맞는지 확인해 주세요. 원문은 비공개 초안에 남고, 확인을 마쳐야 공개할 수 있어요."],
  ["PLACEMENT", "배치 확인", "내용을 확인하고 알맞은 항목으로 옮기거나 제외해 주세요. 담을 수 없는 원문도 아래에 전부 보여요."],
  ["SAFETY", "사용 제한 확인", "비공개 초안의 문구를 공개하기 전에 확인해 주세요. 개인정보·질병 효능·다른 상품의 문구는 안전하게 수정하거나 제외해야 해요."],
] as const;

/**
 * DEV-452 (user 11/28): passages a wording rule left off the page by itself — not the owner's
 * 빼기, not an exact repeat, not a line the sale settings replace (those show next to the
 * settings). Shown in 자료에서 안 쓴 내용 so a wrong removal can be put back in any section.
 */
export const isAutoRemoved = (p: SourceCopyPassage) =>
  p.status === "EXCLUDED" && !p.decision && !p.inputPreferred && !p.duplicateOf;
const autoRemovedReasons: Record<string, string> = {
  SALE_ENDED: "지난 판매의 종료·품절 안내로 보여서 뺐어요.",
};
export const autoRemovedReason = (p: SourceCopyPassage) =>
  Object.values(p.reasonCodes).flat().map((code) => autoRemovedReasons[code]).find(Boolean) ?? "자동 규칙으로 뺐어요.";
export const RESTORE_NOTE = "자동으로 뺀 문장을 확인하고 다시 넣었어요.";
const TEXT_SECTIONS = SOURCE_MODULES.filter(([id]) => !["sizePhoto", "crossSectionPhoto", "packagePhoto", "farmPhotos"].includes(id));

export const requiresNote = (p: SourceCopyPassage) => p.reasonCodes.OWNER_CONFIRMATION.length > 0 || p.reasonCodes.SAFETY.some((reason) => !["PRIVATE_VALUE", "HEALTH_CLAIM", "OTHER_PRODUCT"].includes(reason));
export const reasonMessages: Record<string, string> = {
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

const presentationMessages: Partial<Record<SourceCopyPresentation["status"], string>> = {
  PENDING: "비공개 초안이 준비됐어요. 원문을 살려 문장과 배치를 정리하고 있어요.",
  APPLIED: "원문을 살려 문장과 배치를 정리했어요. 아래 확인 항목은 공개 전에 검토해 주세요.",
  FALLBACK: "원문 초안을 그대로 보존했어요. 아래 확인 항목을 검토해 주세요.",
  STALE: "자료나 수정 내용이 바뀌어 현재 원문 초안을 유지했어요. 아래 확인 항목을 검토해 주세요.",
};

const decisionSnapshot = (decision: SourceCopyPassage["decision"]) => JSON.stringify(decision ? [
  decision.action, decision.value ?? null, decision.note ?? null, decision.module ?? null,
] : null);
const actionLabels: Record<SourceCopyAction, string> = {
  KEEP: "원문 그대로 사용", EDIT: "직접 수정", OMIT: "본문에서 제외",
  TRANSFER_TO_SETTINGS: "판매 설정에서 입력", ACCEPT_REPAIR: "최소 수정 사용",
};

export function SourceCopyReview({ batchId, targetId, enabled, reviewVersion, locked, beforeMutation, onReload, onBusy, focusPassageId, section }: {
  batchId: string; targetId: string; enabled: boolean; reviewVersion: number; locked: boolean;
  /**
   * DEV-452 combined edit view: show only this page section's notes, compactly, under that section.
   * `null` = passages the page does not use yet ("자료에서 찾았지만 안 넣은 내용").
   */
  section?: string | null;
  beforeMutation: () => Promise<boolean>;
  onReload: () => Promise<void>;
  onBusy: (value: boolean) => void;
  focusPassageId?: string;
}) {
  const [data, setData] = useState<SourceCopyReview | null>(null);
  const [choices, setChoices] = useState<Record<string, SourceCopyDecision>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [expandedDone, setExpandedDone] = useState<Record<string, boolean>>({});
  /** 자동으로 뺀 내용: the section the owner picked for each sentence (default: where it came from). */
  const [restoreTo, setRestoreTo] = useState<Record<string, string>>({});
  const operation = useRef(false), alive = useRef(true);
  const focusNode = useRef<View | null>(null);
  useEffect(() => {
    if (!focusPassageId || !data) return;
    const timer = setTimeout(() => (focusNode.current as unknown as { scrollIntoView?: (options: object) => void })?.scrollIntoView?.({ behavior: "smooth", block: "center" }), 100);
    return () => clearTimeout(timer);
  }, [focusPassageId, data]);
  // Keep the persisted decision seen at FIRST selection, even when polling refreshes data.
  const decisionBases = useRef(new Map<string, string>());
  const explicitPlacements = useRef(new Set<string>());
  const cancelChoice = (binding: string) => {
    decisionBases.current.delete(binding);
    explicitPlacements.current.delete(binding);
    setChoices((old) => Object.fromEntries(Object.entries(old).filter(([key]) => key !== binding)));
  };
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // Refresh server queues without replacing any unsaved choices or text inputs.
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    (section !== undefined ? sourceCopyOnce(batchId, targetId, reviewVersion) : sourceAnalysis.sourceCopy(batchId, targetId)).then((next) => {
      if (active && !operation.current) { setData(next); setError(""); }
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "검토 내용을 불러오지 못했어요."); });
    return () => { active = false; };
  }, [batchId, targetId, enabled, reviewVersion]);
  const disabled = locked || busy;
  const currentModuleFor = (p: SourceCopyPassage, plan = data?.plan) => plan?.modules?.find((module) =>
    module.texts.some((text) => text.passageIds?.includes(p.id)))?.module
    ?? p.optionAssembly?.module ?? p.autoRepair?.module ?? p.module;
  const unitFor = (p: SourceCopyPassage) => {
    const ids = p.autoRepair?.passageIds;
    const resolved = ids?.map((id) => data?.plan.passages.find((item) => item.id === id)).filter((item): item is SourceCopyPassage => !!item);
    return ids?.length && resolved?.length === ids.length && resolved.some((item) => item.id === p.id) ? resolved : [p];
  };
  const keyFor = (p: SourceCopyPassage) => unitFor(p).map((item) => item.bindingHash).join("/");
  const textFor = (p: SourceCopyPassage) => data?.plan.modules.flatMap((m) => m.texts).find((t) => t.passageIds?.includes(p.id))?.value ?? p.value;
  const promptsFor = (p: SourceCopyPassage) => [...new Map(unitFor(p).flatMap((item) => item.reviewPrompts ?? []).map((item) => [item.question, item])).values()];
  const blockedFor = (p: SourceCopyPassage) => unitFor(p).some((item) => item.reasonCodes.SAFETY.some((reason) => ["PRIVATE_VALUE", "HEALTH_CLAIM", "OTHER_PRODUCT"].includes(reason)));
  const beginChoice = (p: SourceCopyPassage, action: SourceCopyAction, quick = false) => {
    const unit = unitFor(p), next: Record<string, SourceCopyDecision> = {};
    for (const item of unit) {
      if (!decisionBases.current.has(item.bindingHash)) decisionBases.current.set(item.bindingHash, decisionSnapshot(item.decision));
      const subordinate = action === "EDIT" && item.id !== p.id;
      next[item.bindingHash] = { ...choices[item.bindingHash], bindingHash: item.bindingHash, action: subordinate ? "OMIT" : action,
        ...((choices[item.bindingHash]?.module ?? currentModuleFor(item)) ? { module: choices[item.bindingHash]?.module ?? currentModuleFor(item)! } : {}),
        ...(action === "EDIT" && !subordinate ? { value: choices[item.bindingHash]?.value ?? textFor(p) } : {}),
        ...(subordinate ? { note: "같은 문단의 직접 수정으로 대체했어요." } : quick ? { note: promptsFor(p).map((prompt) => prompt.confirmation).join(" ") || "원문과 현재 사용 내용을 확인했어요." } : choices[item.bindingHash]?.note ? { note: choices[item.bindingHash].note } : {}),
      };
    }
    return next;
  };
  const choose = (p: SourceCopyPassage, action: SourceCopyAction) => {
    setNotice("");
    const next = beginChoice(p, action);
    setChoices((old) => ({ ...old, ...next }));
    setOpened((old) => ({ ...old, [keyFor(p)]: true }));
  };
  const mutate = async (enable = false, direct?: Record<string, SourceCopyDecision>) => {
    const selected = direct ?? choices;
    if (disabled || operation.current) return;
    operation.current = true;
    setBusy(true); setError(""); setNotice("");
    let parentBusy = false;
    let saved: SourceCopyReview | null = null;
    try {
      if (!enable) {
        for (const choice of Object.values(selected)) {
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
        const decisions = Object.values(selected);
        if (decisions.some((c) => !latest.plan.passages.some((p) => p.bindingHash === c.bindingHash)))
          throw new Error("원본 자료가 바뀌었어요. 입력은 남아 있어요. 최신 문구를 확인하고 다시 선택해 주세요.");
        if (decisions.some((c) => decisionBases.current.get(c.bindingHash) !==
          decisionSnapshot(latest.plan.passages.find((p) => p.bindingHash === c.bindingHash)!.decision))) {
          if (alive.current) setData(latest);
          throw new Error("다른 화면에서 검토 선택이 바뀌었어요. 입력은 남아 있어요. 현재 저장된 선택을 확인하고 ‘저장 전 선택 취소’를 누른 뒤 다시 선택해 주세요.");
        }
        // Presentation may finish while a choice is unsaved. Follow its current
        // placement only when the owner has not explicitly selected a section.
        const currentDecisions = decisions.map((choice) => {
          if (explicitPlacements.current.has(choice.bindingHash) ||
            ["OMIT", "TRANSFER_TO_SETTINGS"].includes(choice.action)) return choice;
          const passage = latest.plan.passages.find((p) => p.bindingHash === choice.bindingHash)!;
          const module = currentModuleFor(passage, latest.plan);
          return module ? { ...choice, module } : choice;
        });
        const next = await sourceAnalysis.saveSourceCopy(batchId, targetId, {
          reviewVersion: latest.reviewVersion, planHash: latest.plan.planHash, decisions: currentDecisions,
        });
        saved = next;
      }
      await onReload();
      if (alive.current && saved) { setData(saved); setChoices((old) => Object.fromEntries(Object.entries(old).filter(([key]) => !selected[key]))); for (const key of Object.keys(selected)) { decisionBases.current.delete(key); explicitPlacements.current.delete(key); } }
      if (alive.current) setNotice("비공개 검토 내용을 저장했어요. 상품에 반영하려면 기존 반영 절차를 진행해 주세요.");
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "저장하지 못했어요. 입력 내용은 남아 있어요.");
    } finally {
      operation.current = false;
      if (parentBusy) onBusy(false);
      if (alive.current) setBusy(false);
    }
  };
  const acknowledge = (p: SourceCopyPassage) => {
    if (disabled || blockedFor(p)) return;
    const next = beginChoice(p, "KEEP", true);
    setChoices((old) => ({ ...old, ...next }));
    void mutate(false, next);
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
  const seenUnits = new Set<string>();
  const scoped = section !== undefined;
  const inSection = (p: SourceCopyPassage) => section === null
    // Leftovers: not placed in any section, and not deliberately left out.
    ? currentModuleFor(p) === null || (!p.includedInDraft && p.decision?.action !== "OMIT" && p.status !== "EXCLUDED")
    : currentModuleFor(p) === section && p.includedInDraft;
  const pending = (data?.plan.passages.filter((p) => scoped
    ? inSection(p) && (section === null || p.queueKinds.length > 0 || choices[p.bindingHash])
    : p.queueKinds.length > 0 || choices[p.bindingHash]) ?? []).filter((p) => {
    const key = keyFor(p); if (seenUnits.has(key)) return false; seenUnits.add(key); return true;
  });
  const kindFor = (p: SourceCopyPassage) => {
    const kinds = new Set(unitFor(p).flatMap((item) => item.queueKinds));
    return blockedFor(p) ? "SAFETY" : kinds.has("PLACEMENT") ? "PLACEMENT" : kinds.has("OWNER_CONFIRMATION") ? "OWNER_CONFIRMATION" : kinds.has("COPY_EDIT") ? "COPY_EDIT" : "SAFETY";
  };
  const pendingCount = pending.filter((p) => unitFor(p).some((item) => item.reviewPending)).length;
  const removed = section === null ? (data?.plan.passages.filter(isAutoRemoved) ?? []) : [];
  const restore = (p: SourceCopyPassage, module: string) => {
    if (disabled || blockedFor(p)) return;
    decisionBases.current.set(p.bindingHash, decisionSnapshot(p.decision));
    explicitPlacements.current.add(p.bindingHash);
    void mutate(false, { [p.bindingHash]: { bindingHash: p.bindingHash, action: "KEEP", module, note: RESTORE_NOTE } });
  };
  const presentationMessage = data?.plan.presentation && presentationMessages[data.plan.presentation.status];
  if (scoped && (!enabled || !data || (!pending.length && !removed.length && !error))) return null;
  return <View style={{ gap: 12, padding: tokens.space.gutter }} testID={scoped ? `source-copy-section-${section ?? "leftover"}` : "source-copy-review"}>
    {scoped ? (section === null ? <View style={{ gap: 2 }}><T weight="semibold">⑤ 자료에서 찾았지만 안 넣은 내용 · {pending.length}건</T><T variant="caption" muted>필요한 문장은 ‘본문에 넣기’로 원하는 섹션에 넣어 주세요.</T></View> : null) : <T weight="semibold">원문을 살려 상세 채우기</T>}
    {!enabled ? <>
      <T variant="sub" muted>원문의 문장을 사용하고, 문장 점검과 현재 정보 확인을 따로 진행해요. 직접 수정한 내용은 보존해요.</T>
      <Button label="원문 유지 방식 사용" disabled={disabled} loading={busy} onPress={() => void mutate(true)} />
    </> : <>
      {scoped ? null : <T variant="sub" muted>자료의 문구를 비공개 초안에 담았어요. 아래에서 공개 전에 확인할 이유를 보고 원문 유지·수정·제외를 선택해 주세요. ‘확인했어요’는 바로 저장돼요. 수정과 다른 선택은 ‘검토 선택 저장’으로 마무리해 주세요.</T>}
      {!scoped && presentationMessage ? <View accessibilityLiveRegion="polite" testID="source-copy-presentation-status">
        <T variant="sub" muted>{presentationMessage}</T>
      </View> : null}
      {!scoped && optionBlocks ? <T variant="sub" muted>옵션 {optionBlocks}개의 크기·수량·포장을 한곳에 묶었어요. 원문의 옵션별 관계는 그대로 유지해요.</T> : null}
      {!scoped && automaticJoins ? <T variant="sub" muted>인접한 원문 {automaticJoins}곳을 자동으로 연결했어요. 단어·수치·조건은 그대로 유지해요. 문맥 확인이 필요한 연결은 아래에 표시해요.</T> : null}
      {data && !scoped ? <View accessibilityRole="alert" style={{ gap: 4 }} testID="source-copy-publication-warning">
        <T weight="semibold">공개 전 확인 대기 · {pendingCount}건</T>
        <T variant="sub">{pendingCount ? "확인 대기 항목을 모두 처리해야 상품에 반영할 수 있어요. 비공개 저장과 미리보기는 계속할 수 있어요." : "자료 문구의 확인을 마쳤어요. 상품에 반영하기 전에 판매페이지 전체를 확인해 주세요."}</T>
      </View> : null}
      {data ? groups.map(([kind, title, hint]) => {
        const passages = pending.filter((p) => kindFor(p) === kind);
        return <View key={kind} style={{ gap: 8 }}>
          {scoped ? null : <><T weight="semibold">{title} · {passages.length}건</T>
          <T variant="caption" muted>{hint}</T></>}
          {passages.map((p, index) => {
            const choice = choices[p.bindingHash];
            const currentModule = currentModuleFor(p);
            const action = choice?.action;
            const price = p.reasonCodes.OWNER_CONFIRMATION.includes("PRICE_OR_FEE") || p.reasonCodes.SAFETY.includes("MONEY_AMOUNT");
            const blocked = blockedFor(p);
            const key = keyFor(p), prompts = promptsFor(p), critical = blockedFor(p);
            const warning = critical || prompts.some((prompt) => prompt.severity === "warning");
            const complete = unitFor(p).every((item) => !item.reviewPending && !!item.decision) && !unitFor(p).some((item) => choices[item.bindingHash]);
            if (complete && !expandedDone[key]) return <View key={p.id} testID={`review-complete-${p.id}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderRadius: 16, backgroundColor: "#EDF4E8" }}><T variant="sub">{p.decision?.action === "OMIT" ? "✓ 본문에서 제외했어요" : p.decision?.action === "EDIT" ? "✓ 수정했어요" : "✓ 확인했어요"}</T><Button compact variant="text" label="내용 보기" onPress={() => setExpandedDone((old) => ({ ...old, [key]: true }))} /></View>;
            const label = (text: string, value: SourceCopyAction) => `${action === value ? "선택됨 · " : ""}${text}`;
            return <View ref={unitFor(p).some((item) => item.id === focusPassageId) ? focusNode : undefined} nativeID={`review-${p.id}`} key={p.bindingHash} testID={`source-copy-passage-${p.id}-${kind}`} accessibilityRole={critical && !complete ? "alert" : undefined} style={{ gap: 12, padding: 16, borderWidth: critical && !complete ? 2 : 1, borderColor: critical && !complete ? "#D58B80" : "#E3D1AB", backgroundColor: critical && !complete ? "#FFF0ED" : "#FFFAEE", borderRadius: tokens.radius.md }}>
              <T variant="caption" muted>{index + 1}. {p.includedInDraft ? "비공개 초안에 포함" : p.status === "EXCLUDED" ? "초안에서 제외" : "아래 원문 확인 · 배치 필요"} · {p.reviewPending ? "공개 전 확인 필요" : "검토 완료"}</T>
              <T variant="caption" muted>{complete ? "✓ 확인 완료 · 이전 검토 내용" : critical ? "⚠ 수정이 필요해요" : warning ? "⚠ 잠깐 확인해 주세요" : "🌿 함께 확인해 볼까요?"}</T><T>{textFor(p)}</T>
              {p.originalValue !== textFor(p) && (unitFor(p).length === 1 || opened[key]) ? <><T variant="caption" muted>원문</T><T>{p.originalValue}</T></> : null}
              {prompts.length ? prompts.map((prompt) => <View key={prompt.question} style={{ gap: 5 }}><T weight="semibold" color={critical ? tokens.color.error : undefined}>{prompt.question}</T><T variant="sub">{prompt.detail}</T></View>) : [...new Set([...(p.reviewExplanations ?? []), ...unitFor(p).flatMap((item) => Object.values(item.reasonCodes).flat()).map((reason) => reasonMessages[reason] ?? "현재 자료의 표현과 사용 위치를 확인해 주세요.")])].map((message) => <T key={message} variant="sub">{message}</T>)}
              {!complete && !critical && !unitFor(p).some((item) => choices[item.bindingHash]?.action === "EDIT") && currentModule !== null && kind !== "PLACEMENT" ? <Button compact label="✓ 확인했어요" style={{ borderRadius: 999, backgroundColor: "#EDF4E8", borderColor: "#B5C7A8" }} variant="outline" disabled={disabled} onPress={() => acknowledge(p)} /> : null}
              {choice && decisionBases.current.get(p.bindingHash) !== decisionSnapshot(p.decision) ? <T color={tokens.color.error}>다른 화면에서 저장된 선택이 바뀌었어요. 현재 선택을 확인한 뒤 저장 전 선택을 취소하고 다시 선택해 주세요.</T> : null}
              {p.decision ? <T variant="sub">현재 저장된 선택: {actionLabels[p.decision.action]}</T> : opened[key] ? <T variant="caption" muted>현재 저장된 선택: 없음</T> : null}
              {p.decision?.action === "EDIT" ? <><T variant="caption" muted>저장된 수정 문구</T><T>{p.value}</T></> : null}
              {p.decision?.note ? <T variant="caption" muted>저장된 확인 내용: {p.decision.note}</T> : null}
              {p.repairValue && p.repairValue !== p.originalValue ? <><T variant="caption" muted>최소 수정 제안</T><T>{p.repairValue}</T></> : null}
              {price ? <T variant="sub">가격·배송비도 초안에 포함돼요. 원문을 유지하려면 현재 가격과 실제 판매 설정이 일치하는지 확인한 내용을 적어 주세요. 검토 선택을 저장해도 실제 판매 설정은 바뀌지 않아요.</T> : null}
              <>
                {opened[key] && !blocked && currentModule !== null && kind !== "PLACEMENT" ? <Button compact variant="outline" label={label("원문 그대로 사용", "KEEP")} disabled={disabled} onPress={() => choose(p, "KEEP")} /> : null}
                {!blocked && currentModule !== null && p.repairValue && !p.reasonCodes.OWNER_CONFIRMATION.length && !p.reasonCodes.SAFETY.length ? <Button compact variant="outline" label={label("최소 수정 사용", "ACCEPT_REPAIR")} disabled={disabled} onPress={() => choose(p, "ACCEPT_REPAIR")} /> : null}
                <Button compact variant="outline" label={label(section === null ? "본문에 넣기" : "✎ 수정할게요", "EDIT")} style={{ borderRadius: 999 }} disabled={disabled} onPress={() => choose(p, "EDIT")} />
              </>
              {action === "EDIT" ? <>
                <Input label="사용할 문구" multiline value={choice.value ?? ""} editable={!disabled} onChangeText={(value) => setChoices((old) => ({ ...old, [p.bindingHash]: { ...choice, value } }))} />
                {(kind === "PLACEMENT" || currentModule === null || section === null) ? <View style={{ gap: 4 }}><T variant="sub">넣을 항목</T>{SOURCE_MODULES.filter(([id]) => !["sizePhoto", "crossSectionPhoto", "packagePhoto", "farmPhotos"].includes(id)).map(([id, title]) => <Button key={id} compact variant="outline" disabled={disabled} label={`${choice.module === id ? "선택됨 · " : ""}${title}`} onPress={() => { explicitPlacements.current.add(p.bindingHash); setChoices((old) => ({ ...old, [p.bindingHash]: { ...choice, module: id } })); }} />)}</View> : null}
              </> : null}
              {choice && (action === "EDIT" || (action === "KEEP" && requiresNote(p))) ? <Input
                label={action === "EDIT" ? "수정한 이유와 확인한 내용" : "현재도 맞는지 확인한 내용"}
                hint="확인한 날짜나 판매 조건을 구체적으로 적어 주세요."
                value={choice.note ?? ""} editable={!disabled}
                onChangeText={(note) => setChoices((old) => ({ ...old, [p.bindingHash]: { ...choice, note } }))}
              /> : null}
              {action === "EDIT" ? <Button compact variant="text" label="문구를 바로잡았어요" disabled={disabled} onPress={() => setChoices((old) => ({ ...old, [p.bindingHash]: { ...old[p.bindingHash], note: "원문과 현재 정보를 확인하고 문구를 직접 바로잡았어요." } }))} /> : null}
              {complete ? <Button compact variant="text" label="확인 완료 접기" onPress={() => setExpandedDone((old) => ({ ...old, [key]: false }))} /> : null}
              {opened[key] && price ? <Button compact variant="outline" label={label("판매 설정에서 입력하기로 기록", "TRANSFER_TO_SETTINGS")} disabled={disabled} onPress={() => choose(p, "TRANSFER_TO_SETTINGS")} /> : null}
              <Button compact variant="text" label={opened[key] ? "다른 선택 접기" : "다른 선택 보기"} onPress={() => setOpened((old) => ({ ...old, [key]: !old[key] }))} />
              {opened[key] ? <Button compact variant="outline" label={label("본문에서 제외", "OMIT")} disabled={disabled} onPress={() => choose(p, "OMIT")} /> : null}
              {choice ? <Button compact variant="text" label="저장 전 선택 취소" disabled={disabled} onPress={() => unitFor(p).forEach((item) => cancelChoice(item.bindingHash))} /> : null}
            </View>;
          })}
        </View>;
      }) : <T variant="sub" muted>검토 내용을 불러오는 중이에요.</T>}
      {removed.length ? <View style={{ gap: 8 }} testID="auto-removed">
        <View style={{ gap: 2 }}>
          <T weight="semibold">{`자동으로 뺀 내용 · ${removed.length}건`}</T>
          <T variant="caption" muted>규칙에 따라 페이지에서 뺀 문장이에요. 필요하면 넣을 섹션을 골라 다시 넣을 수 있어요.</T>
        </View>
        {removed.map((p) => {
          const target = restoreTo[p.id] ?? (p.module && TEXT_SECTIONS.some(([id]) => id === p.module) ? p.module : TEXT_SECTIONS[0][0]);
          const targetTitle = TEXT_SECTIONS.find(([id]) => id === target)?.[1] ?? target;
          const blocked = blockedFor(p);
          return <View key={p.id} testID={`auto-removed-${p.id}`} style={{ gap: 8, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: tokens.color.border }}>
            <T>{p.originalValue}</T>
            <T variant="caption" muted>{autoRemovedReason(p)}</T>
            {blocked ? <T variant="caption" color={tokens.color.error}>다른 상품·개인정보·건강 효능이 섞였을 수 있어 그대로 넣을 수 없어요.</T> : <>
              <T variant="sub">넣을 섹션</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {TEXT_SECTIONS.map(([id, title]) => <Button key={id} compact variant="outline" disabled={disabled}
                  accessibilityLabel={`${title}에 넣기로 선택`}
                  label={`${target === id ? "선택됨 · " : ""}${title}`}
                  onPress={() => setRestoreTo((old) => ({ ...old, [p.id]: id }))} />)}
              </View>
              <Button compact label={`${targetTitle}에 넣기`} disabled={disabled} loading={busy} onPress={() => restore(p, target)} />
            </>}
          </View>;
        })}
      </View> : null}
      {Object.keys(choices).some((key) => data && !data.plan.passages.some((p) => p.bindingHash === key)) ? <>
        <T variant="sub">자료가 바뀌어 연결되지 않은 선택이 있어요. 입력을 확인한 뒤 이전 선택을 지워 주세요.</T>
        {Object.entries(choices).filter(([key]) => !data?.plan.passages.some((p) => p.bindingHash === key)).map(([key, choice]) => <View key={key} style={{ gap: 4 }}><T>{choice.value || "이전 원문에 대한 선택"}</T><Button compact variant="outline" label="이전 선택 지우기" disabled={disabled} onPress={() => cancelChoice(key)} /></View>)}
      </> : null}
      {!scoped || Object.keys(choices).length ? <Button label={scoped ? "선택 저장" : "검토 선택 저장"} disabled={disabled || !Object.keys(choices).length} loading={busy} onPress={() => void mutate()} /> : null}
    </>}
    {error ? <View accessibilityRole="alert" style={{ gap: 8 }}><T color={tokens.color.error}>{error}</T><T variant="caption" muted>입력한 선택과 문구는 그대로 남아 있어요.</T><Button compact variant="outline" label="검토 내용 다시 불러오기" disabled={disabled} onPress={() => void retry()} /></View> : null}
    {notice ? <T variant="sub">{notice}</T> : null}
  </View>;
}
