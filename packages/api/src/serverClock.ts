// 서버 시각(DEV-229). 서버는 모든 응답에 X-Server-Time(ISO 8601, FIXED_NOW 반영)을 붙인다.
// 받을 때 "서버 시각 − 기기 시각" 차이를 기억해 두고, 화면은 기한·날짜 판단에 serverNow()를 쓴다.
// 헤더가 없는 응답(브라우저 Mock·공유 Mock·옛 서버)은 차이를 바꾸지 않는다. 처음 값 0 = 기기 시계.
// 의존 없는 파일로 둬 node Mock 테스트가 바로 읽는다.

export const SERVER_TIME_HEADER = "X-Server-Time";

let offsetMs = 0;

/** 응답의 X-Server-Time 값을 기록한다. 받은 순간의 기기 시각(receivedAt)과의 차이를 보관한다 */
export function recordServerTime(
  value: string | null | undefined,
  receivedAt: number = Date.now(),
) {
  if (!value) return;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return;
  offsetMs = t - receivedAt;
}

/** 지금 서버 시각(ms). 기한 지남·'오늘·어제'는 기기 시계 대신 이것으로 판단한다 */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

/** 테스트 전용: 차이를 0으로 */
export function resetServerClock() {
  offsetMs = 0;
}
