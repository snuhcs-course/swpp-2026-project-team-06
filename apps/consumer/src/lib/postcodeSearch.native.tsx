// 우편번호 찾기 — iOS·Android(DEV-314). 웹은 postcodeSearch.ts(레이어 embed).
// 전체 화면 모달에 웹뷰(react-native-webview)를 띄우고, 웹과 같은 공식 스크립트를 넣은 HTML(postcodeWebViewHtml)을 연다.
// 웹뷰가 보낸 결과는 lib/postcode.ts의 같은 규칙(5자리 우편번호, 도로명 → 지번)으로 읽는다.
// 닫기·Android 뒤로는 칸을 바꾸지 않고 닫는다. 못 띄우거나 10초 안에 안 뜨면 직접 입력 안내(onError("load")).
import { HeaderBar, Screen } from "@farmclub/ui";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, Platform, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import {
  POSTCODE_LOAD_TIMEOUT_MS,
  parsePostcodeMessage,
  postcodeWebViewHtml,
  type PostcodeFields,
} from "./postcode";

export type PostcodeError = "load" | "result";

export type PostcodeHandlers = {
  onSelect: (fields: PostcodeFields) => void;
  /** load: 서비스를 못 띄움, result: 고른 값에 5자리 우편번호·주소가 없음 */
  onError: (reason: PostcodeError) => void;
};

/** 스크립트 상대 주소·쿠키 기준. 공식 서비스 도메인 */
const BASE_URL = "https://postcode.map.kakao.com";
/** 다시 그려도 웹뷰가 새로 불러오지 않게 한 번만 만든다 */
const SOURCE = { html: postcodeWebViewHtml(), baseUrl: BASE_URL };
/** Android Modal은 닫힘 완료 알림(onDismiss)이 없다. 창이 내려간 뒤 상세 주소에 초점을 줘야 키보드가 뜬다 */
const ANDROID_DISMISS_MS = 300;

type Outcome = { kind: "select"; fields: PostcodeFields } | { kind: "error"; reason: PostcodeError };

export function usePostcodeSearch(handlers: PostcodeHandlers): { open: () => void; node: ReactNode } {
  const latest = useRef(handlers);
  latest.current = handlers;
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // iOS는 모달이 다 닫힌 뒤(onDismiss) 결과를 넘긴다. Android는 onDismiss가 없어 창이 내려갈 시간 뒤에 넘긴다
  const pending = useRef<Outcome | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const deliver = useCallback(() => {
    const outcome = pending.current;
    pending.current = null;
    if (!outcome) return;
    if (outcome.kind === "select") latest.current.onSelect(outcome.fields);
    else latest.current.onError(outcome.reason);
  }, []);
  const finish = useCallback(
    (outcome: Outcome | null) => {
      clearTimer();
      pending.current = outcome;
      setVisible(false);
      if (Platform.OS !== "ios") setTimeout(deliver, ANDROID_DISMISS_MS);
    },
    [deliver],
  );

  useEffect(() => clearTimer, []);

  const open = useCallback(() => {
    clearTimer();
    pending.current = null;
    setVisible(true);
    timer.current = setTimeout(() => finish({ kind: "error", reason: "load" }), POSTCODE_LOAD_TIMEOUT_MS);
  }, [finish]);

  const onMessage = (event: WebViewMessageEvent) => {
    const msg = parsePostcodeMessage(event.nativeEvent.data);
    if (msg.kind === "ready") clearTimer();
    else if (msg.kind === "select") finish({ kind: "select", fields: msg.fields });
    else if (msg.kind === "invalid") finish({ kind: "error", reason: "result" });
    else if (msg.kind === "load") finish({ kind: "error", reason: "load" });
  };

  const node = (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => finish(null)}
      onDismiss={deliver}
    >
      <Screen>
        <HeaderBar title="우편번호 찾기" close onBack={() => finish(null)} border />
        <View style={{ flex: 1 }}>
          {visible ? (
            <WebView
              source={SOURCE}
              javaScriptEnabled
              domStorageEnabled
              setSupportMultipleWindows={false}
              onMessage={onMessage}
              onError={() => finish({ kind: "error", reason: "load" })}
              onHttpError={() => finish({ kind: "error", reason: "load" })}
            />
          ) : null}
        </View>
      </Screen>
    </Modal>
  );
  return { open, node };
}
