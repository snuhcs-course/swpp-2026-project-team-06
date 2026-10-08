import { useLocalSearchParams } from "expo-router";
import { DetailEditor } from "../../../../lib/DetailEditor";
export default function ProductDetailEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DetailEditor productId={id} />;
}
