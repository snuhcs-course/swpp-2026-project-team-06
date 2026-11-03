import { useLocalSearchParams } from "expo-router";
import { ProductPageEditor } from "../../../../lib/ProductPageEditor";
export default function ProductDetailEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProductPageEditor productId={id} />;
}
