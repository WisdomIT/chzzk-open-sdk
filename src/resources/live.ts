import { bearerHeaders } from '../auth/headers.js';
import { ChzzkValidationError } from '../errors.js';
import { paginateByCursor } from '../http/pagination.js';
import { parseLenient } from '../http/parse.js';
import { requireRange } from '../http/validate.js';
import {
  livesPageSchema,
  liveSettingSchema,
  streamKeySchema,
  type Live,
  type LiveSetting,
  type LiveSettingPatch,
  type LivesPage,
} from '../types/live.js';
import type { ResourceDeps } from './shared.js';

export interface LivesParams {
  /** 1~20. 기본 20 */
  size?: number;
  /** 다음 목록 커서 (응답 `page.next` 값) */
  next?: string;
}

/**
 * Live 리소스.
 * https://chzzk.gitbook.io/chzzk/chzzk-api/live
 */
export class LiveResource {
  constructor(private readonly deps: ResourceDeps) {}

  /** 라이브 목록 조회(단일 페이지) — `GET /open/v1/lives` 〔Client 인증〕 */
  async lives(params: LivesParams = {}): Promise<LivesPage> {
    requireRange(params.size, 'size', 1, 20);
    const raw = await this.deps.http.request<unknown>({
      method: 'GET',
      path: '/open/v1/lives',
      query: { size: params.size, next: params.next },
      headers: this.deps.clientAuthHeaders,
    });
    return parseLenient(livesPageSchema, raw, this.deps.logger, 'GET /open/v1/lives');
  }

  /** 라이브 전체 자동 순회 (`page.next` 커서 소진까지). */
  iterateLives(params: Pick<LivesParams, 'size'> = {}): AsyncGenerator<Live, void> {
    return paginateByCursor(async (cursor) => {
      const query: LivesParams = {};
      if (params.size !== undefined) query.size = params.size;
      if (cursor !== undefined) query.next = cursor;
      const result = await this.lives(query);
      return { items: result.data, next: result.page?.next ?? null };
    });
  }

  /**
   * 방송 스트림키 조회 — `GET /open/v1/streams/key`
   * 〔유저 토큰 · Scope: 방송 스트림키 조회〕
   * ⚠️ 스트림키는 방송 송출 권한 그 자체다. 로그·화면에 노출하지 말 것.
   */
  async streamKey(): Promise<string> {
    const raw = await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'GET',
        path: '/open/v1/streams/key',
        headers: bearerHeaders(token),
      }),
    );
    return parseLenient(streamKeySchema, raw, this.deps.logger, 'GET /open/v1/streams/key')
      .streamKey;
  }

  /**
   * 방송 설정 조회 — `GET /open/v1/lives/setting`
   * 〔유저 토큰 · Scope: 방송 설정 조회〕
   */
  async getSetting(): Promise<LiveSetting> {
    const raw = await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'GET',
        path: '/open/v1/lives/setting',
        headers: bearerHeaders(token),
      }),
    );
    return parseLenient(liveSettingSchema, raw, this.deps.logger, 'GET /open/v1/lives/setting');
  }

  /**
   * 방송 설정 변경 — `PATCH /open/v1/lives/setting`
   * 〔유저 토큰 · Scope: 방송 설정 변경〕
   * 전달한 필드만 변경된다. `categoryId: ""`는 카테고리 제거, `tags: []`는 태그 제거.
   */
  async updateSetting(patch: LiveSettingPatch): Promise<void> {
    if (Object.keys(patch).length === 0) {
      throw new ChzzkValidationError('updateSetting requires at least one field to change');
    }
    if (patch.defaultLiveTitle !== undefined && patch.defaultLiveTitle === '') {
      throw new ChzzkValidationError('"defaultLiveTitle" must not be empty');
    }
    await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'PATCH',
        path: '/open/v1/lives/setting',
        headers: bearerHeaders(token),
        body: patch,
      }),
    );
  }
}
