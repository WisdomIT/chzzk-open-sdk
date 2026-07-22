import { bearerHeaders } from '../auth/headers.js';
import { parseLenient } from '../http/parse.js';
import { requireParam, requireRange } from '../http/validate.js';
import {
  sessionAuthSchema,
  sessionsPageSchema,
  type SessionEventType,
  type SessionsPage,
} from '../types/session.js';
import type { ResourceDeps } from './shared.js';

export interface SessionListParams {
  /** 1~50. 기본 20 */
  size?: number;
  /** 0부터. 기본 0 */
  page?: number;
}

/**
 * Session 리소스 (REST).
 * https://chzzk.gitbook.io/chzzk/chzzk-api/session
 *
 * 실측(2026-07-22) 참고:
 * - 세션은 소켓 핸드셰이크 시점에 등록되며 라이브 상태와 무관
 * - 클라이언트 인증 세션에 유저 토큰으로 이벤트를 구독하는 조합이 동작
 *   (다중 채널 봇 아키텍처의 표준 패턴)
 * - 구독/해지 완료는 HTTP 응답이 아니라 세션의 SYSTEM(subscribed/
 *   unsubscribed) 메시지로 통지된다
 */
export class SessionResource {
  constructor(private readonly deps: ResourceDeps) {}

  /**
   * 세션 생성(클라이언트) — `GET /open/v1/sessions/auth/client` 〔Client 인증〕
   * 클라이언트당 최대 10개 연결 유지 가능.
   * @returns 소켓 연결용 URL (일정 시간 동안만 유효)
   */
  async createClientSessionUrl(): Promise<string> {
    const raw = await this.deps.http.request<unknown>({
      method: 'GET',
      path: '/open/v1/sessions/auth/client',
      headers: this.deps.clientAuthHeaders,
    });
    return parseLenient(
      sessionAuthSchema,
      raw,
      this.deps.logger,
      'GET /open/v1/sessions/auth/client',
    ).url;
  }

  /**
   * 세션 생성(유저) — `GET /open/v1/sessions/auth` 〔유저 토큰〕
   * 유저당 최대 3개 연결. 생성에 사용한 토큰과 동일한 유저의 이벤트만 구독 가능.
   */
  async createUserSessionUrl(): Promise<string> {
    const raw = await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'GET',
        path: '/open/v1/sessions/auth',
        headers: bearerHeaders(token),
      }),
    );
    return parseLenient(sessionAuthSchema, raw, this.deps.logger, 'GET /open/v1/sessions/auth').url;
  }

  /** 세션 목록(클라이언트) — `GET /open/v1/sessions/client` 〔Client 인증〕 */
  async listClientSessions(params: SessionListParams = {}): Promise<SessionsPage> {
    requireRange(params.size, 'size', 1, 50);
    const raw = await this.deps.http.request<unknown>({
      method: 'GET',
      path: '/open/v1/sessions/client',
      query: { size: params.size, page: params.page },
      headers: this.deps.clientAuthHeaders,
    });
    return parseLenient(sessionsPageSchema, raw, this.deps.logger, 'GET /open/v1/sessions/client');
  }

  /** 세션 목록(유저) — `GET /open/v1/sessions` 〔유저 토큰〕 끊긴 세션은 90일간 조회 가능. */
  async listUserSessions(params: SessionListParams = {}): Promise<SessionsPage> {
    requireRange(params.size, 'size', 1, 50);
    const raw = await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'GET',
        path: '/open/v1/sessions',
        query: { size: params.size, page: params.page },
        headers: bearerHeaders(token),
      }),
    );
    return parseLenient(sessionsPageSchema, raw, this.deps.logger, 'GET /open/v1/sessions');
  }

  /**
   * 이벤트 구독 — `POST /open/v1/sessions/events/subscribe/{eventType}` 〔유저 토큰〕
   * Scope: chat=채팅 메시지 조회 / donation=후원 조회 / subscription=구독 조회.
   * 세션당 최대 30개 구독. 완료는 세션의 `SYSTEM(subscribed)` 메시지로 통지된다.
   */
  async subscribe(eventType: SessionEventType, sessionKey: string): Promise<void> {
    requireParam(sessionKey, 'sessionKey');
    await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'POST',
        path: `/open/v1/sessions/events/subscribe/${eventType}`,
        query: { sessionKey },
        headers: bearerHeaders(token),
      }),
    );
  }

  /**
   * 이벤트 구독 취소 — `POST /open/v1/sessions/events/unsubscribe/{eventType}` 〔유저 토큰〕
   * 완료는 세션의 `SYSTEM(unsubscribed)` 메시지로 통지된다.
   */
  async unsubscribe(eventType: SessionEventType, sessionKey: string): Promise<void> {
    requireParam(sessionKey, 'sessionKey');
    await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'POST',
        path: `/open/v1/sessions/events/unsubscribe/${eventType}`,
        query: { sessionKey },
        headers: bearerHeaders(token),
      }),
    );
  }
}
