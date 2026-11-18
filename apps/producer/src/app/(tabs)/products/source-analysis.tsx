import { NewProductComposer } from "../../../lib/NewProductComposer";
import { useSession } from "../../../lib/session";
/**
 * 판매페이지 화면(composer). 새 상품과 '상품 수정'(`/products/:id/detail`)이 자료 작업(batch)을 열고 이 주소로 온다.
 * 예전 2탭 자료 작업 화면은 DEV-361 PR C에서 지웠다. 상품 하나에 묶이지 않은 예전 작업은 composer가 상품 목록으로 안내한다.
 */
export default function SourceAnalysisPage() {
  const { user } = useSession();
  return <NewProductComposer key={user?.userId ?? ""} />;
}
