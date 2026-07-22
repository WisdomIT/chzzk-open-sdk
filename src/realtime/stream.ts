import { noopLogger, type ChzzkLogger } from '../http/logger.js';
import type { SessionEventType } from '../types/session.js';
import type {
  ChatMessage,
  Donation,
  NormalizedEvent,
  SubscriptionEvent,
  SystemEvent,
} from '../types/events.js';
import { TypedEmitter } from './emitter.js';
import { normalizeSessionEvent } from './normalize.js';
import type { SessionTransport, SystemEventData } from './transport.js';

type RealtimeEvents = {
  /** 모든 정규화 이벤트 (unknown 포함) */
  event: [NormalizedEvent];
  chat: [ChatMessage];
  donation: [Donation];
  subscription: [SubscriptionEvent];
  system: [SystemEvent];
  unknown: [{ eventName: string; body: string }];
  // Transport 수명 이벤트 패스스루
  connected: [string];
  subscribed: [SystemEventData];
  unsubscribed: [SystemEventData];
  revoked: [SystemEventData];
  disconnected: [string];
  reconnecting: [number, number];
  error: [unknown];
};

export interface RealtimeIteratorOptions {
  /**
   * 소비자별 버퍼 상한. 기본 1000.
   * 소비자가 이 개수 이상 밀리면 **가장 오래된 이벤트부터 버린다**
   * (drop-oldest) — 실시간 스트림에서는 최신 이벤트가 더 가치 있다는 정책.
   * 유실 시 최초 1회 경고 로그를 남기고, 유실 개수는 내부 집계된다.
   */
  bufferLimit?: number;
  /** 중단 시그널 — abort 시 해당 소비자만 종료된다 */
  signal?: AbortSignal;
}

interface QueueConsumer<T> {
  queue: T[];
  limit: number;
  pull: ((result: IteratorResult<T>) => void) | null;
  done: boolean;
  dropped: number;
}

/**
 * Consumers 계층 — 정규화 이벤트의 읽기 전용 팬아웃.
 *
 * 단일 업스트림(SessionTransport) 위에 여러 독립 다운스트림이 붙는다:
 * - 이벤트 에미터: `on('chat', ...)` 등 — 리스너 예외는 서로 격리
 * - AsyncIterable: `for await (const e of realtime.events())` —
 *   소비자마다 독립 버퍼를 가져 하나가 느려도 다른 소비자·연결에 영향 없음
 *
 * SDK의 책임은 여기까지다. 필터링·명령 파싱·모더레이션 판단 같은 가공은
 * 소비자가 스트림 위에서 직접 한다 (examples/ 참고) — 가로채기 계층 없음.
 */
export class ChzzkRealtime extends TypedEmitter<RealtimeEvents> {
  private readonly transport: SessionTransport;
  private readonly logger: ChzzkLogger;
  private readonly consumers = new Set<QueueConsumer<NormalizedEvent>>();
  private closed = false;

  constructor(options: { transport: SessionTransport; logger?: ChzzkLogger }) {
    super();
    this.transport = options.transport;
    this.logger = options.logger ?? noopLogger;

    this.transport.on('raw', (raw) => {
      const normalized = normalizeSessionEvent(raw, this.logger);
      this.dispatch(normalized);
    });
    this.transport.on('connected', (sessionKey) => this.emit('connected', sessionKey));
    this.transport.on('subscribed', (data) => this.emit('subscribed', data));
    this.transport.on('unsubscribed', (data) => this.emit('unsubscribed', data));
    this.transport.on('revoked', (data) => this.emit('revoked', data));
    this.transport.on('reconnecting', (attempt, delayMs) =>
      this.emit('reconnecting', attempt, delayMs),
    );
    this.transport.on('error', (error) => this.emit('error', error));
    this.transport.on('disconnected', (reason) => {
      this.emit('disconnected', reason);
      // 자동 복구가 계속되는 동안 스트림은 열려 있다.
      // 복구가 포기된 경우(close/시도 소진)에만 소비자를 종료한다.
      if (this.transport.status === 'closed') {
        this.endConsumers();
      }
    });
  }

  /** 하부 Transport (고급 사용 — sessionKey, 동적 구독 등) */
  get session(): SessionTransport {
    return this.transport;
  }

  /** 연결 시작 (최초 연결+구독 완료까지 대기) */
  async start(): Promise<void> {
    await this.transport.start();
  }

  /** 정상 종료 — 연결을 닫고 모든 AsyncIterable 소비자를 종료한다 */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.transport.close();
    this.endConsumers();
  }

  /** 이벤트 구독 추가 (연결 중 즉시 반영 + 재연결 시 자동 재구독) */
  subscribe(eventType: SessionEventType): Promise<void> {
    return this.transport.subscribe(eventType);
  }

  /** 이벤트 구독 해지 */
  unsubscribe(eventType: SessionEventType): Promise<void> {
    return this.transport.unsubscribe(eventType);
  }

  /**
   * 모든 정규화 이벤트의 AsyncIterable.
   * 소비자마다 독립 버퍼 — 추가/제거가 연결이나 다른 소비자에 영향을 주지 않는다.
   */
  events(options: RealtimeIteratorOptions = {}): AsyncIterableIterator<NormalizedEvent> {
    const consumer: QueueConsumer<NormalizedEvent> = {
      queue: [],
      limit: options.bufferLimit ?? 1000,
      pull: null,
      done: false,
      dropped: 0,
    };
    this.consumers.add(consumer);

    const finish = (): void => {
      consumer.done = true;
      this.consumers.delete(consumer);
      consumer.pull?.({ value: undefined, done: true });
      consumer.pull = null;
    };

    if (options.signal !== undefined) {
      if (options.signal.aborted) {
        finish();
      } else {
        options.signal.addEventListener('abort', finish, { once: true });
      }
    }

    const iterator: AsyncIterableIterator<NormalizedEvent> = {
      [Symbol.asyncIterator]() {
        return this;
      },
      next: (): Promise<IteratorResult<NormalizedEvent>> => {
        if (consumer.queue.length > 0) {
          return Promise.resolve({ value: consumer.queue.shift() as NormalizedEvent, done: false });
        }
        if (consumer.done || this.closed) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve) => {
          consumer.pull = resolve;
        });
      },
      return: (): Promise<IteratorResult<NormalizedEvent>> => {
        finish();
        return Promise.resolve({ value: undefined, done: true });
      },
      throw: (error?: unknown): Promise<IteratorResult<NormalizedEvent>> => {
        finish();
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      },
    };
    return iterator;
  }

  /** 채팅만 골라낸 AsyncIterable (편의 헬퍼 — 가공이 아닌 타입 필터) */
  async *chats(options: RealtimeIteratorOptions = {}): AsyncIterableIterator<ChatMessage> {
    for await (const event of this.events(options)) {
      if (event.type === 'chat') yield event.chat;
    }
  }

  /** 후원만 골라낸 AsyncIterable */
  async *donations(options: RealtimeIteratorOptions = {}): AsyncIterableIterator<Donation> {
    for await (const event of this.events(options)) {
      if (event.type === 'donation') yield event.donation;
    }
  }

  /** 구독(멤버십)만 골라낸 AsyncIterable */
  async *subscriptions(
    options: RealtimeIteratorOptions = {},
  ): AsyncIterableIterator<SubscriptionEvent> {
    for await (const event of this.events(options)) {
      if (event.type === 'subscription') yield event.subscription;
    }
  }

  private dispatch(event: NormalizedEvent): void {
    // 1) 에미터 팬아웃 (리스너 예외는 TypedEmitter가 격리)
    this.emit('event', event);
    switch (event.type) {
      case 'chat':
        this.emit('chat', event.chat);
        break;
      case 'donation':
        this.emit('donation', event.donation);
        break;
      case 'subscription':
        this.emit('subscription', event.subscription);
        break;
      case 'system':
        this.emit('system', event.system);
        break;
      case 'unknown':
        this.emit('unknown', { eventName: event.eventName, body: event.body });
        break;
    }

    // 2) AsyncIterable 소비자별 큐 팬아웃
    for (const consumer of this.consumers) {
      if (consumer.done) continue;
      if (consumer.pull !== null) {
        const resolve = consumer.pull;
        consumer.pull = null;
        resolve({ value: event, done: false });
        continue;
      }
      consumer.queue.push(event);
      if (consumer.queue.length > consumer.limit) {
        consumer.queue.shift(); // drop-oldest
        consumer.dropped += 1;
        if (consumer.dropped === 1) {
          this.logger.warn(
            `chzzk-open-sdk realtime consumer buffer overflow (limit ${consumer.limit}); dropping oldest events`,
          );
        }
      }
    }
  }

  private endConsumers(): void {
    for (const consumer of [...this.consumers]) {
      consumer.done = true;
      this.consumers.delete(consumer);
      consumer.pull?.({ value: undefined, done: true });
      consumer.pull = null;
    }
  }
}
