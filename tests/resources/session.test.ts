import { describe, expect, it, vi } from 'vitest';
import { ChzzkOpenClient } from '../../src/client.js';
import { ChzzkValidationError } from '../../src/errors.js';
import type { ChzzkTokenSet } from '../../src/auth/types.js';

function freshTokens(): ChzzkTokenSet {
  return {
    accessToken: 'access-0',
    refreshToken: 'refresh-0',
    tokenType: 'Bearer',
    expiresIn: 86400,
    obtainedAt: Date.now(),
  };
}

function successEnvelope(content: unknown): Response {
  return new Response(JSON.stringify({ code: 200, message: null, content }), { status: 200 });
}

async function makeClient(fetchMock: typeof globalThis.fetch): Promise<ChzzkOpenClient> {
  const client = new ChzzkOpenClient({
    clientId: 'cid',
    clientSecret: 'csecret',
    fetch: fetchMock,
  });
  await client.auth.setTokens(freshTokens());
  return client;
}

describe('SessionResource session creation', () => {
  it('creates a client session URL with Client auth headers', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(successEnvelope({ url: 'https://ssio10.nchat.naver.com:443?auth=T' }));
    const client = await makeClient(fetchMock);

    const url = await client.sessions.createClientSessionUrl();

    const [reqUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(reqUrl).toBe('https://openapi.chzzk.naver.com/open/v1/sessions/auth/client');
    expect((init.headers as Record<string, string>)['Client-Id']).toBe('cid');
    expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
    expect(url).toContain('nchat.naver.com');
  });

  it('creates a user session URL with a Bearer token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(successEnvelope({ url: 'https://ssio10.nchat.naver.com:443?auth=T' }));
    const client = await makeClient(fetchMock);

    await client.sessions.createUserSessionUrl();

    const [reqUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(reqUrl).toBe('https://openapi.chzzk.naver.com/open/v1/sessions/auth');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer access-0');
  });
});

describe('SessionResource session lists', () => {
  const sessionContent = {
    data: [
      {
        sessionKey: 'sk-1',
        connectedDate: '2026-07-22 22:44:39',
        subscribedEvents: [{ eventType: 'CHAT', channelId: 'ch-1' }],
      },
      {
        sessionKey: 'sk-2',
        connectedDate: '2026-07-22 22:44:01',
        disconnectedDate: '2026-07-22 22:45:26',
        subscribedEvents: [],
      },
    ],
    page: 0,
    totalCount: 2,
    totalPages: 1,
  };

  it('lists client sessions with Client auth and parses undocumented meta', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successEnvelope(sessionContent));
    const client = await makeClient(fetchMock);

    const result = await client.sessions.listClientSessions({ size: 5, page: 0 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openapi.chzzk.naver.com/open/v1/sessions/client?size=5&page=0');
    expect((init.headers as Record<string, string>)['Client-Id']).toBe('cid');
    expect(result.totalCount).toBe(2);
    // 연결 중 세션엔 disconnectedDate 없음 (실측 — api-notes #4)
    expect(result.data[0]?.disconnectedDate).toBeUndefined();
    expect(result.data[1]?.disconnectedDate).toBe('2026-07-22 22:45:26');
  });

  it('lists user sessions with a Bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successEnvelope(sessionContent));
    const client = await makeClient(fetchMock);

    await client.sessions.listUserSessions();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openapi.chzzk.naver.com/open/v1/sessions');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer access-0');
  });

  it('rejects size outside 1~50 before any request', async () => {
    const fetchMock = vi.fn();
    const client = await makeClient(fetchMock);

    await expect(client.sessions.listUserSessions({ size: 51 })).rejects.toBeInstanceOf(
      ChzzkValidationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('SessionResource subscribe/unsubscribe', () => {
  it.each(['chat', 'donation', 'subscription'] as const)(
    'POSTs subscribe/%s with sessionKey as a query param and a Bearer token',
    async (eventType) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
      const client = await makeClient(fetchMock);

      await client.sessions.subscribe(eventType, 'sk-1');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `https://openapi.chzzk.naver.com/open/v1/sessions/events/subscribe/${eventType}?sessionKey=sk-1`,
      );
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer access-0');
      expect(init.body).toBeUndefined();
    },
  );

  it('POSTs unsubscribe with sessionKey as a query param', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const client = await makeClient(fetchMock);

    await client.sessions.unsubscribe('donation', 'sk-1');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      'https://openapi.chzzk.naver.com/open/v1/sessions/events/unsubscribe/donation?sessionKey=sk-1',
    );
  });

  it('rejects an empty sessionKey before any request', async () => {
    const fetchMock = vi.fn();
    const client = await makeClient(fetchMock);

    await expect(client.sessions.subscribe('chat', '')).rejects.toBeInstanceOf(
      ChzzkValidationError,
    );
    await expect(client.sessions.unsubscribe('chat', '')).rejects.toBeInstanceOf(
      ChzzkValidationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
