import { describe, expect, it, vi } from 'vitest';
import type { AuthClient } from '../../src/auth/client.js';
import { ChzzkTokenRefreshError, TokenManager } from '../../src/auth/manager.js';
import { InMemoryTokenStore, isTokenExpired, type ChzzkTokenSet } from '../../src/auth/types.js';
import { ChzzkApiError, ChzzkAuthenticationError, ChzzkError } from '../../src/errors.js';

function tokenSet(overrides: Partial<ChzzkTokenSet> = {}): ChzzkTokenSet {
  return {
    accessToken: 'access-0',
    refreshToken: 'refresh-0',
    tokenType: 'Bearer',
    expiresIn: 86400,
    obtainedAt: Date.now(),
    ...overrides,
  };
}

function expiredTokenSet(overrides: Partial<ChzzkTokenSet> = {}): ChzzkTokenSet {
  return tokenSet({ obtainedAt: Date.now() - 90000 * 1000, ...overrides });
}

interface MockAuthClient {
  issueToken: ReturnType<typeof vi.fn>;
  refreshToken: ReturnType<typeof vi.fn>;
  revokeToken: ReturnType<typeof vi.fn>;
}

function makeManager(
  stored: ChzzkTokenSet | null,
  authOverrides: Partial<MockAuthClient> = {},
): { manager: TokenManager; auth: MockAuthClient; store: InMemoryTokenStore } {
  const auth: MockAuthClient = {
    issueToken: vi.fn(),
    refreshToken: vi
      .fn()
      .mockResolvedValue(tokenSet({ accessToken: 'access-1', refreshToken: 'refresh-1' })),
    revokeToken: vi.fn().mockResolvedValue(undefined),
    ...authOverrides,
  };
  const store = new InMemoryTokenStore();
  if (stored !== null) {
    void store.set(stored);
  }
  const manager = new TokenManager({ authClient: auth as unknown as AuthClient, store });
  return { manager, auth, store };
}

describe('isTokenExpired', () => {
  it('respects the skew window', () => {
    const now = 1_000_000_000;
    const tokens = { expiresIn: 100, obtainedAt: now - 50 * 1000 };
    expect(isTokenExpired(tokens, 0, now)).toBe(false);
    expect(isTokenExpired(tokens, 49, now)).toBe(false);
    expect(isTokenExpired(tokens, 50, now)).toBe(true);
  });
});

describe('TokenManager.getAccessToken', () => {
  it('returns the stored token while fresh, without refreshing', async () => {
    const { manager, auth } = makeManager(tokenSet());

    await expect(manager.getAccessToken()).resolves.toBe('access-0');
    expect(auth.refreshToken).not.toHaveBeenCalled();
  });

  it('refreshes when the token is expired and stores the rotated pair', async () => {
    const { manager, auth, store } = makeManager(expiredTokenSet());

    await expect(manager.getAccessToken()).resolves.toBe('access-1');
    expect(auth.refreshToken).toHaveBeenCalledExactlyOnceWith('refresh-0');

    const stored = await store.get();
    expect(stored?.refreshToken).toBe('refresh-1');
  });

  it('throws a clear error when no tokens are stored', async () => {
    const { manager } = makeManager(null);

    await expect(manager.getAccessToken()).rejects.toThrow(/No tokens available/);
  });

  it('single-flights concurrent refreshes', async () => {
    let resolveRefresh: (t: ChzzkTokenSet) => void = () => undefined;
    const refreshToken = vi.fn().mockImplementation(
      () =>
        new Promise<ChzzkTokenSet>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const { manager, auth } = makeManager(expiredTokenSet(), { refreshToken });

    const [p1, p2] = [manager.getAccessToken(), manager.getAccessToken()];
    await vi.waitFor(() => {
      expect(refreshToken).toHaveBeenCalled();
    });
    resolveRefresh(tokenSet({ accessToken: 'access-1', refreshToken: 'refresh-1' }));

    await expect(p1).resolves.toBe('access-1');
    await expect(p2).resolves.toBe('access-1');
    expect(auth.refreshToken).toHaveBeenCalledTimes(1);
  });

  it('clears the store and throws ChzzkTokenRefreshError when the refresh token is dead', async () => {
    const authError = new ChzzkAuthenticationError({
      status: 401,
      apiMessage: 'INVALID_TOKEN',
      method: 'POST',
      path: '/auth/v1/token',
    });
    const { manager, store } = makeManager(expiredTokenSet(), {
      refreshToken: vi.fn().mockRejectedValue(authError),
    });

    const error = await manager.getAccessToken().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ChzzkTokenRefreshError);
    expect((error as ChzzkTokenRefreshError).cause).toBe(authError);
    await expect(store.get()).resolves.toBeNull();
  });

  it('propagates non-auth refresh failures without clearing the store', async () => {
    const serverError = new ChzzkApiError({
      status: 500,
      apiMessage: 'INTERNAL_SERVER_ERROR',
      method: 'POST',
      path: '/auth/v1/token',
    });
    const { manager, store } = makeManager(expiredTokenSet(), {
      refreshToken: vi.fn().mockRejectedValue(serverError),
    });

    await expect(manager.getAccessToken()).rejects.toBe(serverError);
    await expect(store.get()).resolves.not.toBeNull();
  });
});

describe('TokenManager.withAccessToken', () => {
  it('refreshes and retries exactly once on 401', async () => {
    const { manager, auth } = makeManager(tokenSet());
    const fn = vi
      .fn()
      .mockRejectedValueOnce(
        new ChzzkAuthenticationError({
          status: 401,
          apiMessage: 'INVALID_TOKEN',
          method: 'GET',
          path: '/x',
        }),
      )
      .mockResolvedValueOnce('ok');

    await expect(manager.withAccessToken(fn)).resolves.toBe('ok');

    expect(auth.refreshToken).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenNthCalledWith(1, 'access-0');
    expect(fn).toHaveBeenNthCalledWith(2, 'access-1');
  });

  it('does not loop on repeated 401', async () => {
    const authError = new ChzzkAuthenticationError({
      status: 401,
      apiMessage: 'INVALID_TOKEN',
      method: 'GET',
      path: '/x',
    });
    const { manager } = makeManager(tokenSet());
    const fn = vi.fn().mockRejectedValue(authError);

    await expect(manager.withAccessToken(fn)).rejects.toBe(authError);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('propagates non-auth errors without refreshing', async () => {
    const { manager, auth } = makeManager(tokenSet());
    const boom = new ChzzkError('boom');
    const fn = vi.fn().mockRejectedValue(boom);

    await expect(manager.withAccessToken(fn)).rejects.toBe(boom);
    expect(auth.refreshToken).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('TokenManager.login / revoke', () => {
  it('login stores the issued token set', async () => {
    const issued = tokenSet({ accessToken: 'fresh' });
    const { manager, auth, store } = makeManager(null, {
      issueToken: vi.fn().mockResolvedValue(issued),
    });

    await expect(manager.login({ code: 'c', state: 's' })).resolves.toBe(issued);
    expect(auth.issueToken).toHaveBeenCalledExactlyOnceWith({ code: 'c', state: 's' });
    await expect(store.get()).resolves.toBe(issued);
  });

  it('revoke revokes the access token and clears the store', async () => {
    const { manager, auth, store } = makeManager(tokenSet());

    await manager.revoke();

    expect(auth.revokeToken).toHaveBeenCalledExactlyOnceWith('access-0', 'access_token');
    await expect(store.get()).resolves.toBeNull();
  });

  it('revoke is a no-op when the store is empty', async () => {
    const { manager, auth } = makeManager(null);

    await manager.revoke();
    expect(auth.revokeToken).not.toHaveBeenCalled();
  });
});
