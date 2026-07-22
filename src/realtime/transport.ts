import { ChzzkError } from '../errors.js';
import { noopLogger, type ChzzkLogger } from '../http/logger.js';
import type { SessionResource } from '../resources/session.js';
import type { SessionEventType } from '../types/session.js';
import { connectEngineSocket, type EngineSocket, type EngineSocketOptions } from './engine.js';
import { TypedEmitter } from './emitter.js';
import { parseSocketIoEvent } from './packets.js';

/**
 * 세션이 전달한 원시 이벤트. `body`는 서버가 보낸 JSON "문자열" 그대로이며
 * 파싱/정규화는 Normalize 계층(#16)의 책임이다.
 */
export interface RawSessionEvent {
  /** 'SYSTEM' | 'CHAT' | 'DONATION' | 'SUBSCRIPTION' (+미래 이벤트) */
  name: string;
  body: string;
}

export interface SystemEventData {
  eventType: string;
  channelId: string;
}

type TransportEvents = {
  /** 모든 원시 이벤트 (SYSTEM 포함) — Normalize 계층이 이걸 소비한다 */
  raw: [RawSessionEvent];
  /** SYSTEM(connected) — sessionKey 수신 */
  connected: [string];
  subscribed: [SystemEventData];
  unsubscribed: [SystemEventData];
  /** 동의 철회/스코프 변경 등으로 서버가 구독을 회수 */
  revoked: [SystemEventData];
  disconnected: [string];
  /** 자동 복구 시도 (attempt, delayMs) */
  reconnecting: [number, number];
  error: [unknown];
};

export interface SessionTransportReconnectOptions {
  /** 기본 true */
  enabled?: boolean;
  /** 재연결 시도 상한. 기본 무제한 */
  maxAttempts?: number;
  /** 기본 1000 */
  baseDelayMs?: number;
  /** 기본 30000 */
  maxDelayMs?: number;
}

export interface SessionTransportOptions {
  sessions: SessionResource;
  /**
   * 세션 인증 방식.
   * - 'client': 클라이언트 인증 세션 (최대 10연결). 유저 토큰으로 구독하는
   *   교차 조합이 동작함을 실측 확인 (api-notes #35)
   * - 'user': 유저 인증 세션 (유저당 최대 3연결)
   */
  auth: 'client' | 'user';
  /** 연결(및 재연결) 시 자동 구독할 이벤트. 세션당 최대 30개 구독 제한 참고. */
  subscriptions?: readonly SessionEventType[];
  logger?: ChzzkLogger;
  reconnect?: SessionTransportReconnectOptions;
  preferWebSocket?: boolean;
  fetchFn?: typeof globalThis.fetch;
  /** SYSTEM(connected) 대기 타임아웃(ms). 기본 10000 */
  connectedTimeoutMs?: number;
  /** 테스트/고급: 엔진 소켓 팩토리 주입 */
  engineFactory?: (options: EngineSocketOptions) => Promise<EngineSocket>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Transport 계층 — 단일 업스트림 연결의 수명 관리.
 *
 * 공식 세션 API로 URL을 발급받아 연결하고, `SYSTEM(connected)`의
 * sessionKey에 "반응해" 구독을 호출한다 (고정 지연 없음 — wizbot의
 * setTimeout(1000) 방식 대체). 연결이 끊기면 새 세션 URL 재발급 →
 * 재연결 → 재구독을 자동 복구한다 (sessionKey는 세션마다 새로 발급됨).
 *
 * 원시 이벤트는 파싱 없이 `raw`로 그대로 전달한다 — 정규화는 #16,
 * 팬아웃은 #17의 책임. SYSTEM 메시지만 수명 관리 목적으로 내부 해석한다.
 */
export class SessionTransport extends TypedEmitter<TransportEvents> {
  private readonly options: SessionTransportOptions;
  private readonly logger: ChzzkLogger;
  private readonly subscriptions: Set<SessionEventType>;
  private readonly reconnect: Required<SessionTransportReconnectOptions>;

  private state: 'idle' | 'running' | 'closed' = 'idle';
  private engine: EngineSocket | null = null;
  private currentSessionKey: string | null = null;
  private pendingConnected: {
    resolve: (sessionKey: string) => void;
    reject: (error: Error) => void;
  } | null = null;

  constructor(options: SessionTransportOptions) {
    super();
    this.options = options;
    this.logger = options.logger ?? noopLogger;
    this.subscriptions = new Set(options.subscriptions ?? []);
    this.reconnect = {
      enabled: options.reconnect?.enabled ?? true,
      maxAttempts: options.reconnect?.maxAttempts ?? Number.POSITIVE_INFINITY,
      baseDelayMs: options.reconnect?.baseDelayMs ?? 1000,
      maxDelayMs: options.reconnect?.maxDelayMs ?? 30000,
    };
  }

  /** 현재 세션 식별자 (연결 전/끊김 상태면 null). 재연결 시 값이 바뀐다. */
  get sessionKey(): string | null {
    return this.currentSessionKey;
  }

  /**
   * 연결 시작. 최초 연결+구독까지 완료되면 resolve한다.
   * 최초 시도 실패는 그대로 throw (설정 오류를 감추지 않기 위해 재시도하지
   * 않는다). 성공 이후의 끊김은 자동 복구된다.
   */
  async start(): Promise<void> {
    if (this.state !== 'idle') {
      throw new ChzzkError(`SessionTransport cannot start from state "${this.state}"`);
    }
    this.state = 'running';
    try {
      await this.connectOnce();
    } catch (error) {
      this.state = 'idle';
      throw error;
    }
  }

  /** 정상 종료. 자동 복구를 멈추고 소켓을 닫는다. */
  close(): void {
    if (this.state === 'closed') {
      return;
    }
    this.state = 'closed';
    this.engine?.close();
    this.engine = null;
    this.currentSessionKey = null;
  }

  /**
   * 이벤트 구독 추가. 연결 중이면 즉시 REST 호출하고,
   * 이후 재연결 시에도 자동으로 다시 구독된다.
   */
  async subscribe(eventType: SessionEventType): Promise<void> {
    this.subscriptions.add(eventType);
    if (this.currentSessionKey !== null) {
      await this.options.sessions.subscribe(eventType, this.currentSessionKey);
    }
  }

  /** 이벤트 구독 해지. 재연결 시 자동 구독 목록에서도 제거된다. */
  async unsubscribe(eventType: SessionEventType): Promise<void> {
    this.subscriptions.delete(eventType);
    if (this.currentSessionKey !== null) {
      await this.options.sessions.unsubscribe(eventType, this.currentSessionKey);
    }
  }

  private async issueSessionUrl(): Promise<string> {
    return this.options.auth === 'client'
      ? this.options.sessions.createClientSessionUrl()
      : this.options.sessions.createUserSessionUrl();
  }

  /** 1회 연결 시도: URL 발급 → 연결 → connected 대기 → 구독 */
  private async connectOnce(): Promise<void> {
    const sessionUrl = await this.issueSessionUrl();

    const connectedPromise = new Promise<string>((resolve, reject) => {
      this.pendingConnected = { resolve, reject };
    });

    const engineFactory = this.options.engineFactory ?? connectEngineSocket;
    const engineOptions: EngineSocketOptions = {
      sessionUrl,
      handlers: {
        onMessage: (packet) => this.handleSocketIoPacket(packet),
        onClose: (reason, cause) => this.handleEngineClose(reason, cause),
      },
      logger: this.logger,
    };
    if (this.options.fetchFn !== undefined) engineOptions.fetchFn = this.options.fetchFn;
    if (this.options.preferWebSocket !== undefined) {
      engineOptions.preferWebSocket = this.options.preferWebSocket;
    }
    this.engine = await engineFactory(engineOptions);

    const timeoutMs = this.options.connectedTimeoutMs ?? 10000;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      const sessionKey = await Promise.race([
        connectedPromise,
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new ChzzkError(`SYSTEM(connected) not received within ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);
      this.currentSessionKey = sessionKey;
    } catch (error) {
      this.engine?.close();
      this.engine = null;
      throw error;
    } finally {
      this.pendingConnected = null;
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }

    // connected에 "반응해" 구독 (실패 시 이 연결 시도 자체를 실패 처리 → 재시도 경로)
    for (const eventType of this.subscriptions) {
      try {
        await this.options.sessions.subscribe(eventType, this.currentSessionKey);
      } catch (error) {
        this.engine?.close();
        this.engine = null;
        this.currentSessionKey = null;
        throw error;
      }
    }
  }

  private handleSocketIoPacket(packet: string): void {
    const event = parseSocketIoEvent(packet);
    if (event === null) {
      return; // "0"(네임스페이스 연결) 등 비이벤트 패킷
    }

    this.emitRaw({ name: event.name, body: event.body });

    if (event.name !== 'SYSTEM') {
      return;
    }
    let system: { type?: unknown; data?: unknown };
    try {
      system = JSON.parse(event.body) as { type?: unknown; data?: unknown };
    } catch {
      this.logger.warn('chzzk-open-sdk realtime received unparsable SYSTEM message');
      return;
    }
    const data = (system.data ?? {}) as Record<string, unknown>;
    switch (system.type) {
      case 'connected': {
        const sessionKey = typeof data.sessionKey === 'string' ? data.sessionKey : null;
        if (sessionKey !== null) {
          this.pendingConnected?.resolve(sessionKey);
          this.emit('connected', sessionKey);
        }
        break;
      }
      case 'subscribed':
        this.emit('subscribed', toSystemEventData(data));
        break;
      case 'unsubscribed':
        this.emit('unsubscribed', toSystemEventData(data));
        break;
      case 'revoked':
        this.emit('revoked', toSystemEventData(data));
        break;
      default:
        this.logger.debug(`chzzk-open-sdk realtime unknown SYSTEM type: ${String(system.type)}`);
    }
  }

  private handleEngineClose(reason: string, cause?: unknown): void {
    this.engine = null;
    this.currentSessionKey = null;
    this.pendingConnected?.reject(new ChzzkError(`connection closed: ${reason}`));
    this.emit('disconnected', reason);
    if (cause !== undefined) {
      this.emit('error', cause);
    }
    if (this.state === 'running' && this.reconnect.enabled) {
      void this.runReconnectLoop();
    }
  }

  private async runReconnectLoop(): Promise<void> {
    for (let attempt = 1; attempt <= this.reconnect.maxAttempts; attempt += 1) {
      const delayMs = Math.min(
        this.reconnect.baseDelayMs * 2 ** (attempt - 1),
        this.reconnect.maxDelayMs,
      );
      this.emit('reconnecting', attempt, delayMs);
      await sleep(delayMs);
      if (this.state !== 'running') {
        return;
      }
      try {
        await this.connectOnce(); // 새 세션 URL + 새 sessionKey + 재구독
        this.logger.info(`chzzk-open-sdk realtime reconnected (attempt ${attempt})`);
        return;
      } catch (error) {
        this.emit('error', error);
      }
    }
    // 시도 상한 도달 — 더 이상 복구하지 않음
    this.state = 'closed';
    this.emit('disconnected', 'reconnect attempts exhausted');
  }

  private emitRaw(event: RawSessionEvent): void {
    this.emit('raw', event);
  }
}

function toSystemEventData(data: Record<string, unknown>): SystemEventData {
  return {
    eventType: typeof data.eventType === 'string' ? data.eventType : '',
    channelId: typeof data.channelId === 'string' ? data.channelId : '',
  };
}
