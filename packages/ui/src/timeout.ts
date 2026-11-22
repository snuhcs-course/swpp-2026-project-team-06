// 시간 제한(DEV-378). react-native 없이 node 테스트가 바로 불러오게 따로 둔다.

/** 로그인 화면의 카카오 설정 조회 시간 제한(DEV-378). 넘으면 "설정 못 읽음"과 같게(아이디 칸을 펼친 채) 그린다.
 *  공용 fetch에는 시간 제한이 없어 응답이 멈추면 카카오 버튼도 아이디 칸도 없는 화면이 남기 때문이다 */
export const LOGIN_CONFIG_TIMEOUT_MS = 5000;

/** promise가 ms 안에 끝나지 않으면 실패로 끝낸다(늦게 온 응답은 버린다) */
export function withTimeout<T>(promise: Promise<T>, ms = LOGIN_CONFIG_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
