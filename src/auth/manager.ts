import { ChzzkAuthenticationError, ChzzkError } from '../errors.js';
import { noopLogger, type ChzzkLogger } from '../http/logger.js';
import type { AuthClient, IssueTokenParams } from './client.js';
import {
  InMemoryTokenStore,
  isTokenExpired,
  type ChzzkTokenSet,
  type TokenStore,
} from './types.js';

/** Refresh Token 갱신 실패. 재로그인(인가 코드 재발급)이 필요하다. */
export class ChzzkTokenRefreshError extends ChzzkError {
  override name = 'ChzzkTokenRefreshError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export interface TokenManagerOptions {
  authClient: AuthClient;
  /** 기본은 InMemoryTokenStore */
  store?: TokenStore;
  /** 만료 이 초 전부터 갱신을 시작한다. 기본 60초. */
  expirySkewSeconds?: number;
  logger?: ChzzkLogger;
}

/**
 * 유저 Access Token의 수명 관리.
 *
 * - 만료 임박 시 선제 갱신, 401 시 갱신 후 1회 재시도(`withAccessToken`)
 * - Refresh Token이 일회용이므로 갱신은 single-flight로 직렬화하고,
 *   새 토큰 묶음을 즉시 store에 반영한다.
 */
export class TokenManager {
  private readonly authClient: AuthClient;
  private readonly store: TokenStore;
  private readonly expirySkewSeconds: number;
  private readonly logger: ChzzkLogger;
  private refreshInFlight: Promise<ChzzkTokenSet> | null = null;

  constructor(options: TokenManagerOptions) {
    this.authClient = options.authClient;
    this.store = options.store ?? new InMemoryTokenStore();
    this.expirySkewSeconds = options.expirySkewSeconds ?? 60;
    this.logger = options.logger ?? noopLogger;
  }

  /** 인가 코드로 토큰을 발급받아 store에 저장한다. */
  async login(params: IssueTokenParams): Promise<ChzzkTokenSet> {
    const tokens = await this.authClient.issueToken(params);
    await this.store.set(tokens);
    return tokens;
  }

  /** 외부에서 발급/보관하던 토큰을 주입한다. */
  async setTokens(tokens: ChzzkTokenSet): Promise<void> {
    await this.store.set(tokens);
  }

  /** 유효한 Access Token을 반환한다. 만료(임박) 시 자동 갱신. */
  async getAccessToken(): Promise<string> {
    const tokens = await this.store.get();
    if (tokens === null) {
      throw new ChzzkError(
        'No tokens available. Call login() with an authorization code or setTokens() first.',
      );
    }
    if (!isTokenExpired(tokens, this.expirySkewSeconds)) {
      return tokens.accessToken;
    }
    const refreshed = await this.refresh();
    return refreshed.accessToken;
  }

  /**
   * Access Token으로 요청을 실행한다.
   * 401(ChzzkAuthenticationError) 시 토큰을 갱신하고 정확히 1회 재시도한다.
   */
  async withAccessToken<T>(fn: (accessToken: string) => Promise<T>): Promise<T> {
    const accessToken = await this.getAccessToken();
    try {
      return await fn(accessToken);
    } catch (error) {
      if (!(error instanceof ChzzkAuthenticationError)) {
        throw error;
      }
      this.logger.debug('chzzk-open-sdk got 401; refreshing token and retrying once');
      const refreshed = await this.refresh();
      return fn(refreshed.accessToken);
    }
  }

  /** 강제 갱신. 동시 호출은 하나의 갱신 요청으로 합쳐진다. */
  refresh(): Promise<ChzzkTokenSet> {
    this.refreshInFlight ??= this.doRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  /** 현재 토큰을 폐기하고 store를 비운다. */
  async revoke(): Promise<void> {
    const tokens = await this.store.get();
    if (tokens === null) {
      return;
    }
    await this.authClient.revokeToken(tokens.accessToken, 'access_token');
    await this.store.clear();
  }

  private async doRefresh(): Promise<ChzzkTokenSet> {
    const tokens = await this.store.get();
    if (tokens === null) {
      throw new ChzzkError('Cannot refresh: no tokens in store.');
    }
    try {
      const refreshed = await this.authClient.refreshToken(tokens.refreshToken);
      await this.store.set(refreshed);
      return refreshed;
    } catch (cause) {
      if (cause instanceof ChzzkAuthenticationError) {
        // Refresh Token 자체가 만료/폐기됨 — 죽은 토큰을 남겨두지 않는다.
        await this.store.clear();
        throw new ChzzkTokenRefreshError(
          'Refresh token is invalid or expired. Re-authorization is required.',
          { cause },
        );
      }
      throw cause;
    }
  }
}
