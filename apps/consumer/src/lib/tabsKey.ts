/**
 * 탭 레이아웃 key(DEV-481). 계정이 바뀌면 탭 아래 화면 상태(열어 둔 하위 화면·시트)를 버리려고 key를 바꾼다.
 *
 * 전에는 key가 `user?.userId ?? "guest"`라, 로그인한 채 앱을 다시 열면 저장된 토큰으로 `GET /api/auth/me`를
 * 다시 읽는 동안 "guest"였다가 답이 오는 순간 사용자 ID로 바뀌어 탭을 통째로 다시 만들었다. 그 사이에 누른 동작
 * (옵션 시트 열기, 탭 안 화면으로 이동)이 사라졌다. 계정은 그대로인데 확인만 늦게 끝난 것이다.
 *
 * 그래서 key는 답(auth/me)이 아니라 인증 이벤트(onAuthChange: 로그인·로그아웃·토큰 교체·401로 토큰 삭제)에서만 바뀐다.
 * - 토큰이 새로 생기거나 바뀌면 다른 계정일 수 있으니 새로 만든다.
 * - 토큰이 지워지면, 이번 토큰으로 사용자를 한 번이라도 확인했을 때만 새로 만든다. 확인 전에 지워진 것
 *   (만료된 토큰으로 연 첫 실행)은 전 key(`"guest"`)에서도 탭을 다시 만들지 않던 경우다.
 * - 같은 토큰의 auth/me 답(첫 확인, 일시적인 실패 뒤 다시 확인)은 key를 바꾸지 않는다.
 */
export class TabsKey {
  private confirmed = false;
  private current = 0;

  get key(): number {
    return this.current;
  }

  /** 지금 토큰의 auth/me가 사용자를 돌려줬다 */
  confirm(): void {
    this.confirmed = true;
  }

  /** 인증 이벤트 뒤 지금 토큰으로 부른다. 탭을 새로 만들어야 하면 key가 바뀐다 */
  authChanged(token: string | null): number {
    if (token !== null || this.confirmed) this.current += 1;
    this.confirmed = false;
    return this.current;
  }
}
