import { Redirect, useLocalSearchParams } from "expo-router";
/**
 * 예전 상품 편집(SCR-25) 주소. DEV-361 PR C에서 상품 수정은 판매페이지 화면(composer) 하나가 됐다.
 * 북마크·예전 앱 링크가 깨지지 않게 몇 주 동안 `/products/:id/detail`로 보낸다.
 */
export default function EditRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: "/products/[id]/detail", params: { id } }} />;
}
