import { describe, expect, it, vi } from 'vitest';
import { AuthClient } from '../../src/auth/client.js';
import { buildAuthorizationUrl } from '../../src/auth/oauth.js';
import { bearerHeaders, clientHeaders } from '../../src/auth/headers.js';
import { ChzzkError, ChzzkValidationError } from '../../src/errors.js';
import { HttpClient } from '../../src/http/client.js';

function tokenResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      code: 200,
      message: null,
      content: {
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        tokenType: 'Bearer',
        expiresIn: '86400',
        ...overrides,
      },
    }),
    { status: 200 },
  );
}

function makeAuthClient(fetchMock: typeof globalThis.fetch): AuthClient {
  return new AuthClient({
    clientId: 'cid',
    clientSecret: 'csecret',
    http: new HttpClient({ fetch: fetchMock }),
  });
}

describe('buildAuthorizationUrl', () => {
  it('builds the account-interlock URL with encoded params', () => {
    const url = buildAuthorizationUrl({
      clientId: 'cid',
      redirectUri: 'http://localhost:8080/api/path',
      state: 'zxclDasdfA25',
    });
    expect(url).toBe(
      'https://chzzk.naver.com/account-interlock?clientId=cid&redirectUri=http%3A%2F%2Flocalhost%3A8080%2Fapi%2Fpath&state=zxclDasdfA25',
    );
  });

  it('rejects missing params before building', () => {
    expect(() => buildAuthorizationUrl({ clientId: '', redirectUri: 'x', state: 's' })).toThrow(
      ChzzkValidationError,
    );
  });
});

describe('auth headers', () => {
  it('builds Bearer and Client auth headers', () => {
    expect(bearerHeaders('tok')).toEqual({ Authorization: 'Bearer tok' });
    expect(clientHeaders('cid', 'sec')).toEqual({ 'Client-Id': 'cid', 'Client-Secret': 'sec' });
  });
});

describe('AuthClient.issueToken', () => {
  it('POSTs authorization_code grant with client credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse());
    const auth = makeAuthClient(fetchMock);

    await auth.issueToken({ code: 'the-code', state: 'the-state' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openapi.chzzk.naver.com/auth/v1/token');
    expect(JSON.parse(init.body as string)).toEqual({
      grantType: 'authorization_code',
      clientId: 'cid',
      clientSecret: 'csecret',
      code: 'the-code',
      state: 'the-state',
    });
  });

  it('normalizes string expiresIn to a number and stamps obtainedAt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse({ expiresIn: '86400' }));
    const auth = makeAuthClient(fetchMock);

    const before = Date.now();
    const tokens = await auth.issueToken({ code: 'c', state: 's' });

    expect(tokens.expiresIn).toBe(86400);
    expect(typeof tokens.expiresIn).toBe('number');
    expect(tokens.obtainedAt).toBeGreaterThanOrEqual(before);
    expect(tokens.scope).toBeUndefined();
  });

  it('accepts numeric expiresIn as-is (doc-vs-actual tolerance)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse({ expiresIn: 3600 }));
    const auth = makeAuthClient(fetchMock);

    const tokens = await auth.issueToken({ code: 'c', state: 's' });
    expect(tokens.expiresIn).toBe(3600);
  });

  it('keeps scope when present (refresh responses)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse({ scope: '채널 조회' }));
    const auth = makeAuthClient(fetchMock);

    const tokens = await auth.issueToken({ code: 'c', state: 's' });
    expect(tokens.scope).toBe('채널 조회');
  });

  it('throws ChzzkError on unexpected response shape', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ code: 200, message: null, content: { nope: true } })),
      );
    const auth = makeAuthClient(fetchMock);

    await expect(auth.issueToken({ code: 'c', state: 's' })).rejects.toBeInstanceOf(ChzzkError);
  });
});

describe('AuthClient.refreshToken', () => {
  it('POSTs refresh_token grant', async () => {
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse());
    const auth = makeAuthClient(fetchMock);

    await auth.refreshToken('refresh-0');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      grantType: 'refresh_token',
      refreshToken: 'refresh-0',
      clientId: 'cid',
      clientSecret: 'csecret',
    });
  });
});

describe('AuthClient.revokeToken', () => {
  it('POSTs to the documented /auth/v1/token/revoke path with default hint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const auth = makeAuthClient(fetchMock);

    await auth.revokeToken('tok-1');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openapi.chzzk.naver.com/auth/v1/token/revoke');
    expect(JSON.parse(init.body as string)).toEqual({
      clientId: 'cid',
      clientSecret: 'csecret',
      token: 'tok-1',
      tokenTypeHint: 'access_token',
    });
  });

  it('supports refresh_token hint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const auth = makeAuthClient(fetchMock);

    await auth.revokeToken('tok-1', 'refresh_token');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ tokenTypeHint: 'refresh_token' });
  });
});
