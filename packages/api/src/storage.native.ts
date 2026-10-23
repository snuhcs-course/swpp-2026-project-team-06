// 앱별 저장소(iOS·Android). 토큰 등 작은 값은 expo-secure-store(키체인·Keystore)에 두고,
// 2KB를 넘는 값(Mock DB 등 웹 전용)은 메모리에만 둔다(DEV-33). 동기 API라 웹의 localStorage와 같은 계약을 지킨다.
import * as SecureStore from "expo-secure-store";

/** Android SecureStore 값 한도(2048바이트)보다 조금 작게 */
const SECURE_MAX_LENGTH = 2000;
const memory = new Map<string, string>();

/** SecureStore 키는 영문·숫자·`.`·`-`·`_`만 된다. 이름공간 구분자 `:`를 `.`로 */
const secureKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, ".");

export function storageGet(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return SecureStore.getItem(secureKey(key));
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string | null): void {
  if (value === null) {
    memory.delete(key);
    void SecureStore.deleteItemAsync(secureKey(key)).catch(() => {});
    return;
  }
  if (value.length > SECURE_MAX_LENGTH) {
    memory.set(key, value);
    return;
  }
  memory.delete(key);
  try {
    SecureStore.setItem(secureKey(key), value);
  } catch {
    // 저장하지 못하면 이번 실행 동안만 기억한다
    memory.set(key, value);
  }
}
