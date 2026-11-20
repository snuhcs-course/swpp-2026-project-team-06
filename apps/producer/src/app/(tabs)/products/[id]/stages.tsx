import { Redirect, useLocalSearchParams } from "expo-router";
/**
 * 예전 예약 기간·가격(SCR-26) 주소. DEV-361 PR C에서 기간·가격은 상품 수정(composer)의 판매 조건 시트에서 고친다.
 * 몇 주 동안 `/products/:id/detail?terms=1`(시트를 연 채)로 보낸다. 판매 전 상품은 composer가 판매·가격으로 보낸다.
 */
export default function StagesRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: "/products/[id]/detail", params: { id, terms: "1" } }} />;
}
