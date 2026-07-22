import { AuthClient } from './auth/client.js';
import { clientHeaders } from './auth/headers.js';
import { TokenManager } from './auth/manager.js';
import { buildAuthorizationUrl } from './auth/oauth.js';
import type { TokenStore } from './auth/types.js';
import { HttpClient, type RetryOptions } from './http/client.js';
import { noopLogger, type ChzzkLogger } from './http/logger.js';
import { requireParam } from './http/validate.js';
import { CategoryResource } from './resources/category.js';
import { ChannelResource } from './resources/channel.js';
import { LiveResource } from './resources/live.js';
import { UserResource } from './resources/user.js';
import type { ResourceDeps } from './resources/shared.js';

export interface ChzzkOpenClientOptions {
  clientId: string;
  clientSecret: string;
  /** 유저 토큰 저장소. 기본은 메모리(프로세스 재시작 시 소실). */
  tokenStore?: TokenStore;
  /** 만료 이 초 전부터 토큰을 선제 갱신. 기본 60초. */
  expirySkewSeconds?: number;
  logger?: ChzzkLogger;
  retry?: RetryOptions;
  /** 테스트/커스텀 런타임용 fetch 주입 */
  fetch?: typeof globalThis.fetch;
  /** 기본값: https://openapi.chzzk.naver.com */
  baseUrl?: string;
}

/**
 * CHZZK Open API 클라이언트 (엔트리포인트).
 *
 * ```ts
 * const client = new ChzzkOpenClient({ clientId, clientSecret });
 * client.getAuthorizationUrl({ redirectUri, state }); // 유저를 이 URL로 리다이렉트
 * await client.auth.login({ code, state });           // 콜백에서 토큰 교환
 * const me = await client.users.me();
 * ```
 */
export class ChzzkOpenClient {
  readonly http: HttpClient;
  /** 유저 토큰 수명 관리 (login/setTokens/getAccessToken/revoke) */
  readonly auth: TokenManager;
  readonly users: UserResource;
  readonly channels: ChannelResource;
  readonly categories: CategoryResource;
  readonly lives: LiveResource;

  private readonly clientId: string;

  constructor(options: ChzzkOpenClientOptions) {
    this.clientId = requireParam(options.clientId, 'clientId');
    const clientSecret = requireParam(options.clientSecret, 'clientSecret');
    const logger = options.logger ?? noopLogger;

    const httpOptions: ConstructorParameters<typeof HttpClient>[0] = { logger };
    if (options.baseUrl !== undefined) httpOptions.baseUrl = options.baseUrl;
    if (options.retry !== undefined) httpOptions.retry = options.retry;
    if (options.fetch !== undefined) httpOptions.fetch = options.fetch;
    this.http = new HttpClient(httpOptions);

    const authClient = new AuthClient({ clientId: this.clientId, clientSecret, http: this.http });
    const managerOptions: ConstructorParameters<typeof TokenManager>[0] = { authClient, logger };
    if (options.tokenStore !== undefined) managerOptions.store = options.tokenStore;
    if (options.expirySkewSeconds !== undefined) {
      managerOptions.expirySkewSeconds = options.expirySkewSeconds;
    }
    this.auth = new TokenManager(managerOptions);

    const deps: ResourceDeps = {
      http: this.http,
      tokenManager: this.auth,
      clientAuthHeaders: clientHeaders(this.clientId, clientSecret),
      logger,
    };

    this.users = new UserResource(deps);
    this.channels = new ChannelResource(deps);
    this.categories = new CategoryResource(deps);
    this.lives = new LiveResource(deps);
  }

  /** 인가 코드 요청 URL 생성 — 유저를 이 URL로 리다이렉트한다. */
  getAuthorizationUrl(params: { redirectUri: string; state: string }): string {
    return buildAuthorizationUrl({ clientId: this.clientId, ...params });
  }
}
