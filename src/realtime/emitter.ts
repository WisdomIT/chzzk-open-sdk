/**
 * 브라우저/Node 공용 초경량 타입 세이프 이벤트 에미터.
 * (Node의 events 모듈 의존을 피해 런타임 중립 유지)
 */
type AnyListener = (...args: unknown[]) => void;

export class TypedEmitter<Events extends Record<string, unknown[]>> {
  private readonly listeners = new Map<keyof Events, Set<AnyListener>>();

  on<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as unknown as AnyListener);
    return () => this.off(event, listener);
  }

  off<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): void {
    this.listeners.get(event)?.delete(listener as unknown as AnyListener);
  }

  protected emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    const set = this.listeners.get(event);
    if (set === undefined) return;
    for (const listener of [...set]) {
      // 한 리스너의 예외가 다른 리스너/전송 루프를 중단시키지 않도록 격리
      try {
        listener(...args);
      } catch {
        // 소비자 예외는 무시 (소비자별 격리 — 상세 정책은 Consumers 계층 #17)
      }
    }
  }
}
