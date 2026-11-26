import { Redirect } from "expo-router";
/**
 * 예전 '물량·판매 설정'(SCR-23 하위) 주소. DEV-487 (2/2)에서 물량은 상품 총량(승인 물량) 하나가 되어 이 화면을 없앴다.
 * 판매 중지·재개와 첫 판매 요청 철회는 상품 목록 카드에서 한다. 북마크·예전 앱 링크가 깨지지 않게 상품 목록으로 보낸다.
 */
export default function SalesRedirect() {
  return <Redirect href="/products" />;
}
