// 우편번호 찾기 — iOS·Android(DEV-314). 웹은 postcodeSearch.ts.
// 앱에는 웹뷰 의존성이 없어 이 단계에서는 버튼을 숨기고 우편번호·주소를 직접 입력한다(screens.md 결정 27).
import type { PostcodeFields } from "./postcode";

export type PostcodeError = "load" | "result";

export const postcodeSearchAvailable = false;

export function preloadPostcode(): void {}

export function openPostcodeSearch(_handlers: {
  onSelect: (fields: PostcodeFields) => void;
  onError: (reason: PostcodeError) => void;
}): () => void {
  return () => {};
}
