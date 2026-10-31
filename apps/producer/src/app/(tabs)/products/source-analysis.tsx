import { useLocalSearchParams } from "expo-router";
import { NewProductComposer } from "../../../lib/NewProductComposer";
import { SourceWorkspace } from "../../../lib/SourceWorkspace";
import { useSession } from "../../../lib/session";
export default function SourceAnalysisPage() {
  const { user } = useSession();
  // 새 상품 버튼으로 연 작업(항상 상품 1개짜리 batch)은 한 화면 편집(DEV-184), 그 밖의 자료 작업은 기존 화면.
  // URL을 직접 고쳐 여러 상품 batch를 composer로 열면 상세 편집만 되고 상품 칸·다음은 막힌다.
  const { composer } = useLocalSearchParams<{ composer?: string }>();
  return composer === "1" ? (
    <NewProductComposer key={user?.userId ?? ""} />
  ) : (
    <SourceWorkspace key={user?.userId ?? ""} />
  );
}
