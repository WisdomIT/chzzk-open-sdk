import { ChzzkError } from '../errors.js';
import type { HttpClient } from '../http/client.js';
import { requireParam } from '../http/validate.js';
import type { ChzzkTokenSet } from './types.js';

export interface AuthClientOptions {
  clientId: string;
  clientSecret: string;
  http: HttpClient;
}

export interface IssueTokenParams {
  /** account-interlock 리다이렉트로 받은 인가 코드 */
  code: string;
  /** 인가 요청에 사용한 state */
  state: string;
}

export type TokenTypeHint = 'access_token' | 'refresh_token';

/**
 * 토큰 발급 응답의 원시 형태.
 * `expiresIn`은 문서상 String이므로 둘 다 수용해 number로 정규화한다.
 */
interface RawTokenResponse {
  accessToken?: unknown;
  refreshToken?: unknown;
  tokenType?: unknown;
  expiresIn?: unknown;
  scope?: unknown;
}

function normalizeTokenResponse(raw: unknown, context: string): ChzzkTokenSet {
  const body: RawTokenResponse = typeof raw === 'object' && raw !== null ? raw : {};
  const { accessToken, refreshToken, tokenType, expiresIn, scope } = body;

  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    throw new ChzzkError(`Unexpected token response shape from ${context}`);
  }

  const expiresInNumber =
    typeof expiresIn === 'number'
      ? expiresIn
      : Number(typeof expiresIn === 'string' ? expiresIn : NaN);

  const tokens: ChzzkTokenSet = {
    accessToken,
    refreshToken,
    tokenType: typeof tokenType === 'string' ? tokenType : 'Bearer',
    // 파싱 불가 시 문서 기본값(1일)으로 보수적으로 간주
    expiresIn: Number.isFinite(expiresInNumber) ? expiresInNumber : 86400,
    obtainedAt: Date.now(),
  };
  if (typeof scope === 'string') {
    tokens.scope = scope;
  }
  return tokens;
}

/**
 * OAuth 토큰 발급/갱신/폐기.
 * https://chzzk.gitbook.io/chzzk/chzzk-api/authorization
 */
export class AuthClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly http: HttpClient;

  constructor(options: AuthClientOptions) {
    this.clientId = requireParam(options.clientId, 'clientId');
    this.clientSecret = requireParam(options.clientSecret, 'clientSecret');
    this.http = options.http;
  }

  /** 인가 코드를 Access/Refresh Token으로 교환한다. */
  async issueToken(params: IssueTokenParams): Promise<ChzzkTokenSet> {
    const content = await this.http.request<unknown>({
      method: 'POST',
      path: '/auth/v1/token',
      body: {
        grantType: 'authorization_code',
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        code: requireParam(params.code, 'code'),
        state: requireParam(params.state, 'state'),
      },
    });
    return normalizeTokenResponse(content, 'POST /auth/v1/token (authorization_code)');
  }

  /**
   * Refresh Token으로 새 토큰을 발급받는다.
   * Refresh Token은 일회용 — 반환된 새 묶음을 반드시 저장해야 한다.
   */
  async refreshToken(refreshToken: string): Promise<ChzzkTokenSet> {
    const content = await this.http.request<unknown>({
      method: 'POST',
      path: '/auth/v1/token',
      body: {
        grantType: 'refresh_token',
        refreshToken: requireParam(refreshToken, 'refreshToken'),
        clientId: this.clientId,
        clientSecret: this.clientSecret,
      },
    });
    return normalizeTokenResponse(content, 'POST /auth/v1/token (refresh_token)');
  }

  /**
   * 토큰 폐기. 동일 clientId+user로 발급된 모든 토큰이 함께 제거된다.
   *
   * 경로는 문서 기준 `/auth/v1/token/revoke`.
   * 일부 기존 구현은 `/auth/v1/revoke`를 사용했으나 문서와 불일치 —
   * 실자격 검증 전까지 문서 경로를 따른다 (docs/api-notes.md #1).
   */
  async revokeToken(token: string, tokenTypeHint: TokenTypeHint = 'access_token'): Promise<void> {
    await this.http.request<unknown>({
      method: 'POST',
      path: '/auth/v1/token/revoke',
      body: {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        token: requireParam(token, 'token'),
        tokenTypeHint,
      },
    });
  }
}
