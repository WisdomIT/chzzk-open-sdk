import { ChzzkValidationError } from '../errors.js';
import { paginateByCursor } from '../http/pagination.js';
import { parseLenient } from '../http/parse.js';
import { requireMaxLength } from '../http/validate.js';
import {
  dropsRewardClaimsPageSchema,
  dropsUpdateResultSchema,
  type DropsRewardClaim,
  type DropsRewardClaimsPage,
  type DropsUpdateResult,
  type FulfillmentState,
} from '../types/drops.js';
import type { ResourceDeps } from './shared.js';

export interface DropsRewardClaimsParams {
  /** 커서 (응답 `page.cursor` 값) */
  from?: string;
  /** 페이지 크기. 기본 20 */
  size?: number;
  /** 조회할 지급 요청 ID 목록. 최대 100개 (콤마 구분 전송) */
  claimIds?: readonly string[];
  channelId?: string;
  /** campaignId와 categoryId는 동시 사용 불가 */
  campaignId?: string;
  categoryId?: string;
  fulfillmentState?: FulfillmentState;
}

/**
 * Drops 리소스 〔Client 인증 · 드롭스 Scope(법인 인증 필요)〕
 * https://chzzk.gitbook.io/chzzk/chzzk-api/drops
 *
 * 실측 검증 보류 상태 (docs/api-notes.md #18, #19) — 스코프 미보유 시
 * 403 "드롭스 스코프가 필요합니다."가 반환된다.
 */
export class DropsResource {
  constructor(private readonly deps: ResourceDeps) {}

  /**
   * 리워드 지급 요청 조회(단일 페이지) — `GET /open/v1/drops/reward-claims`
   *
   * page.from/page.size 쿼리 키는 문서의 중첩 표기를 따름 —
   * 실서버 직렬화 방식은 스코프 확보 후 검증 예정 (api-notes #18).
   */
  async rewardClaims(params: DropsRewardClaimsParams = {}): Promise<DropsRewardClaimsPage> {
    if (params.campaignId !== undefined && params.categoryId !== undefined) {
      throw new ChzzkValidationError('"campaignId" and "categoryId" cannot be used together');
    }
    if (params.claimIds !== undefined) {
      requireMaxLength(params.claimIds, 'claimIds', 100);
    }
    const raw = await this.deps.http.request<unknown>({
      method: 'GET',
      path: '/open/v1/drops/reward-claims',
      query: {
        'page.from': params.from,
        'page.size': params.size,
        claimId: params.claimIds !== undefined ? [...params.claimIds] : undefined,
        channelId: params.channelId,
        campaignId: params.campaignId,
        categoryId: params.categoryId,
        fulfillmentState: params.fulfillmentState,
      },
      headers: this.deps.clientAuthHeaders,
    });
    return parseLenient(
      dropsRewardClaimsPageSchema,
      raw,
      this.deps.logger,
      'GET /open/v1/drops/reward-claims',
    );
  }

  /** 리워드 지급 요청 전체 자동 순회 (`page.cursor` 소진까지). */
  iterateRewardClaims(
    params: Omit<DropsRewardClaimsParams, 'from'> = {},
  ): AsyncGenerator<DropsRewardClaim, void> {
    return paginateByCursor(async (cursor) => {
      const query: DropsRewardClaimsParams = { ...params };
      if (cursor !== undefined) query.from = cursor;
      const result = await this.rewardClaims(query);
      return { items: result.data, next: result.page?.cursor ?? null };
    });
  }

  /**
   * 리워드 지급 상태 갱신 — `PUT /open/v1/drops/reward-claims`
   * 응답 data[]는 status별로 묶인 지급 요청 ID 목록이다.
   */
  async updateRewardClaims(params: {
    claimIds: readonly string[];
    fulfillmentState: FulfillmentState;
  }): Promise<DropsUpdateResult['data']> {
    requireMaxLength(params.claimIds, 'claimIds', 100);
    const raw = await this.deps.http.request<unknown>({
      method: 'PUT',
      path: '/open/v1/drops/reward-claims',
      headers: this.deps.clientAuthHeaders,
      body: {
        claimIds: [...params.claimIds],
        fulfillmentState: params.fulfillmentState,
      },
    });
    return parseLenient(
      dropsUpdateResultSchema,
      raw,
      this.deps.logger,
      'PUT /open/v1/drops/reward-claims',
    ).data;
  }
}
