import { describe, expect, it, vi } from 'vitest';
import { ChzzkOpenClient } from '../../src/client.js';
import type { ChzzkLogger } from '../../src/http/logger.js';
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

async function makeClient(
  fetchMock: typeof globalThis.fetch,
  logger?: ChzzkLogger,
): Promise<ChzzkOpenClient> {
  const options: ConstructorParameters<typeof ChzzkOpenClient>[0] = {
    clientId: 'cid',
    clientSecret: 'csecret',
    fetch: fetchMock,
  };
  if (logger !== undefined) options.logger = logger;
  const client = new ChzzkOpenClient(options);
  await client.auth.setTokens(freshTokens());
  return client;
}

describe('ChzzkOpenClient', () => {
  it('exposes an authorization URL builder bound to the clientId', () => {
    const client = new ChzzkOpenClient({ clientId: 'cid', clientSecret: 'sec' });
    expect(client.getAuthorizationUrl({ redirectUri: 'http://localhost/cb', state: 's1' })).toBe(
      'https://chzzk.naver.com/account-interlock?clientId=cid&redirectUri=http%3A%2F%2Flocalhost%2Fcb&state=s1',
    );
  });
});

describe('UserResource.me', () => {
  it('GETs /open/v1/users/me with a Bearer token and returns the parsed content', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        successEnvelope({ channelId: 'ch-1', channelName: '테스트채널', nickname: '테스터' }),
      );
    const client = await makeClient(fetchMock);

    const me = await client.users.me();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openapi.chzzk.naver.com/open/v1/users/me');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer access-0');
    expect(me).toEqual({ channelId: 'ch-1', channelName: '테스트채널', nickname: '테스터' });
  });

  it('preserves undocumented extra fields (loose schema)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      successEnvelope({
        channelId: 'ch-1',
        channelName: 'n',
        nickname: 'nick',
        futureField: 42,
      }),
    );
    const client = await makeClient(fetchMock);

    const me = await client.users.me();
    expect((me as Record<string, unknown>)['futureField']).toBe(42);
  });

  it('warns but does not throw when the response deviates from the schema', async () => {
    const warn = vi.fn();
    const logger: ChzzkLogger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() };
    const fetchMock = vi.fn().mockResolvedValue(successEnvelope({ channelId: 'ch-1' }));
    const client = await makeClient(fetchMock, logger);

    const me = await client.users.me();

    expect(me).toEqual({ channelId: 'ch-1' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('schema mismatch'));
  });

  it('refreshes and retries once on 401', async () => {
    const fetchMock = vi
      .fn()
      // 1차: users/me → 401
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 401, message: 'INVALID_TOKEN' }), { status: 401 }),
      )
      // 2차: 토큰 갱신 성공
      .mockResolvedValueOnce(
        successEnvelope({
          accessToken: 'access-1',
          refreshToken: 'refresh-1',
          tokenType: 'Bearer',
          expiresIn: 86400,
        }),
      )
      // 3차: users/me 재시도 성공
      .mockResolvedValueOnce(
        successEnvelope({ channelId: 'ch-1', channelName: 'n', nickname: 'nick' }),
      );
    const client = await makeClient(fetchMock);

    const me = await client.users.me();

    expect(me.channelId).toBe('ch-1');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, retryInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect((retryInit.headers as Record<string, string>)['Authorization']).toBe('Bearer access-1');
  });
});
