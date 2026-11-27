import type { SourceBatch, SourceRun } from "@farmclub/api";
import { T, tokens } from "@farmclub/ui";
import { useRef } from "react";
import { View } from "react-native";

const finished = (status: string) =>
  ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED"].includes(status);
const phases: Record<string, string> = {
  PREPARE: "자료 준비", EXTRACT: "내용 분석", REFINE: "문구 정리",
};
const statuses: Record<string, string> = {
  QUEUED: "대기", RUNNING: "진행 중", SUCCEEDED: "완료",
  PARTIAL: "미완료 부분 있음", FAILED: "처리 중단", CANCELLED: "취소",
};


type Item = SourceRun["items"][number];
/** Share of one item's work that is done (0..1), from real counts only. */
function itemDone(item: Item) {
  if (finished(item.status)) return 1;
  if (item.status !== "RUNNING") return 0;
  const p = item.progress;
  if (p && p.total > 0) {
    const part = Math.min(1, p.done / p.total);
    // Reading pages (OCR) is the first 60% of an analysis item, analysing text the rest.
    return item.phase === "EXTRACT" ? (p.stage === "READ" ? 0.6 * part : 0.6 + 0.4 * part) : part;
  }
  return 0.05;
}
const WEIGHT: Record<string, number> = { PREPARE: 1, EXTRACT: 6 };

/**
 * DEV-452: overall progress (0..100) of a run. Work units come from the run's items and their
 * live counts; a document whose analysis step is not queued yet still counts it as pending work.
 * Never based on elapsed time. Stays below 100 until every item has finished.
 */
export function runPercent(batch: Pick<SourceBatch, "sources">, run: SourceRun) {
  let total = 0, done = 0;
  const add = (weight: number, share: number) => { total += weight; done += weight * share; };
  const assets = new Set(run.items.map((i) => i.assetId));
  for (const id of assets) {
    const items = run.items.filter((i) => i.assetId === id);
    const extracts = items.filter((i) => i.phase === "EXTRACT");
    for (const item of items.filter((i) => i.phase !== "EXTRACT")) add(WEIGHT[item.phase] ?? 1, itemDone(item));
    const source = batch.sources.find((s) => s.id === id);
    if (extracts.length) extracts.forEach((item) => add(WEIGHT.EXTRACT / extracts.length, itemDone(item)));
    // The analysis item is queued only after preparation; count it as pending work meanwhile.
    else if (source && !source.originalPhoto && !items.some((i) => i.phase === "PREPARE" && ["FAILED", "CANCELLED"].includes(i.status)))
      add(WEIGHT.EXTRACT, 0);
  }
  if (!total) return 0;
  const percent = Math.floor((100 * done) / total);
  return run.items.every((i) => finished(i.status)) ? 100 : Math.min(99, percent);
}

/** What is happening now, in plain words with real counts. */
export function runStage(run: SourceRun) {
  const running = run.items.find((i) => i.status === "RUNNING") ?? run.items.find((i) => i.status === "QUEUED");
  if (!running) return "페이지를 구성하고 있어요";
  const p = running.progress;
  if (running.phase === "PREPARE") return "자료를 열고 사진을 찾고 있어요";
  if (running.phase === "EXTRACT" && p?.stage === "READ") return `자료를 읽고 있어요 · ${p.done}/${p.total}쪽`;
  if (running.phase === "EXTRACT" && p?.stage === "ANALYSE") return `내용을 정리하고 있어요 · ${p.done}/${p.total}`;
  if (running.phase === "EXTRACT") return "내용을 정리하고 있어요";
  return "페이지를 구성하고 있어요";
}

export function ProgressBar({ percent }: { percent: number }) {
  return (
    <View
      testID="source-run-bar"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={{ height: 10, borderRadius: 5, backgroundColor: tokens.color.border, overflow: "hidden" }}
    >
      <View style={{ width: `${percent}%`, height: "100%", backgroundColor: tokens.color.accent }} />
    </View>
  );
}

/** Counts come from the current run, never from elapsed time or an estimated duration. */
export function SourceRunProgress({ batch, run }: { batch: SourceBatch; run: SourceRun }) {
  const sources = [...new Set(run.items
    .filter((item) => item.phase !== "REFINE")
    .map((item) => item.assetId))].map((id) => ({
      id,
      source: batch.sources.find((source) => source.id === id),
      items: run.items.filter((item) => item.assetId === id && item.phase !== "REFINE"),
    }));
  const completed = sources.filter(({ items }) => items.every((item) => finished(item.status))).length;
  // Items appear as work is discovered; never move the bar backwards for the same run.
  const best = useRef<{ run: string; percent: number }>({ run: "", percent: 0 });
  const raw = runPercent(batch, run);
  if (best.current.run !== run.id) best.current = { run: run.id, percent: 0 };
  best.current.percent = Math.max(best.current.percent, raw);
  const percent = best.current.percent;
  return (
    <View testID="source-run-progress" accessibilityLiveRegion="polite" style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <T weight="semibold">{runStage(run)}</T>
        <T weight="semibold">{percent}%</T>
      </View>
      <ProgressBar percent={percent} />
      <T variant="caption" muted>처리 종료 · 자료 {completed}/{sources.length}</T>
      {sources.map(({ id, source, items }, index) => {
        const current = items.find((item) => item.status === "RUNNING")
          ?? items.find((item) => item.status === "QUEUED") ?? items.at(-1);
        const analysed = Math.max(0, ...items.map((item) => item.pagesAnalysed ?? 0));
        const prepared = items.some((item) => item.phase === "PREPARE" && item.status === "SUCCEEDED");
        return (
          <T key={id} variant="caption">
            자료 {index + 1} · {source?.mime === "application/pdf" ? "PDF · " : ""}
            {phases[current?.phase ?? ""] ?? "분석"} {statuses[current?.status ?? ""] ?? "대기"}
            {/* With live counts the headline already says which page is being read (DEV-452). */}
            {source?.pageCount && !items.some((item) => item.progress && !finished(item.status))
              ? ` · ${analysed}/${source.pageCount}쪽 분석${prepared ? ` · ${source.pageCount}쪽 준비됨` : ""}`
              : ""}
          </T>
        );
      })}
      {run.items.filter((item) => item.phase === "REFINE").map((item) => (
        <T key={item.id} variant="caption">문구 정리 · {statuses[item.status] ?? item.status}</T>
      ))}
      <T variant="caption" muted>
        다른 화면에 다녀와도 괜찮아요. 돌아오면 진행 상황을 확인할 수 있어요.
      </T>
    </View>
  );
}

const STEPS = ["자료 열기", "글과 사진 읽기", "내용 정리", "페이지 구성"] as const;

/** Which of STEPS the run is on (0..3); 4 when everything has finished. From item states only. */
export function runStep(run: SourceRun) {
  const open = (phase: string) => run.items.some((i) => i.phase === phase && !finished(i.status));
  if (run.items.length && run.items.every((i) => finished(i.status))) return 4;
  if (open("PREPARE") || !run.items.some((i) => i.phase === "EXTRACT")) return 0;
  const reading = run.items.find((i) => i.phase === "EXTRACT" && !finished(i.status));
  if (reading) return reading.status === "RUNNING" && reading.progress?.stage === "ANALYSE" ? 2 : 1;
  return 3;
}

/**
 * DEV-452 waiting screen for the combined setup flow (user review 11/28): one headline, the bar,
 * and four plain steps instead of per-item status words. Counts and steps come from the run only.
 */
export function SourceRunSteps({ batch, run }: { batch: SourceBatch; run: SourceRun }) {
  const best = useRef<{ run: string; percent: number }>({ run: "", percent: 0 });
  const raw = runPercent(batch, run);
  if (best.current.run !== run.id) best.current = { run: run.id, percent: 0 };
  best.current.percent = Math.max(best.current.percent, raw);
  const percent = best.current.percent;
  const step = runStep(run);
  const ids = [...new Set(run.items.filter((i) => i.phase !== "REFINE").map((i) => i.assetId))];
  const done = ids.filter((id) => run.items.filter((i) => i.assetId === id).every((i) => finished(i.status))).length;
  return (
    <View testID="source-run-progress" accessibilityLiveRegion="polite" style={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <T weight="semibold">{runStage(run)}</T>
          <T weight="semibold">{percent}%</T>
        </View>
        <ProgressBar percent={percent} />
        {ids.length > 1 ? <T variant="caption" muted>{`자료 ${ids.length}개 중 ${done}개를 끝냈어요`}</T> : null}
      </View>
      <View style={{ gap: 10 }}>
        {STEPS.map((label, i) => {
          const state = i < step ? "done" : i === step ? "now" : "wait";
          return (
            <View key={label} testID={`run-step-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{
                width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center",
                backgroundColor: state === "done" ? tokens.color.accent : "transparent",
                borderWidth: state === "done" ? 0 : 2,
                borderColor: state === "now" ? tokens.color.accent : tokens.color.border,
              }}>
                {state === "done" ? <T variant="caption" weight="semibold" color="#FFFFFF">✓</T> : null}
              </View>
              <T weight={state === "now" ? "semibold" : undefined} muted={state === "wait"}>{label}</T>
            </View>
          );
        })}
      </View>
      <T variant="caption" muted>다른 화면에 다녀와도 괜찮아요. 다 만들어지면 상품 목록에서 이어서 확인할 수 있어요.</T>
    </View>
  );
}
