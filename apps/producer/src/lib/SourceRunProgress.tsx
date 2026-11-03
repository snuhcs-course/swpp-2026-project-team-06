import type { SourceBatch, SourceRun } from "@farmclub/api";
import { T } from "@farmclub/ui";
import { View } from "react-native";

const finished = (status: string) =>
  ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED"].includes(status);
const phases: Record<string, string> = {
  PREPARE: "자료 준비", EXTRACT: "내용 분석", REFINE: "문구 정리",
};
const statuses: Record<string, string> = {
  QUEUED: "대기", RUNNING: "진행 중", SUCCEEDED: "완료",
  PARTIAL: "일부 완료", FAILED: "실패", CANCELLED: "취소",
};

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
  return (
    <View testID="source-run-progress" accessibilityLiveRegion="polite" style={{ gap: 6 }}>
      <T>자료 {completed}/{sources.length}</T>
      {sources.map(({ id, source, items }, index) => {
        const current = items.find((item) => item.status === "RUNNING")
          ?? items.find((item) => item.status === "QUEUED") ?? items.at(-1);
        const analysed = Math.max(0, ...items.map((item) => item.pagesAnalysed ?? 0));
        const prepared = items.some((item) => item.phase === "PREPARE" && item.status === "SUCCEEDED");
        return (
          <T key={id} variant="caption">
            자료 {index + 1} · {source?.mime === "application/pdf" ? "PDF · " : ""}
            {phases[current?.phase ?? ""] ?? "분석"} {statuses[current?.status ?? ""] ?? "대기"}
            {source?.pageCount
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
