// 우편번호 찾기 결과 → 배송지 입력칸 (FEAT-08, screens.md 결정 27, DEV-314)
// 카카오(다음) 우편번호 서비스가 돌려준 값에서 우편번호(zonecode)와 주소를 꺼낸다. 화면·DOM과 무관한 순수 함수라
// Node 테스트(scripts/test-postcode.mjs)가 그대로 읽는다. 스크립트를 불러 여는 쪽은 postcodeSearch.ts(웹)·.native.ts.

/** 공식 스크립트(키 없음). daumcdn 주소는 같은 파일의 예전 주소다. 질의 문자열을 붙이면 서비스가 잘못된 호출로 본다 */
export const POSTCODE_SCRIPT_URL =
  "https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

/** oncomplete 값 중 쓰는 것. 서비스는 모든 값을 문자열로 주고, 없으면 빈 문자열이다 */
export type PostcodeResult = {
  zonecode?: string;
  roadAddress?: string;
  jibunAddress?: string;
  /** 사용자가 지번을 골랐거나 도로명이 1:N이라 비었을 때 서비스가 채운 첫 도로명 */
  autoRoadAddress?: string;
  autoJibunAddress?: string;
};

export type PostcodeFields = { postalCode: string; address: string };

const ZONECODE = /^\d{5}$/;

/**
 * 고른 결과를 입력칸 값으로 바꾼다. 도로명 주소를 먼저 쓰고, 없으면 지번 주소를 쓴다.
 * 우편번호가 5자리 숫자가 아니거나 주소가 비면 null(입력칸을 바꾸지 않고 직접 입력에 맡긴다).
 */
export function postcodeFields(result: PostcodeResult | null | undefined): PostcodeFields | null {
  if (!result) return null;
  const postalCode = (result.zonecode ?? "").trim();
  if (!ZONECODE.test(postalCode)) return null;
  const pick = (...values: (string | undefined)[]) =>
    values.map((v) => (v ?? "").trim()).find(Boolean) ?? "";
  const address = pick(
    result.roadAddress,
    result.autoRoadAddress,
    result.jibunAddress,
    result.autoJibunAddress,
  );
  if (!address) return null;
  return { postalCode, address };
}

/**
 * 도서산간(예시) 판정: 제주·울릉·옹진 우편번호 앞자리 또는 주소. 서버 orders/service.py `_REMOTE_POSTAL`·`_REMOTE_ADDRESS`와
 * 같은 규칙이고 최종 금액은 서버가 정한다(AC-08-4, R-20). 직접 입력과 우편번호 찾기 값에 같게 쓴다.
 */
export function isRemoteArea(postalCode: string, address: string): boolean {
  return /^(63|40[0-2]|23[01])/.test(postalCode) || /(울릉|옹진|도서)/.test(address);
}
