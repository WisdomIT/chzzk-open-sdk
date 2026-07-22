import { bearerHeaders } from '../auth/headers.js';
import { parseLenient } from '../http/parse.js';
import { userMeSchema, type UserMe } from '../types/user.js';
import type { ResourceDeps } from './shared.js';

/**
 * User 리소스.
 * https://chzzk.gitbook.io/chzzk/chzzk-api/user
 */
export class UserResource {
  constructor(private readonly deps: ResourceDeps) {}

  /**
   * 유저 정보 조회 — `GET /open/v1/users/me`
   * 〔유저 토큰 · Scope: 유저 정보 조회〕
   */
  async me(): Promise<UserMe> {
    const raw = await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'GET',
        path: '/open/v1/users/me',
        headers: bearerHeaders(token),
      }),
    );
    return parseLenient(userMeSchema, raw, this.deps.logger, 'GET /open/v1/users/me');
  }
}
