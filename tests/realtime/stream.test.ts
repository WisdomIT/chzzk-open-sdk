import { describe, expect, it, vi } from 'vitest';
import type { ChzzkLogger } from '../../src/http/logger.js';
import type { SessionResource } from '../../src/resources/session.js';
import type { EngineSocketOptions } from '../../src/realtime/engine.js';
import { ChzzkRealtime } from '../../src/realtime/stream.js';
import { SessionTransport } from '../../src/realtime/transport.js';
import type { ChatMessage, NormalizedEvent } from '../../src/types/events.js';

class FakeEngine {
  closed = false;
  constructor(readonly options: EngineSocketOptions) {}
  push(packet: string): void {
    this.options.handlers.onMessage(packet);
  }
  pushSystem(type: string, data: Record<string, unknown>): void {
    this.push(`2["SYSTEM",${JSON.stringify(JSON.stringify({ type, data }))}]`);
  }
  pushChat(content: string): void {
    const payload = {
      channelId: 'ch',
      senderChannelId: 'sender',
      chatChannelId: 'cc',
      profile: { nickname: 'nick', badges: [], verifiedMark: false, userRoleCode: 'common_user' },
      content,
      emojis: {},
      messageTime: 1,
    };
    this.push(`2["CHAT",${JSON.stringify(JSON.stringify(payload))}]`);
  }
  dropFromServer(reason = 'server dropped'): void {
    this.options.handlers.onClose(reason);
  }
  close(): void {
    this.closed = true;
  }
  readonly transport = 'polling' as const;
}

interface Harness {
  realtime: ChzzkRealtime;
  engines: FakeEngine[];
  warn: ReturnType<typeof vi.fn>;
}

async function makeStarted(options: { bufferLimitTest?: boolean } = {}): Promise<Harness> {
  void options;
  const engines: FakeEngine[] = [];
  const warn = vi.fn();
  const logger: ChzzkLogger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() };
  const sessions = {
    createUserSessionUrl: vi.fn().mockResolvedValue('https://ssio1.nchat.naver.com?auth=A'),
    createClientSessionUrl: vi.fn().mockResolvedValue('https://ssio1.nchat.naver.com?auth=A'),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
  };
  const transport = new SessionTransport({
    sessions: sessions as unknown as SessionResource,
    auth: 'user',
    subscriptions: ['chat'],
    reconnect: { enabled: false },
    engineFactory: (engineOptions) => {
      const engine = new FakeEngine(engineOptions);
      engines.push(engine);
      return Promise.resolve(engine);
    },
  });
  const realtime = new ChzzkRealtime({ transport, logger });

  const startPromise = realtime.start();
  await vi.waitFor(() => expect(engines.length).toBe(1));
  engines[0]!.pushSystem('connected', { sessionKey: 'sk-1' });
  await startPromise;
  return { realtime, engines, warn };
}

describe('ChzzkRealtime emitter fanout', () => {
  it('emits typed events and the catch-all event channel', async () => {
    const { realtime, engines } = await makeStarted();
    const chats: ChatMessage[] = [];
    const all: NormalizedEvent[] = [];
    realtime.on('chat', (chat) => chats.push(chat));
    realtime.on('event', (event) => all.push(event));

    engines[0]!.pushChat('안녕');
    engines[0]!.push(`2["FUTURE",${JSON.stringify(JSON.stringify({ x: 1 }))}]`);

    expect(chats).toHaveLength(1);
    expect(chats[0]?.content).toBe('안녕');
    expect(chats[0]?.userRole).toBe('common_user');
    // connected SYSTEM은 리스너 등록 전(start 중) 발생 — 이후 이벤트만 수신
    expect(all.map((event) => event.type)).toEqual(['chat', 'unknown']);
    realtime.close();
  });

  it('passes through lifecycle events from the transport', async () => {
    const { realtime, engines } = await makeStarted();
    const seen: string[] = [];
    realtime.on('subscribed', (d) => seen.push(`sub:${d.eventType}`));
    realtime.on('disconnected', (reason) => seen.push(`disc:${reason}`));

    engines[0]!.pushSystem('subscribed', { eventType: 'CHAT', channelId: 'ch' });
    engines[0]!.dropFromServer('bye');

    expect(seen).toEqual(['sub:CHAT', 'disc:bye']);
    realtime.close();
  });
});

describe('ChzzkRealtime AsyncIterable fanout', () => {
  it('delivers every event to multiple independent consumers at their own pace', async () => {
    const { realtime, engines } = await makeStarted();

    const fast: string[] = [];
    const slowBuffer: string[] = [];

    const fastDone = (async () => {
      for await (const event of realtime.events()) {
        if (event.type === 'chat') fast.push(event.chat.content);
        if (fast.length === 3) break;
      }
    })();

    // 느린 소비자: 아직 pull하지 않음 (버퍼에 쌓임)
    const slowIterator = realtime.events();

    engines[0]!.pushChat('m1');
    engines[0]!.pushChat('m2');
    engines[0]!.pushChat('m3');
    await fastDone;
    expect(fast).toEqual(['m1', 'm2', 'm3']);

    // 느린 소비자는 이제서야 소비 — 밀렸던 이벤트가 그대로 남아 있음
    for (let i = 0; i < 4; i += 1) {
      const result: IteratorResult<NormalizedEvent> = await slowIterator.next();
      if (result.done === true) break;
      if (result.value.type === 'chat') slowBuffer.push(result.value.chat.content);
      if (slowBuffer.length === 3) break;
    }
    expect(slowBuffer).toEqual(['m1', 'm2', 'm3']);
    realtime.close();
  });

  it('drops oldest events past bufferLimit with a single warning (slow consumer isolation)', async () => {
    const { realtime, engines, warn } = await makeStarted();

    const slow = realtime.events({ bufferLimit: 2 });
    engines[0]!.pushChat('m1');
    engines[0]!.pushChat('m2');
    engines[0]!.pushChat('m3'); // m1 유실
    engines[0]!.pushChat('m4'); // m2 유실

    const first = await slow.next();
    const second = await slow.next();
    expect(
      [first, second].map((r) => (r.value as NormalizedEvent & { type: 'chat' }).chat.content),
    ).toEqual(['m3', 'm4']);
    expect(warn).toHaveBeenCalledTimes(1);
    realtime.close();
  });

  it('unregisters a consumer when the loop breaks (no leak)', async () => {
    const { realtime, engines } = await makeStarted();

    const iterator = realtime.events();
    engines[0]!.pushChat('m1');
    const first = await iterator.next();
    expect(first.done).toBe(false);
    await iterator.return?.();

    // 이후 이벤트는 이 소비자에게 쌓이지 않고, next는 done
    engines[0]!.pushChat('m2');
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
    realtime.close();
  });

  it('ends all consumers on close()', async () => {
    const { realtime, engines } = await makeStarted();
    void engines;

    const iterator = realtime.events();
    const pending = iterator.next(); // 대기 중인 pull
    realtime.close();

    await expect(pending).resolves.toMatchObject({ done: true });
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
  });

  it('supports AbortSignal per consumer', async () => {
    const { realtime, engines } = await makeStarted();
    void engines;

    const controller = new AbortController();
    const iterator = realtime.events({ signal: controller.signal });
    const pending = iterator.next();
    controller.abort();

    await expect(pending).resolves.toMatchObject({ done: true });
    realtime.close();
  });

  it('chats() yields only chat payloads', async () => {
    const { realtime, engines } = await makeStarted();

    const collected: string[] = [];
    const done = (async () => {
      for await (const chat of realtime.chats()) {
        collected.push(chat.content);
        if (collected.length === 2) break;
      }
    })();

    engines[0]!.pushSystem('subscribed', { eventType: 'CHAT', channelId: 'ch' });
    engines[0]!.pushChat('only1');
    engines[0]!.pushChat('only2');
    await done;

    expect(collected).toEqual(['only1', 'only2']);
    realtime.close();
  });
});
