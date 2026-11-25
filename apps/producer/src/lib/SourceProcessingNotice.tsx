import { Button, T } from "@farmclub/ui";
import { View } from "react-native";

export function SourceProcessingNotice({ disabled, onView }: { disabled: boolean; onView: () => void }) {
  return <View accessibilityRole="alert" style={{ gap: 8 }} testID="source-processing-incomplete">
    <T>자료를 모두 읽지 못했어요.</T>
    <T variant="caption">진행 내용과 작성 중인 문구는 비공개로 보관돼요. 미완료 부분을 다시 처리하거나 해당 자료를 첨부 목록에서 제외한 뒤 상품에 반영해 주세요.</T>
    <T variant="caption" muted>읽을 수 없는 파일은 선명한 자료로 바꿔 주세요. 분석 범위를 넘긴 PDF는 나눠서 올려 주세요. 연결 설정·예산 문제는 담당자 확인이 필요해요.</T>
    <Button label="미완성 초안 보기" variant="text" disabled={disabled} onPress={onView} />
  </View>;
}
