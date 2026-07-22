import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionResource } from '../../src/resources/session.js';
import type { EngineSocketOptions } from '../../src/realtime/engine.js';
import { SessionTransport, type RawSessionEvent } from '../../src/realtime/transport.js';

/** 가짜 엔진 소켓 — 테스트가 서버 역할을 수행한다 */
class FakeEngine {
  closed = false;
  constructor(readonly options: EngineSocketOptions) {}

  /** 서버가 socket.io 패킷을 보낸 것처럼 흉내낸다 */
  push(packet: string): void {
    this.options.handlers.onMessage(packet);
  }

  pushSystem(type: string, data: Record<string, unknown>): void {
    this.push(`2["SYSTEM",${JSON.stringify(JSON.stringify({ type, data }))}]`);
  }

  pushEvent(name: string, payload: Record<string, unknown>): void {
    this.push(`2[${JSON.stringify(name)},${JSON.stringify(JSON.stringify(payload))}]`);
  }

  /** 서버측 연결 종료 흉내 */
  dropFromServer(reason = 'server dropped'): void {
    this.options.handlers.onClose(reason);
  }

  close(): void {
    this.closed = true;
  }
  readonly transport = 'polling' as const;
}

interface Harness {
  transport: SessionTransport;
  engines: FakeEngine[];
  sessions: {
    createClientSessionUrl: ReturnType<typeof vi.fn>;
    createUserSessionUrl: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
  };
}

function makeHarness(
  overrides: Partial<ConstructorParameters<typeof SessionTransport>[0]> = {},
): Harness {
  const engines: FakeEngine[] = [];
  const sessions = {
    createClientSessionUrl: vi.fn().mockResolvedValue('https://ssio1.nchat.naver.com?auth=A'),
    createUserSessionUrl: vi.fn().mockResolvedValue('https://ssio2.nchat.naver.com?auth=B'),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
  };
  const transport = new SessionTransport({
    sessions: sessions as unknown as SessionResource,
    auth: 'user',
    subscriptions: ['chat'],
    engineFactory: (options) => {
      const engine = new FakeEngine(options);
      engines.push(engine);
      return Promise.resolve(engine);
    },
    reconnect: { baseDelayMs: 100, maxDelayMs: 1000 },
    ...overrides,
  });
  return { transport, engines, sessions };
}

/** start()와 connected 메시지 전달을 동시에 진행한다 */
async function startConnected(harness: Harness, sessionKey = 'sk-1'): Promise<void> {
  const startPromise = harness.transport.start();
  await vi.waitFor(() => {
    expect(harness.engines.length).toBeGreaterThan(0);
  });
  harness.engines.at(-1)!.pushSystem('connected', { sessionKey });
  await startPromise;
}

describe('SessionTransport.start', () => {
  it('issues a session URL, waits for connected, then subscribes configured events', async () => {
    const harness = makeHarness();

    await startConnected(harness, 'sk-1');

    expect(harness.sessions.createUserSessionUrl).toHaveBeenCalledTimes(1);
    expect(harness.sessions.subscribe).toHaveBeenCalledExactlyOnceWith('chat', 'sk-1');
    expect(harness.transport.sessionKey).toBe('sk-1');
  });

  it('uses the client session endpoint when auth is "client"', async () => {
    const harness = makeHarness({ auth: 'client' });

    await startConnected(harness);

    expect(harness.sessions.createClientSessionUrl).toHaveBeenCalledTimes(1);
    expect(harness.sessions.createUserSessionUrl).not.toHaveBeenCalled();
  });

  it('fails fast when connected is not received in time', async () => {
    vi.useFakeTimers();
    try {
      const harness = makeHarness({ connectedTimeoutMs: 500 });
      const startPromise = harness.transport.start();
      const expectation = expect(startPromise).rejects.toThrow(/SYSTEM\(connected\)/);
      await vi.advanceTimersByTimeAsync(600);
      await expectation;
      expect(harness.engines[0]?.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails start when initial subscribe fails (no silent success)', async () => {
    const harness = makeHarness();
    harness.sessions.subscribe.mockRejectedValueOnce(new Error('scope missing'));

    const startPromise = harness.transport.start();
    await vi.waitFor(() => {
      expect(harness.engines.length).toBe(1);
    });
    harness.engines[0]!.pushSystem('connected', { sessionKey: 'sk-1' });

    await expect(startPromise).rejects.toThrow('scope missing');
    expect(harness.transport.sessionKey).toBeNull();
  });
});

describe('SessionTransport events', () => {
  it('forwards every event as raw without parsing the body', async () => {
    const harness = makeHarness();
    const raws: RawSessionEvent[] = [];
    harness.transport.on('raw', (event) => raws.push(event));

    await startConnected(harness);
    harness.engines[0]!.pushEvent('CHAT', { content: 'hi', messageTime: 1 });
    harness.engines[0]!.pushEvent('FUTURE_EVENT', { anything: true });

    expect(raws.map((r) => r.name)).toEqual(['SYSTEM', 'CHAT', 'FUTURE_EVENT']);
    expect(typeof raws[1]?.body).toBe('string');
    expect(JSON.parse(raws[1]!.body)).toEqual({ content: 'hi', messageTime: 1 });
  });

  it('emits subscribed/unsubscribed/revoked lifecycle events', async () => {
    const harness = makeHarness();
    const seen: string[] = [];
    harness.transport.on('subscribed', (d) => seen.push(`sub:${d.eventType}`));
    harness.transport.on('unsubscribed', (d) => seen.push(`unsub:${d.eventType}`));
    harness.transport.on('revoked', (d) => seen.push(`revoked:${d.eventType}`));

    await startConnected(harness);
    const engine = harness.engines[0]!;
    engine.pushSystem('subscribed', { eventType: 'CHAT', channelId: 'ch' });
    engine.pushSystem('unsubscribed', { eventType: 'CHAT', channelId: 'ch' });
    engine.pushSystem('revoked', { eventType: 'DONATION', channelId: 'ch' });

    expect(seen).toEqual(['sub:CHAT', 'unsub:CHAT', 'revoked:DONATION']);
  });

  it('isolates listener errors from other listeners', async () => {
    const harness = makeHarness();
    const seen: string[] = [];
    harness.transport.on('raw', () => {
      throw new Error('bad consumer');
    });
    harness.transport.on('raw', (event) => seen.push(event.name));

    await startConnected(harness);
    expect(seen).toEqual(['SYSTEM']);
  });
});

describe('SessionTransport reconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-issues a NEW session URL and resubscribes after a drop', async () => {
    const harness = makeHarness();

    const startPromise = harness.transport.start();
    await vi.waitFor(() => expect(harness.engines.length).toBe(1));
    harness.engines[0]!.pushSystem('connected', { sessionKey: 'sk-1' });
    await startPromise;

    const reconnecting = vi.fn();
    harness.transport.on('reconnecting', reconnecting);

    harness.engines[0]!.dropFromServer();
    expect(harness.transport.sessionKey).toBeNull();

    await vi.advanceTimersByTimeAsync(100); // baseDelayMs
    await vi.waitFor(() => expect(harness.engines.length).toBe(2));
    harness.engines[1]!.pushSystem('connected', { sessionKey: 'sk-2' });

    await vi.waitFor(() => {
      expect(harness.transport.sessionKey).toBe('sk-2');
    });
    expect(reconnecting).toHaveBeenCalledWith(1, 100);
    expect(harness.sessions.createUserSessionUrl).toHaveBeenCalledTimes(2);
    expect(harness.sessions.subscribe).toHaveBeenNthCalledWith(2, 'chat', 'sk-2');
  });

  it('backs off exponentially across failed reconnect attempts', async () => {
    const harness = makeHarness();

    const startPromise = harness.transport.start();
    await vi.waitFor(() => expect(harness.engines.length).toBe(1));
    harness.engines[0]!.pushSystem('connected', { sessionKey: 'sk-1' });
    await startPromise;

    // 이후 URL 발급이 계속 실패하도록
    harness.sessions.createUserSessionUrl.mockRejectedValue(new Error('down'));
    const delays: number[] = [];
    harness.transport.on('reconnecting', (_attempt, delayMs) => delays.push(delayMs));

    harness.engines[0]!.dropFromServer();
    await vi.advanceTimersByTimeAsync(100); // attempt 1
    await vi.advanceTimersByTimeAsync(200); // attempt 2
    await vi.advanceTimersByTimeAsync(400); // attempt 3

    expect(delays.slice(0, 3)).toEqual([100, 200, 400]);
  });

  it('does not reconnect after close()', async () => {
    const harness = makeHarness();

    const startPromise = harness.transport.start();
    await vi.waitFor(() => expect(harness.engines.length).toBe(1));
    harness.engines[0]!.pushSystem('connected', { sessionKey: 'sk-1' });
    await startPromise;

    harness.transport.close();
    expect(harness.engines[0]?.closed).toBe(true);

    await vi.advanceTimersByTimeAsync(10000);
    expect(harness.engines.length).toBe(1);
    expect(harness.sessions.createUserSessionUrl).toHaveBeenCalledTimes(1);
  });

  it('stops after maxAttempts and reports exhaustion', async () => {
    const harness = makeHarness({
      reconnect: { baseDelayMs: 100, maxDelayMs: 1000, maxAttempts: 2 },
    });

    const startPromise = harness.transport.start();
    await vi.waitFor(() => expect(harness.engines.length).toBe(1));
    harness.engines[0]!.pushSystem('connected', { sessionKey: 'sk-1' });
    await startPromise;

    harness.sessions.createUserSessionUrl.mockRejectedValue(new Error('down'));
    const disconnected: string[] = [];
    harness.transport.on('disconnected', (reason) => disconnected.push(reason));

    harness.engines[0]!.dropFromServer();
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(1000);

    expect(disconnected).toContain('reconnect attempts exhausted');
    expect(harness.sessions.createUserSessionUrl).toHaveBeenCalledTimes(3); // 최초 1 + 재시도 2
  });
});

describe('SessionTransport dynamic subscriptions', () => {
  it('subscribes immediately when connected and re-subscribes on reconnect', async () => {
    vi.useFakeTimers();
    try {
      const harness = makeHarness();
      const startPromise = harness.transport.start();
      await vi.waitFor(() => expect(harness.engines.length).toBe(1));
      harness.engines[0]!.pushSystem('connected', { sessionKey: 'sk-1' });
      await startPromise;

      await harness.transport.subscribe('donation');
      expect(harness.sessions.subscribe).toHaveBeenCalledWith('donation', 'sk-1');

      harness.engines[0]!.dropFromServer();
      await vi.advanceTimersByTimeAsync(100);
      await vi.waitFor(() => expect(harness.engines.length).toBe(2));
      harness.engines[1]!.pushSystem('connected', { sessionKey: 'sk-2' });

      await vi.waitFor(() => {
        expect(harness.sessions.subscribe).toHaveBeenCalledWith('donation', 'sk-2');
      });
      expect(harness.sessions.subscribe).toHaveBeenCalledWith('chat', 'sk-2');
    } finally {
      vi.useRealTimers();
    }
  });

  it('unsubscribe removes from auto-resubscribe set', async () => {
    const harness = makeHarness();
    await startConnected(harness, 'sk-1');

    await harness.transport.unsubscribe('chat');
    expect(harness.sessions.unsubscribe).toHaveBeenCalledExactlyOnceWith('chat', 'sk-1');
  });
});
