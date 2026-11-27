// 앱 멈춤(ANR) 감지(DEV-496). react-native·PostHog에 의존하지 않는 순수 로직이라 scripts/test-analytics.mjs가 직접 읽는다.
// 1초마다 도는 타이머가 예정보다 얼마나 늦게 돌았는지로 JS 스레드가 멈춘 시간을 잰다.
// Android ANR 기준(입력에 5초 응답 없음)에 맞춰 5초 이상 멈추면 한 번 보고한다.
// 한계: UI(네이티브) 스레드만 멈춘 경우와 OS의 ANR 대화상자 자체는 잡지 못한다.

/** 타이머 간격(ms) */
export const ANR_TICK_MS = 1000;
/** 이만큼 이상 멈추면 보고한다(ms). Android ANR 기준 */
export const ANR_THRESHOLD_MS = 5000;

export type StallDetector = {
  /** 타이머가 돌 때 부른다. 멈춤이 기준 이상이면 멈춘 시간(ms), 아니면 null */
  tick(now: number): number | null;
  /** 앱이 다시 앞으로 왔을 때 부른다. 백그라운드에 있던 시간은 멈춤으로 세지 않는다 */
  reset(now: number): void;
};

export function createStallDetector(
  start: number,
  tickMs: number = ANR_TICK_MS,
  thresholdMs: number = ANR_THRESHOLD_MS,
): StallDetector {
  let last = start;
  return {
    tick(now) {
      const blocked = now - last - tickMs;
      last = now;
      return blocked >= thresholdMs ? Math.round(blocked) : null;
    },
    reset(now) {
      last = now;
    },
  };
}
