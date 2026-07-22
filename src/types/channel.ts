import { z } from 'zod';

/**
 * Channel API 응답 타입.
 * https://chzzk.gitbook.io/chzzk/chzzk-api/channel
 */

/** GET /open/v1/channels 의 data[] 항목 */
export const channelSchema = z.looseObject({
  channelId: z.string(),
  channelName: z.string(),
  channelImageUrl: z.string().nullable(),
  followerCount: z.number(),
  /** 2025.07 추가 */
  verifiedMark: z.boolean(),
});
export type Channel = z.infer<typeof channelSchema>;

export const channelsResponseSchema = z.looseObject({
  data: z.array(channelSchema),
});

/**
 * 채널 관리자 역할.
 *
 * 문서 enum은 STREAMING_CHANNEL_OWNER 등 4종이지만, 실측(2026-07-22)에서
 * 채널 소유자가 **`STREAMER`** 로 내려오는 것을 확인 (docs/api-notes.md #25).
 * 미래의 미문서 값도 수용하도록 string 확장을 허용한다.
 */
export const knownStreamingRoles = [
  'STREAMER',
  'STREAMING_CHANNEL_OWNER',
  'STREAMING_CHANNEL_MANAGER',
  'STREAMING_CHAT_MANAGER',
  'STREAMING_SETTLEMENT_MANAGER',
] as const;
export type StreamingRole = (typeof knownStreamingRoles)[number] | (string & Record<never, never>);

/** GET /open/v1/channels/streaming-roles 의 data[] 항목 */
export const streamingRoleMemberSchema = z.looseObject({
  managerChannelId: z.string(),
  managerChannelName: z.string(),
  userRole: z.custom<StreamingRole>((value) => typeof value === 'string'),
  createdDate: z.string(),
});
export type StreamingRoleMember = z.infer<typeof streamingRoleMemberSchema>;

export const streamingRolesResponseSchema = z.looseObject({
  data: z.array(streamingRoleMemberSchema),
});

/**
 * 목록 응답의 페이지 메타.
 * 문서에는 없지만 실측(2026-07-22)으로 확인된 필드 (docs/api-notes.md #20).
 */
const pageMetaShape = {
  page: z.number().optional(),
  totalCount: z.number().optional(),
  totalPages: z.number().optional(),
};

/** GET /open/v1/channels/followers 의 data[] 항목 */
export const followerSchema = z.looseObject({
  channelId: z.string(),
  channelName: z.string(),
  createdDate: z.string(),
});
export type Follower = z.infer<typeof followerSchema>;

export const followersPageSchema = z.looseObject({
  data: z.array(followerSchema),
  ...pageMetaShape,
});
export type FollowersPage = z.infer<typeof followersPageSchema>;

/** GET /open/v1/channels/subscribers 의 data[] 항목 */
export const subscriberSchema = z.looseObject({
  channelId: z.string(),
  channelName: z.string(),
  /** 구독 개월 수 */
  month: z.number(),
  /** 1(티어1) | 2(티어2) */
  tierNo: z.number(),
  createdDate: z.string(),
});
export type Subscriber = z.infer<typeof subscriberSchema>;

export const subscribersPageSchema = z.looseObject({
  data: z.array(subscriberSchema),
  ...pageMetaShape,
});
export type SubscribersPage = z.infer<typeof subscribersPageSchema>;

export type SubscriberSort = 'RECENT' | 'LONGER';

export interface PageParams {
  /** 0부터 시작. 기본 0 */
  page?: number;
  /** 1~50. 기본 30 */
  size?: number;
}
