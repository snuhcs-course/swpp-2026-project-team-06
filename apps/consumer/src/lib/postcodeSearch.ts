// 우편번호 찾기 — 웹(DEV-314). iOS·Android는 postcodeSearch.native.ts(버튼 없음, 직접 입력).
// 카카오(다음) 우편번호 서비스 스크립트(키 없음)를 배송지 입력 화면이 열릴 때 한 번만 불러온다.
// 창은 팝업(window.open) 대신 화면 위 레이어에 embed한다: 팝업 차단·웹뷰의 window.open 미지원을 피한다(서비스 안내).
// 스크립트를 못 불러오면 onError를 부르고, 입력칸은 그대로 두어 직접 입력으로 이어 간다.
import { POSTCODE_SCRIPT_URL, postcodeFields, type PostcodeFields, type PostcodeResult } from "./postcode";

type PostcodeOptions = {
  oncomplete: (data: PostcodeResult) => void;
  width?: string | number;
  height?: string | number;
};
type PostcodeCtor = new (options: PostcodeOptions) => {
  embed: (element: HTMLElement, options?: { autoClose?: boolean }) => void;
};
type PostcodeWindow = Window & {
  kakao?: { Postcode?: PostcodeCtor };
  daum?: { Postcode?: PostcodeCtor };
};

export type PostcodeError = "load" | "result";

export const postcodeSearchAvailable = true;

const LOAD_TIMEOUT_MS = 10_000;
let loading: Promise<PostcodeCtor> | null = null;

function ctor(): PostcodeCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as PostcodeWindow;
  return w.kakao?.Postcode ?? w.daum?.Postcode ?? null;
}

/** 스크립트를 한 번만 불러온다. 실패하면 다음 호출에서 다시 시도한다 */
function loadPostcode(): Promise<PostcodeCtor> {
  const ready = ctor();
  if (ready) return Promise.resolve(ready);
  if (typeof document === "undefined") return Promise.reject(new Error("no document"));
  if (loading) return loading;
  loading = new Promise<PostcodeCtor>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = POSTCODE_SCRIPT_URL;
    script.async = true;
    const fail = (reason: string) => {
      clearTimeout(timer);
      script.remove();
      loading = null;
      reject(new Error(reason));
    };
    const timer = setTimeout(() => fail("postcode script timeout"), LOAD_TIMEOUT_MS);
    script.onload = () => {
      const loaded = ctor();
      if (!loaded) return fail("postcode script loaded without Postcode");
      clearTimeout(timer);
      resolve(loaded);
    };
    script.onerror = () => fail("postcode script failed");
    document.head.appendChild(script);
  });
  return loading;
}

/** 배송지 입력 화면이 열릴 때 미리 불러 둔다. 실패는 버튼을 누를 때 다시 시도한다 */
export function preloadPostcode(): void {
  loadPostcode().catch(() => {});
}

/**
 * 우편번호 찾기 레이어를 연다. 고르면 onSelect(우편번호·주소)를 부르고 닫는다.
 * 돌려준 함수를 부르면 레이어를 닫는다(화면을 떠날 때).
 */
export function openPostcodeSearch({
  onSelect,
  onError,
}: {
  onSelect: (fields: PostcodeFields) => void;
  /** load: 스크립트를 못 불러옴, result: 고른 값에 5자리 우편번호·주소가 없음 */
  onError: (reason: PostcodeError) => void;
}): () => void {
  let closed = false;
  let overlay: HTMLDivElement | null = null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    overlay?.remove();
    overlay = null;
  }

  loadPostcode().then(
    (Postcode) => {
      if (closed) return;
      overlay = buildOverlay(close);
      const frame = overlay.querySelector<HTMLDivElement>("[data-postcode-frame]");
      document.body.appendChild(overlay);
      document.addEventListener("keydown", onKey);
      overlay.querySelector<HTMLButtonElement>("button")?.focus();
      try {
        new Postcode({
          width: "100%",
          height: "100%",
          oncomplete: (data) => {
            const fields = postcodeFields(data);
            close();
            if (fields) onSelect(fields);
            else onError("result");
          },
        }).embed(frame ?? overlay, { autoClose: false });
      } catch {
        close();
        onError("load");
      }
    },
    () => {
      if (closed) return;
      closed = true;
      onError("load");
    },
  );
  return close;
}

/** 화면 위 레이어: 머리(제목·닫기) + 서비스 iframe 자리. 가로 최대 480(앱 폭) */
function buildOverlay(onClose: () => void): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "우편번호 찾기");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "1000",
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    justifyContent: "center",
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) onClose();
  });

  const panel = document.createElement("div");
  Object.assign(panel.style, {
    width: "100%",
    maxWidth: "480px",
    height: "100%",
    background: "#FFFFFF",
    display: "flex",
    flexDirection: "column",
  });

  const head = document.createElement("div");
  Object.assign(head.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: "56px",
    padding: "0 8px 0 20px",
    fontSize: "17px",
    fontWeight: "600",
    borderBottom: "1px solid #EEEEEE",
  });
  head.textContent = "우편번호 찾기";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "닫기";
  closeButton.setAttribute("aria-label", "닫기");
  Object.assign(closeButton.style, {
    minWidth: "48px",
    height: "48px",
    border: "0",
    background: "transparent",
    fontSize: "15px",
    cursor: "pointer",
  });
  closeButton.addEventListener("click", onClose);
  head.appendChild(closeButton);

  const frame = document.createElement("div");
  frame.setAttribute("data-postcode-frame", "");
  Object.assign(frame.style, { flex: "1", minHeight: "400px", overflow: "hidden" });

  panel.append(head, frame);
  overlay.appendChild(panel);
  return overlay;
}
