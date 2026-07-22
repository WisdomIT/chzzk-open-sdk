/**
 * 문서-실제 검증 러너.
 *
 * 사용법:
 *   pnpm verify            # 가능한 자격증명 범위 내에서 전부 실행
 *
 * 자격증명:
 *   - Client 인증 검증: .env의 CHZZK_CLIENT_ID / CHZZK_CLIENT_SECRET
 *   - 유저 토큰 검증: `pnpm login` 으로 .tokens.json 발급
 *
 * 각 리소스 이슈(#6~#13)에서 이 파일에 검증 항목을 추가한다.
 * 불일치 발견 시 docs/api-notes.md 의 해당 행을 갱신한다.
 */
import { z } from 'zod';
import { bearerHeaders, clientHeaders } from '../../src/auth/headers.js';
import { requireParam } from '../../src/http/validate.js';
import {
  channelsResponseSchema,
  followersPageSchema,
  streamingRolesResponseSchema,
  subscribersPageSchema,
} from '../../src/types/channel.js';
import { userMeSchema } from '../../src/types/user.js';
import { checkSchema, runChecks, type VerifyCheck, type VerifyContext } from './runner.js';

async function myChannelId(ctx: VerifyContext): Promise<string> {
  const manager = requireParam(ctx.tokenManager, 'tokenManager');
  const me = await manager.withAccessToken((token) =>
    ctx.http.request<{ channelId: string }>({
      method: 'GET',
      path: '/open/v1/users/me',
      headers: bearerHeaders(token),
    }),
  );
  return me.channelId;
}

// --- User ---------------------------------------------------------------

/** https://chzzk.gitbook.io/chzzk/chzzk-api/user */
const usersMeCheck: VerifyCheck = {
  name: 'GET /open/v1/users/me',
  requires: 'user',
  async run(ctx) {
    const manager = requireParam(ctx.tokenManager, 'tokenManager');
    const raw = await manager.withAccessToken((token) =>
      ctx.http.request<unknown>({
        method: 'GET',
        path: '/open/v1/users/me',
        headers: bearerHeaders(token),
      }),
    );
    // SDK 타입(문서 + 실측 nickname 포함)을 그대로 대조한다
    const { parsed, extraFields } = checkSchema(userMeSchema, raw, [
      'channelId',
      'channelName',
      'nickname',
    ]);
    return { extraFields, note: `channelName=${parsed.channelName}` };
  },
};

// --- Category -----------------------------------------------------------

/** https://chzzk.gitbook.io/chzzk/chzzk-api/category */
const categoriesSearchCheck: VerifyCheck = {
  name: 'GET /open/v1/categories/search',
  requires: 'client',
  async run(ctx) {
    const raw = await ctx.http.request<unknown>({
      method: 'GET',
      path: '/open/v1/categories/search',
      query: { query: '게임', size: 5 },
      headers: clientHeaders(
        requireParam(ctx.clientId, 'clientId'),
        requireParam(ctx.clientSecret, 'clientSecret'),
      ),
    });
    const schema = z.looseObject({
      data: z.array(
        z.looseObject({
          categoryType: z.string(),
          categoryId: z.string(),
          categoryValue: z.string(),
          posterImageUrl: z.string().nullable(),
        }),
      ),
    });
    const { parsed, extraFields } = checkSchema(schema, raw, ['data']);
    return { extraFields, note: `${parsed.data.length}건 수신` };
  },
};

// --- Channel ------------------------------------------------------------

/** https://chzzk.gitbook.io/chzzk/chzzk-api/channel */
const channelsCheck: VerifyCheck = {
  name: 'GET /open/v1/channels',
  requires: 'both', // Client 인증 호출이지만 조회 대상으로 본인 channelId 사용
  async run(ctx) {
    const channelId = await myChannelId(ctx);
    const raw = await ctx.http.request<unknown>({
      method: 'GET',
      path: '/open/v1/channels',
      query: { channelIds: [channelId] },
      headers: clientHeaders(
        requireParam(ctx.clientId, 'clientId'),
        requireParam(ctx.clientSecret, 'clientSecret'),
      ),
    });
    const { parsed, extraFields } = checkSchema(channelsResponseSchema, raw, ['data']);
    const first = parsed.data[0];
    const itemExtras =
      first !== undefined
        ? Object.keys(first).filter(
            (key) =>
              ![
                'channelId',
                'channelName',
                'channelImageUrl',
                'followerCount',
                'verifiedMark',
              ].includes(key),
          )
        : [];
    return {
      extraFields: [...extraFields, ...itemExtras.map((k) => `data[].${k}`)],
      note: `${parsed.data.length}건, verifiedMark=${String(first?.verifiedMark)}`,
    };
  },
};

const streamingRolesCheck: VerifyCheck = {
  name: 'GET /open/v1/channels/streaming-roles',
  requires: 'user',
  async run(ctx) {
    const manager = requireParam(ctx.tokenManager, 'tokenManager');
    const raw = await manager.withAccessToken((token) =>
      ctx.http.request<unknown>({
        method: 'GET',
        path: '/open/v1/channels/streaming-roles',
        headers: bearerHeaders(token),
      }),
    );
    const { parsed, extraFields } = checkSchema(streamingRolesResponseSchema, raw, ['data']);
    // 문서 enum 외 값 관측용 (실측: 소유자는 STREAMER — api-notes #25)
    const roles = [...new Set(parsed.data.map((member) => member.userRole))].join(',');
    return { extraFields, note: `${parsed.data.length}건 / roles=${roles}` };
  },
};

const followersCheck: VerifyCheck = {
  name: 'GET /open/v1/channels/followers',
  requires: 'user',
  async run(ctx) {
    const manager = requireParam(ctx.tokenManager, 'tokenManager');
    const raw = await manager.withAccessToken((token) =>
      ctx.http.request<unknown>({
        method: 'GET',
        path: '/open/v1/channels/followers',
        query: { page: 0, size: 5 },
        headers: bearerHeaders(token),
      }),
    );
    // page/totalCount/totalPages는 문서에 없지만 실측(2026-07-22)으로 확인된 메타 (api-notes #20)
    const { parsed, extraFields } = checkSchema(followersPageSchema, raw, [
      'data',
      'page',
      'totalCount',
      'totalPages',
    ]);
    return {
      extraFields,
      note: `${parsed.data.length}건 / totalCount=${String(parsed.totalCount)}`,
    };
  },
};

const subscribersCheck: VerifyCheck = {
  name: 'GET /open/v1/channels/subscribers',
  requires: 'user',
  async run(ctx) {
    const manager = requireParam(ctx.tokenManager, 'tokenManager');
    const raw = await manager.withAccessToken((token) =>
      ctx.http.request<unknown>({
        method: 'GET',
        path: '/open/v1/channels/subscribers',
        query: { page: 0, size: 5, sort: 'RECENT' },
        headers: bearerHeaders(token),
      }),
    );
    const { parsed, extraFields } = checkSchema(subscribersPageSchema, raw, [
      'data',
      'page',
      'totalCount',
      'totalPages',
    ]);
    return {
      extraFields,
      note: `${parsed.data.length}건 / totalCount=${String(parsed.totalCount)}`,
    };
  },
};

await runChecks([
  usersMeCheck,
  categoriesSearchCheck,
  channelsCheck,
  streamingRolesCheck,
  followersCheck,
  subscribersCheck,
]);
