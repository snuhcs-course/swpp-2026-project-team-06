// 우편번호 찾기 결과 → 배송지 입력칸 (FEAT-08, screens.md 결정 27, DEV-314)
// 카카오(다음) 우편번호 서비스가 돌려준 값에서 우편번호(zonecode)와 주소를 꺼낸다. 화면·DOM과 무관한 순수 함수라
// Node 테스트(scripts/test-postcode.mjs)가 그대로 읽는다. 스크립트를 불러 여는 쪽은 postcodeSearch.ts(웹)·.native.tsx(앱 웹뷰).

/** 공식 스크립트(키 없음). daumcdn 주소는 같은 파일의 예전 주소다. 질의 문자열을 붙이면 서비스가 잘못된 호출로 본다 */
export const POSTCODE_SCRIPT_URL =
  "https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

/** 스크립트·웹뷰가 이 시간 안에 뜨지 않으면 직접 입력 안내 */
export const POSTCODE_LOAD_TIMEOUT_MS = 10_000;

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

/** 앱 웹뷰가 보내는 메시지를 읽은 결과. select: 칸을 채움, invalid: 고른 값을 못 씀, load: 서비스를 못 띄움, ignore: 모르는 메시지 */
export type PostcodeMessage =
  | { kind: "select"; fields: PostcodeFields }
  | { kind: "invalid" }
  | { kind: "load" }
  | { kind: "ready" }
  | { kind: "ignore" };

/**
 * 앱(iOS·Android) 웹뷰의 postMessage 문자열을 읽는다(postcodeWebViewHtml이 보냄).
 * {type:"complete", zonecode, roadAddress, jibunAddress, …} → postcodeFields로 같은 규칙을 적용한다.
 * JSON이 깨졌거나 모르는 type이면 ignore(웹뷰 안 다른 스크립트의 메시지일 수 있음).
 */
export function parsePostcodeMessage(raw: unknown): PostcodeMessage {
  if (typeof raw !== "string") return { kind: "ignore" };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { kind: "ignore" };
  }
  if (!data || typeof data !== "object") return { kind: "ignore" };
  const msg = data as Record<string, unknown>;
  if (msg.type === "ready") return { kind: "ready" };
  if (msg.type === "error") return { kind: "load" };
  if (msg.type !== "complete") return { kind: "ignore" };
  const text = (v: unknown) => (typeof v === "string" ? v : undefined);
  const fields = postcodeFields({
    zonecode: text(msg.zonecode),
    roadAddress: text(msg.roadAddress),
    jibunAddress: text(msg.jibunAddress),
    autoRoadAddress: text(msg.autoRoadAddress),
    autoJibunAddress: text(msg.autoJibunAddress),
  });
  return fields ? { kind: "select", fields } : { kind: "invalid" };
}

/**
 * 앱 웹뷰에 넣는 HTML. 웹과 같은 공식 스크립트를 불러 화면 전체에 embed하고,
 * 고르면 ReactNativeWebView.postMessage로 결과를, 못 불러오면 error를 보낸다.
 */
export function postcodeWebViewHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body,#wrap{margin:0;padding:0;width:100%;height:100%;}</style></head>
<body><div id="wrap"></div><script>
function post(m){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(m));}
var s=document.createElement("script");
s.src=${JSON.stringify(POSTCODE_SCRIPT_URL)};
s.onload=function(){try{
var P=(window.kakao&&window.kakao.Postcode)||(window.daum&&window.daum.Postcode);
new P({width:"100%",height:"100%",oncomplete:function(d){post({type:"complete",zonecode:d.zonecode,
roadAddress:d.roadAddress,jibunAddress:d.jibunAddress,autoRoadAddress:d.autoRoadAddress,
autoJibunAddress:d.autoJibunAddress});}}).embed(document.getElementById("wrap"),{autoClose:false});
post({type:"ready"});}catch(e){post({type:"error"});}};
s.onerror=function(){post({type:"error"});};
document.head.appendChild(s);
</script></body></html>`;
}
