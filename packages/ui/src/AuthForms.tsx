// 아이디·비밀번호 화면 조각(DEV-363). 소비자 SCR-05·생산자 SCR-19 로그인과 비밀번호 변경에서 같이 쓴다.
// 아이디 계정은 운영자가 관리자 웹에서만 만든다(PM 11/18, 공개 가입 없음).
// 서버 호출은 앱이 넘긴 함수가 한다(이 패키지는 API를 부르지 않는다). 오류는 ApiError 꼴(status·code·details)로 읽는다.
// 필수 칸 규칙(PM 11/18): 버튼은 늘 켜 두고, 누르면 첫 오류 칸으로 스크롤해 그 칸들만 빨갛게 보인다. 누르기 전에는 빨갛지 않다.
import { FORGOT_PASSWORD_TEXT, INVALID_LOGIN_TEXT, PASSWORD_RULE, passwordError } from "@farmclub/api";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";

import { Button } from "./Button";
import { Input } from "./Input";
import { T } from "./Text";
import { tokens } from "./tokens";

type Size = "consumer" | "producer";
type Fields = Record<string, string>;
type ErrorLike = { status?: number; code?: string; message?: string; details?: Record<string, unknown> };

const asError = (e: unknown): ErrorLike => (e && typeof e === "object" ? (e as ErrorLike) : {});

/** 칸 오류와 ‘누른 횟수’. 누를 때만 스크롤하고, 칸을 고치면 그 칸 오류만 지운다(producer FieldFeedback과 같은 규칙) */
export function useFieldErrors(order: readonly string[]) {
  const [fields, setFields] = useState<Fields>({});
  const [attempt, setAttempt] = useState(0);
  const show = useCallback(
    (next: Fields) => {
      // 화면 순서대로 둔다(서버가 준 순서와 상관없이 첫 칸으로 스크롤하게)
      const sorted: Fields = {};
      for (const key of order) if (next[key]) sorted[key] = next[key];
      for (const key of Object.keys(next)) if (!(key in sorted)) sorted[key] = next[key];
      setFields(sorted);
      setAttempt((a) => a + 1);
    },
    [order],
  );
  const clear = useCallback(
    (key: string) =>
      setFields((f) => {
        if (!(key in f)) return f;
        const rest = { ...f };
        delete rest[key];
        return rest;
      }),
    [],
  );
  return { fields, attempt, show, clear, reset: () => setFields({}) };
}

/** 첫 오류 칸이면 누를 때 화면 가운데로 스크롤한다(웹). 테두리는 칸 자체가 그린다 */
export function ErrorScroll({
  field,
  fields,
  attempt,
  children,
}: {
  field: string;
  fields: Fields;
  attempt: number;
  children: ReactNode;
}) {
  const node = useRef<View>(null);
  const invalid = !!fields[field];
  useEffect(() => {
    if (!invalid || Object.keys(fields)[0] !== field) return;
    (node.current as unknown as { scrollIntoView?: (o: object) => void } | null)?.scrollIntoView?.({
      block: "center",
      behavior: "smooth",
    });
    // 누를 때(attempt)만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  return (
    <View ref={node} testID={invalid ? `invalid-field-${field}` : undefined}>
      {children}
    </View>
  );
}

/** 로그인 실패를 사용자 문구로. 틀린 아이디·비밀번호는 한 문구(서버와 같음), 잠금은 서버 문구(남은 분) */
export function loginErrorText(e: unknown): string {
  const err = asError(e);
  if (err.status === 401) return INVALID_LOGIN_TEXT;
  if (err.status === 429 && err.message) return err.message;
  if (err.status === 0 && err.message) return err.message;
  return "로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
}

/** 비밀번호 찾기 안내(PM 11/18). 이메일 재설정 없이 farmclub 문의 → 운영자 임시 비밀번호 */
export function ForgotPasswordNote({ style }: { style?: object }) {
  return (
    <View style={[{ gap: 2 }, style]} testID="forgot-password">
      <T variant="sub" muted>
        {FORGOT_PASSWORD_TEXT}
      </T>
      <T variant="caption" muted>
        아래 사업자 정보의 연락처로 아이디를 알려 주시면 임시 비밀번호를 드려요. 아이디 계정은 farmclub이 만들어 드려요.
      </T>
    </View>
  );
}

const LOGIN_ORDER = ["username", "password"] as const;

/** 아이디·비밀번호 로그인 칸 + 로그인 버튼 + 비밀번호 찾기 안내(가입 버튼 없음: 운영자가 계정을 만든다) */
export function PasswordLoginForm({
  size = "consumer",
  onLogin,
  disabled,
}: {
  size?: Size;
  /** 서버 로그인. 실패하면 ApiError를 던진다 */
  onLogin: (username: string, password: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const errors = useFieldErrors(LOGIN_ORDER);

  async function submit() {
    if (busy || disabled) return;
    setFailed(null);
    const next: Fields = {};
    if (!username.trim()) next.username = "아이디를 적어 주세요";
    if (!password) next.password = "비밀번호를 적어 주세요";
    errors.show(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await onLogin(username, password);
      setPassword("");
    } catch (e) {
      setFailed(loginErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }} testID="password-login">
      <ErrorScroll field="username" {...errors}>
        <Input
          label="아이디"
          value={username}
          onChangeText={(v) => {
            setUsername(v);
            errors.clear("username");
          }}
          plain
          autoComplete="username"
          maxLength={64}
          placeholder="영문 소문자·숫자"
          error={errors.fields.username}
          testID="login-username"
        />
      </ErrorScroll>
      <ErrorScroll field="password" {...errors}>
        <Input
          label="비밀번호"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            errors.clear("password");
          }}
          secure
          autoComplete="current-password"
          maxLength={256}
          error={errors.fields.password}
          onSubmitEditing={() => void submit()}
          testID="login-password"
        />
      </ErrorScroll>
      {failed ? (
        <View accessibilityRole="alert" testID="login-error">
          <T variant="sub" color={tokens.color.error}>
            {failed}
          </T>
        </View>
      ) : null}
      {/* ‘로그인하기’: 테스트 계정 바(‘○○ 로그인’, e2e는 /로그인$/로 찾음)와 이름이 겹치지 않게 */}
      <Button label="로그인하기" size={size} loading={busy} onPress={() => void submit()} />
      <ForgotPasswordNote />
    </View>
  );
}

const CHANGE_ORDER = ["currentPassword", "newPassword", "confirm"] as const;

/** 비밀번호 변경 칸(설정·임시 비밀번호 뒤 강제 변경). 성공하면 onDone */
export function PasswordChangeForm({
  size = "consumer",
  forced,
  username,
  onChange,
  onDone,
}: {
  size?: Size;
  /** 임시 비밀번호로 들어와 바꿔야 한다 */
  forced?: boolean;
  username?: string | null;
  /** 서버 변경. 실패하면 ApiError(details.fields)를 던진다 */
  onChange: (currentPassword: string, newPassword: string) => Promise<void>;
  onDone: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const errors = useFieldErrors(CHANGE_ORDER);

  async function submit() {
    if (busy) return;
    setFailed(null);
    const found: Fields = {};
    if (!current) found.currentPassword = forced ? "받은 임시 비밀번호를 적어 주세요" : "지금 비밀번호를 적어 주세요";
    const p = passwordError(next, username ?? undefined);
    if (p) found.newPassword = p;
    else if (next === current) found.newPassword = "지금과 다른 비밀번호를 써 주세요";
    if (!confirm) found.confirm = "새 비밀번호를 한 번 더 적어 주세요";
    else if (confirm !== next) found.confirm = "새 비밀번호가 서로 달라요";
    errors.show(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await onChange(current, next);
      onDone();
    } catch (e) {
      const err = asError(e);
      const fields = err.details?.fields as Fields | undefined;
      if (err.status === 400 && fields) errors.show(fields);
      else if (err.status === 429 && err.message) setFailed(err.message);
      else setFailed(err.message ?? "바꾸지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 20 }} testID="password-change">
      <ErrorScroll field="currentPassword" {...errors}>
        <Input
          label={forced ? "받은 임시 비밀번호" : "지금 비밀번호"}
          value={current}
          onChangeText={(v) => {
            setCurrent(v);
            errors.clear("currentPassword");
          }}
          secure
          autoComplete="current-password"
          maxLength={256}
          error={errors.fields.currentPassword}
          testID="current-password"
        />
      </ErrorScroll>
      <ErrorScroll field="newPassword" {...errors}>
        <Input
          label="새 비밀번호"
          value={next}
          onChangeText={(v) => {
            setNext(v);
            errors.clear("newPassword");
          }}
          secure
          autoComplete="new-password"
          maxLength={256}
          error={errors.fields.newPassword}
          hint={PASSWORD_RULE}
          testID="new-password"
        />
      </ErrorScroll>
      <ErrorScroll field="confirm" {...errors}>
        <Input
          label="새 비밀번호 확인"
          value={confirm}
          onChangeText={(v) => {
            setConfirm(v);
            errors.clear("confirm");
          }}
          secure
          autoComplete="new-password"
          maxLength={256}
          error={errors.fields.confirm}
          testID="confirm-password"
        />
      </ErrorScroll>
      {failed ? (
        <View accessibilityRole="alert">
          <T variant="sub" color={tokens.color.error}>
            {failed}
          </T>
        </View>
      ) : null}
      <T variant="caption" muted>
        바꾸면 다른 기기의 로그인은 모두 풀려요.
      </T>
      <Button label="비밀번호 바꾸기" size={size} loading={busy} onPress={() => void submit()} />
    </View>
  );
}
