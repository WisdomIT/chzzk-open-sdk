import { AuthClient } from './auth/client.js';
import { clientHeaders } from './auth/headers.js';
import { TokenManager } from './auth/manager.js';
import { buildAuthorizationUrl } from './auth/oauth.js';
import type { TokenStore } from './auth/types.js';
import { HttpClient, type RetryOptions } from './http/client.js';
import { noopLogger, type ChzzkLogger } from './http/logger.js';
import { requireParam } from './http/validate.js';
import { ChzzkRealtime } from './realtime/stream.js';
import { SessionTransport, type SessionTransportReconnectOptions } from './realtime/transport.js';
import type { SessionEventType } from './types/session.js';
import { CategoryResource } from './resources/category.js';
import { ChannelResource } from './resources/channel.js';
import { ChatResource } from './resources/chat.js';
import { DropsResource } from './resources/drops.js';
import { LiveResource } from './resources/live.js';
import { RestrictionResource } from './resources/restriction.js';
import { SessionResource } from './resources/session.js';
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
  readonly chats: ChatResource;
  readonly drops: DropsResource;
  readonly restrictions: RestrictionResource;
  readonly sessions: SessionResource;

  private readonly clientId: string;
  private readonly logger: ChzzkLogger;
  private readonly fetchFn: typeof globalThis.fetch | undefined;

  constructor(options: ChzzkOpenClientOptions) {
    this.clientId = requireParam(options.clientId, 'clientId');
    const clientSecret = requireParam(options.clientSecret, 'clientSecret');
    const logger = options.logger ?? noopLogger;
    this.logger = logger;
    this.fetchFn = options.fetch;

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
    this.chats = new ChatResource(deps);
    this.drops = new DropsResource(deps);
    this.restrictions = new RestrictionResource(deps);
    this.sessions = new SessionResource(deps);
  }

  /** 인가 코드 요청 URL 생성 — 유저를 이 URL로 리다이렉트한다. */
  getAuthorizationUrl(params: { redirectUri: string; state: string }): string {
    return buildAuthorizationUrl({ clientId: this.clientId, ...params });
  }

  /**
   * 실시간 정규화 이벤트 스트림 생성.
   *
   * 단일 업스트림 연결 위에 여러 소비자(에미터/AsyncIterable)가 붙는다.
   * `start()`로 연결하고 `close()`로 종료한다. 자세한 사용 패턴은 examples/ 참고.
   *
   * ```ts
   * const realtime = client.createRealtime({ auth: 'client', subscriptions: ['chat'] });
   * realtime.on('chat', (chat) => console.log(chat.nickname, chat.content));
   * await realtime.start();
   * ```
   */
  createRealtime(options: {
    auth: 'client' | 'user';
    subscriptions?: readonly SessionEventType[];
    reconnect?: SessionTransportReconnectOptions;
    preferWebSocket?: boolean;
    connectedTimeoutMs?: number;
  }): ChzzkRealtime {
    const transportOptions: ConstructorParameters<typeof SessionTransport>[0] = {
      sessions: this.sessions,
      auth: options.auth,
      logger: this.logger,
    };
    if (options.subscriptions !== undefined) {
      transportOptions.subscriptions = options.subscriptions;
    }
    if (options.reconnect !== undefined) transportOptions.reconnect = options.reconnect;
    if (options.preferWebSocket !== undefined) {
      transportOptions.preferWebSocket = options.preferWebSocket;
    }
    if (options.connectedTimeoutMs !== undefined) {
      transportOptions.connectedTimeoutMs = options.connectedTimeoutMs;
    }
    if (this.fetchFn !== undefined) transportOptions.fetchFn = this.fetchFn;

    return new ChzzkRealtime({
      transport: new SessionTransport(transportOptions),
      logger: this.logger,
    });
  }
}
