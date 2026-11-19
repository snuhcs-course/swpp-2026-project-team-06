import { useLocalSearchParams } from "expo-router";
import { DetailEditor } from "../../../../lib/DetailEditor";
/**
 * 상품 상세(블록) 편집. 자료 분석이 꺼진 서버·Mock에서 상품만 여는 composer의 '상세 고치기'가 연다(DEV-84, DEV-361 PR C).
 * 저장하면 상품에 바로 들어간다(예전 기존 편집기와 같음).
 */
export default function ProductStoryEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DetailEditor productId={id} />;
}
