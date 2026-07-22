import { bearerHeaders } from '../auth/headers.js';
import { parseLenient } from '../http/parse.js';
import { requireMaxLength, requireRange } from '../http/validate.js';
import {
  channelsResponseSchema,
  followersPageSchema,
  streamingRolesResponseSchema,
  subscribersPageSchema,
  type Channel,
  type Follower,
  type FollowersPage,
  type PageParams,
  type StreamingRoleMember,
  type Subscriber,
  type SubscribersPage,
  type SubscriberSort,
} from '../types/channel.js';
import type { ResourceDeps } from './shared.js';

/**
 * Channel 리소스.
 * https://chzzk.gitbook.io/chzzk/chzzk-api/channel
 */
export class ChannelResource {
  constructor(private readonly deps: ResourceDeps) {}

  /**
   * 채널 정보 조회 — `GET /open/v1/channels` 〔Client 인증〕
   * @param channelIds 최대 20개. 일치하는 채널이 없으면 해당 항목은 결과에서 빠진다.
   */
  async get(channelIds: readonly string[]): Promise<Channel[]> {
    requireMaxLength(channelIds, 'channelIds', 20);
    const raw = await this.deps.http.request<unknown>({
      method: 'GET',
      path: '/open/v1/channels',
      query: { channelIds: [...channelIds] },
      headers: this.deps.clientAuthHeaders,
    });
    return parseLenient(channelsResponseSchema, raw, this.deps.logger, 'GET /open/v1/channels')
      .data;
  }

  /**
   * 채널 관리자 조회 — `GET /open/v1/channels/streaming-roles`
   * 〔유저 토큰 · Scope: 채널 관리자 조회〕
   *
   * 채널 소유자 본인도 목록에 포함되며, 이때 userRole은 실측상 `STREAMER`다
   * (문서의 STREAMING_CHANNEL_OWNER와 다름 — docs/api-notes.md #25).
   */
  async streamingRoles(): Promise<StreamingRoleMember[]> {
    const raw = await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'GET',
        path: '/open/v1/channels/streaming-roles',
        headers: bearerHeaders(token),
      }),
    );
    return parseLenient(
      streamingRolesResponseSchema,
      raw,
      this.deps.logger,
      'GET /open/v1/channels/streaming-roles',
    ).data;
  }

  /**
   * 채널 팔로워 조회(단일 페이지) — `GET /open/v1/channels/followers`
   * 〔유저 토큰 · Scope: 채널 팔로워 조회〕
   *
   * 응답의 page/totalCount/totalPages는 문서에 없지만 실측으로 확인된 메타.
   */
  async followers(params: PageParams = {}): Promise<FollowersPage> {
    requireRange(params.size, 'size', 1, 50);
    const raw = await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'GET',
        path: '/open/v1/channels/followers',
        query: { page: params.page, size: params.size },
        headers: bearerHeaders(token),
      }),
    );
    return parseLenient(
      followersPageSchema,
      raw,
      this.deps.logger,
      'GET /open/v1/channels/followers',
    );
  }

  /** 팔로워 전체 자동 순회. totalPages(실측 메타) 또는 빈 페이지에서 종료. */
  async *iterateFollowers(params: Pick<PageParams, 'size'> = {}): AsyncGenerator<Follower, void> {
    const size = params.size ?? 50;
    for (let page = 0; ; page += 1) {
      const result = await this.followers({ page, size });
      yield* result.data;
      if (
        result.data.length === 0 ||
        (result.totalPages !== undefined && page + 1 >= result.totalPages)
      ) {
        return;
      }
    }
  }

  /**
   * 채널 구독자 조회(단일 페이지) — `GET /open/v1/channels/subscribers`
   * 〔유저 토큰 · Scope: 채널 구독자 조회〕
   */
  async subscribers(params: PageParams & { sort?: SubscriberSort } = {}): Promise<SubscribersPage> {
    requireRange(params.size, 'size', 1, 50);
    const raw = await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'GET',
        path: '/open/v1/channels/subscribers',
        query: { page: params.page, size: params.size, sort: params.sort },
        headers: bearerHeaders(token),
      }),
    );
    return parseLenient(
      subscribersPageSchema,
      raw,
      this.deps.logger,
      'GET /open/v1/channels/subscribers',
    );
  }

  /** 구독자 전체 자동 순회. totalPages(실측 메타) 또는 빈 페이지에서 종료. */
  async *iterateSubscribers(
    params: Pick<PageParams, 'size'> & { sort?: SubscriberSort } = {},
  ): AsyncGenerator<Subscriber, void> {
    const size = params.size ?? 50;
    for (let page = 0; ; page += 1) {
      const query: PageParams & { sort?: SubscriberSort } = { page, size };
      if (params.sort !== undefined) {
        query.sort = params.sort;
      }
      const result = await this.subscribers(query);
      yield* result.data;
      if (
        result.data.length === 0 ||
        (result.totalPages !== undefined && page + 1 >= result.totalPages)
      ) {
        return;
      }
    }
  }
}
