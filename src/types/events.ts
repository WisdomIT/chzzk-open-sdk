import { z } from 'zod';

/**
 * 세션 이벤트의 원시 payload 스키마와 정규화 도메인 타입.
 * https://chzzk.gitbook.io/chzzk/chzzk-api/session
 *
 * 원시 스키마는 실측(2026-07-22)을 우선한다 (docs/api-notes.md #6~#9, #27, #28):
 * - CHAT `userRoleCode`는 문서(최상위)와 달리 `profile` 내부에 위치
 * - `emojis`는 plain object(Map), `badges`는 `[{ imageUrl }]`
 * - 미문서 필드 `eventSentAt` 존재
 * - DONATION/SUBSCRIPTION은 실이벤트 미발생으로 문서 기준 (🟡)
 */

// --- CHAT --------------------------------------------------------------

/** 유저 채널 권한 (실측: profile.userRoleCode) */
export const knownChatUserRoles = [
  'streamer',
  'common_user',
  'streaming_channel_manager',
  'streaming_chat_manager',
] as const;
export type ChatUserRole = (typeof knownChatUserRoles)[number] | (string & Record<never, never>);

export const rawChatEventSchema = z.looseObject({
  channelId: z.string(),
  senderChannelId: z.string(),
  /** 임시제한·메시지 숨기기에 사용 (2026.03 추가, 실측 확인) */
  chatChannelId: z.string().optional(),
  profile: z.looseObject({
    nickname: z.string(),
    badges: z.array(z.looseObject({ imageUrl: z.string() })).optional(),
    verifiedMark: z.boolean().optional(),
    /** 실측: 문서와 달리 여기(profile 내부)에 위치 — api-notes #27 */
    userRoleCode: z.string().optional(),
  }),
  /** 문서상 위치(최상위) 폴백 — 실제로는 오지 않지만 문서를 따라오는 서버 변화 대비 */
  userRoleCode: z.string().optional(),
  content: z.string(),
  emojis: z.record(z.string(), z.string()).optional(),
  /** ms timestamp — blind-message의 messageTime으로 사용 */
  messageTime: z.number(),
  /** 미문서 실측 필드 (나노초 정밀, 타임존 표기 없음) — api-notes #28 */
  eventSentAt: z.string().optional(),
});
export type RawChatEvent = z.infer<typeof rawChatEventSchema>;

/** 정규화된 채팅 메시지 — 문서-실측 불일치를 흡수한 최종 형태 */
export interface ChatMessage {
  channelId: string;
  senderChannelId: string;
  /** 임시제한·blind-message에 필요. 없으면 null */
  chatChannelId: string | null;
  nickname: string;
  badges: { imageUrl: string }[];
  verifiedMark: boolean;
  /** profile.userRoleCode(실측 위치) 우선, 최상위(문서 위치) 폴백. 없으면 null */
  userRole: ChatUserRole | null;
  content: string;
  emojis: Record<string, string>;
  messageTime: number;
  eventSentAt: string | null;
}

// --- DONATION ----------------------------------------------------------

export const knownDonationTypes = ['CHAT', 'VIDEO'] as const;
export type DonationType = (typeof knownDonationTypes)[number] | (string & Record<never, never>);

export const rawDonationEventSchema = z.looseObject({
  donationType: z.custom<DonationType>((value) => typeof value === 'string'),
  channelId: z.string(),
  donatorChannelId: z.string(),
  donatorNickname: z.string(),
  /** 문서·wizbot 모두 문자열 (원 단위) — 실이벤트 실측은 보류 (api-notes #9) */
  payAmount: z.union([z.string(), z.number()]),
  donationText: z.string().optional(),
  emojis: z.record(z.string(), z.string()).optional(),
});
export type RawDonationEvent = z.infer<typeof rawDonationEventSchema>;

export interface Donation {
  donationType: DonationType;
  channelId: string;
  donatorChannelId: string;
  donatorNickname: string;
  /** 서버 원본 (문서상 문자열) */
  payAmount: string;
  /** 숫자 파생값. 변환 불가 시 null */
  payAmountNumber: number | null;
  donationText: string;
  emojis: Record<string, string>;
}

// --- SUBSCRIPTION --------------------------------------------------------

export const rawSubscriptionEventSchema = z.looseObject({
  channelId: z.string(),
  subscriberChannelId: z.string(),
  subscriberNickname: z.string(),
  /** 1(티어1) | 2(티어2) */
  tierNo: z.number(),
  tierName: z.string().optional(),
  /** 구독 개월 수 (문서 설명 오타 — api-notes #22) */
  month: z.number(),
});
export type RawSubscriptionEvent = z.infer<typeof rawSubscriptionEventSchema>;

export interface SubscriptionEvent {
  channelId: string;
  subscriberChannelId: string;
  subscriberNickname: string;
  tierNo: number;
  tierName: string | null;
  month: number;
}

// --- SYSTEM --------------------------------------------------------------

export const rawSystemMessageSchema = z.looseObject({
  type: z.string(),
  data: z.looseObject({}).optional(),
});

export type SystemEvent =
  | { type: 'connected'; sessionKey: string }
  | { type: 'subscribed' | 'unsubscribed' | 'revoked'; eventType: string; channelId: string }
  | { type: 'unknown'; systemType: string; data: unknown };

// --- 정규화 이벤트 유니언 -------------------------------------------------

/**
 * Normalize 계층의 출력. 소비자는 항상 이 타입만 본다.
 * 알 수 없는 이벤트/스키마 불일치는 `unknown`으로 전달되어 죽지 않는다.
 */
export type NormalizedEvent =
  | { type: 'chat'; chat: ChatMessage }
  | { type: 'donation'; donation: Donation }
  | { type: 'subscription'; subscription: SubscriptionEvent }
  | { type: 'system'; system: SystemEvent }
  | { type: 'unknown'; eventName: string; body: string };

/** 뱃지/권한 파생 결과 */
export type ChatRole = 'STREAMER' | 'MANAGER' | 'VIEWER';
