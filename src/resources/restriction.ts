import { bearerHeaders } from '../auth/headers.js';
import { paginateByCursor } from '../http/pagination.js';
import { parseLenient } from '../http/parse.js';
import { requireParam, requireRange } from '../http/validate.js';
import {
  restrictedChannelsPageSchema,
  type RestrictedChannel,
  type RestrictedChannelsPage,
  type TemporaryRestrictionParams,
} from '../types/restriction.js';
import type { ResourceDeps } from './shared.js';

export interface RestrictionListParams {
  /** 1~30. 기본 30 */
  size?: number;
  /** 다음 페이지 커서 (응답 `page.next` 값) */
  next?: string;
}

/**
 * Restriction 리소스. 모두 유저 토큰 필요.
 * https://chzzk.gitbook.io/chzzk/chzzk-api/restriction
 *
 * 실측(2026-07-22) 참고:
 * - 채널 관리자 계정은 활동 제한/임시제한 등록이 400으로 거부된다
 * - 미제한 유저 해제 시 400 "활동제한되지 않은 유저입니다." /
 *   "임시제한된 유저가 아닙니다."
 */
export class RestrictionResource {
  constructor(private readonly deps: ResourceDeps) {}

  /**
   * 활동 제한 목록 조회(단일 페이지) — `GET /open/v1/restrict-channels`
   * 〔Scope: 활동제한 조회〕 파라미터는 쿼리로 전송 (실측 확인 — api-notes #16)
   */
  async list(params: RestrictionListParams = {}): Promise<RestrictedChannelsPage> {
    requireRange(params.size, 'size', 1, 30);
    const raw = await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'GET',
        path: '/open/v1/restrict-channels',
        query: { size: params.size, next: params.next },
        headers: bearerHeaders(token),
      }),
    );
    return parseLenient(
      restrictedChannelsPageSchema,
      raw,
      this.deps.logger,
      'GET /open/v1/restrict-channels',
    );
  }

  /** 활동 제한 전체 자동 순회 (`page.next` 커서 소진까지). */
  iterate(
    params: Pick<RestrictionListParams, 'size'> = {},
  ): AsyncGenerator<RestrictedChannel, void> {
    return paginateByCursor(async (cursor) => {
      const query: RestrictionListParams = {};
      if (params.size !== undefined) query.size = params.size;
      if (cursor !== undefined) query.next = cursor;
      const result = await this.list(query);
      return { items: result.data, next: result.page?.next ?? null };
    });
  }

  /** 활동 제한 추가 — `POST /open/v1/restrict-channels` 〔Scope: 활동제한 쓰기〕 */
  async add(targetChannelId: string): Promise<void> {
    requireParam(targetChannelId, 'targetChannelId');
    await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'POST',
        path: '/open/v1/restrict-channels',
        headers: bearerHeaders(token),
        body: { targetChannelId },
      }),
    );
  }

  /** 활동 제한 삭제 — `DELETE /open/v1/restrict-channels` 〔Scope: 활동제한 쓰기〕 */
  async remove(targetChannelId: string): Promise<void> {
    requireParam(targetChannelId, 'targetChannelId');
    await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'DELETE',
        path: '/open/v1/restrict-channels',
        headers: bearerHeaders(token),
        body: { targetChannelId },
      }),
    );
  }

  /**
   * 임시제한 추가 — `POST /open/v1/temporary-restrict-channels`
   * 〔Scope: 활동제한 쓰기〕 (2026.03 추가)
   * `chatChannelId`는 세션 CHAT 이벤트에서 얻는다.
   */
  async addTemporary(params: TemporaryRestrictionParams): Promise<void> {
    requireParam(params.targetChannelId, 'targetChannelId');
    requireParam(params.chatChannelId, 'chatChannelId');
    await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'POST',
        path: '/open/v1/temporary-restrict-channels',
        headers: bearerHeaders(token),
        body: params,
      }),
    );
  }

  /** 임시제한 해제 — `DELETE /open/v1/temporary-restrict-channels` 〔Scope: 활동제한 쓰기〕 */
  async removeTemporary(params: TemporaryRestrictionParams): Promise<void> {
    requireParam(params.targetChannelId, 'targetChannelId');
    requireParam(params.chatChannelId, 'chatChannelId');
    await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'DELETE',
        path: '/open/v1/temporary-restrict-channels',
        headers: bearerHeaders(token),
        body: params,
      }),
    );
  }
}
