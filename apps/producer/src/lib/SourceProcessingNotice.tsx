import type { SourceBatch, SourceReview } from "@farmclub/api";
import { Button, T } from "@farmclub/ui";
import { View } from "react-native";

export function SourceProcessingNotice({ disabled, onView, issues = [], sources = [] }: { disabled: boolean; onView: () => void; issues?: NonNullable<SourceReview["processingIssues"]>; sources?: SourceBatch["sources"] }) {
  return <View accessibilityRole="alert" style={{ gap: 8 }} testID="source-processing-incomplete">
    <T>자료를 모두 읽지 못했어요.</T>
    <T variant="caption">읽은 내용으로 만든 초안은 비공개로 보관하며 수정·저장할 수 있고, 판매 조건도 입력할 수 있어요. 판매 시작 요청 전에 미완료 부분을 다시 처리하거나 해당 자료를 첨부 목록에서 제외해 주세요.</T>
    <T variant="caption" muted>읽을 수 없는 파일은 선명한 자료로 바꿔 주세요. 분석 범위를 넘긴 PDF는 나눠서 올려 주세요. 연결 설정·예산 문제는 담당자 확인이 필요해요.</T>
    {issues.map(issue => <T key={issue.itemId} variant="caption">{sources.find(s => s.id === issue.sourceId)?.filename ?? "첨부 자료"}{issue.pagesSkipped ? ` · 분석 범위를 넘긴 ${issue.pagesSkipped}쪽은 읽지 못했어요. PDF를 나눠 다시 올려 주세요.` : ""}{issue.failedPages?.length ? ` · ${issue.failedPages.map(p => p.number).join(", ")}쪽` : ""}{issue.failedPages?.some(p => p.code === "INCOMPLETE_OCR") ? " — 글자 읽기가 끝나지 않았어요. 미완료 부분을 다시 처리해 주세요." : " — 아직 읽지 못한 내용이 있어요."}</T>)}
    <Button label="미완성 초안 보기" variant="text" disabled={disabled} onPress={onView} />
  </View>;
}
