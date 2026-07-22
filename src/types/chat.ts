import { z } from 'zod';

/**
 * Chat API 타입.
 * https://chzzk.gitbook.io/chzzk/chzzk-api/chat
 */

/** POST /open/v1/chats/send 응답 */
export const chatSendResultSchema = z.looseObject({
  messageId: z.string(),
});
export type ChatSendResult = z.infer<typeof chatSendResultSchema>;

/** 본인인증 여부 설정 조건 */
export const knownChatAvailableConditions = ['NONE', 'REAL_NAME'] as const;
export type ChatAvailableCondition =
  (typeof knownChatAvailableConditions)[number] | (string & Record<never, never>);

/** 채팅 참여 범위 설정 조건 */
export const knownChatAvailableGroups = ['ALL', 'FOLLOWER', 'MANAGER', 'SUBSCRIBER'] as const;
export type ChatAvailableGroup =
  (typeof knownChatAvailableGroups)[number] | (string & Record<never, never>);

/**
 * GET /open/v1/chats/settings 응답.
 * 필드명·구성은 실측(2026-07-22)으로 확정 — 문서와 일치
 * (`allowSubscriberInFollowerMode`, `chatSlowModeSec`, `chatEmojiMode` 포함.
 *  일부 기존 구현의 `allowSubscriberFollowerMode` 표기는 오타. api-notes #11, #12)
 */
export const chatSettingsSchema = z.looseObject({
  chatAvailableCondition: z.custom<ChatAvailableCondition>((value) => typeof value === 'string'),
  chatAvailableGroup: z.custom<ChatAvailableGroup>((value) => typeof value === 'string'),
  minFollowerMinute: z.number(),
  allowSubscriberInFollowerMode: z.boolean(),
  chatSlowModeSec: z.number(),
  chatEmojiMode: z.boolean(),
});
export type ChatSettings = z.infer<typeof chatSettingsSchema>;

/** PUT 시 허용되는 minFollowerMinute 값 (2025.12 확장, 문서 기준 13종) */
export const allowedMinFollowerMinutes = [
  0, 5, 10, 30, 60, 1440, 10080, 43200, 86400, 129600, 172800, 216000, 259200,
] as const;

/** PUT 시 허용되는 chatSlowModeSec 값 (0은 저속모드 Off) */
export const allowedChatSlowModeSecs = [0, 3, 5, 10, 30, 60, 120, 300] as const;

/** PUT /open/v1/chats/settings 요청 body. 전달한 필드만 변경. */
export interface ChatSettingsUpdate {
  chatAvailableCondition?: ChatAvailableCondition;
  chatAvailableGroup?: ChatAvailableGroup;
  /** allowedMinFollowerMinutes 값만 허용 */
  minFollowerMinute?: number;
  allowSubscriberInFollowerMode?: boolean;
  /** allowedChatSlowModeSecs 값만 허용 */
  chatSlowModeSec?: number;
  chatEmojiMode?: boolean;
}

/**
 * POST /open/v1/chats/blind-message 요청.
 * `chatChannelId`·`messageTime`·`senderChannelId`는 세션 CHAT 이벤트에서 얻는다
 * (messageId로는 숨길 수 없음 — 사후 숨김만 가능).
 */
export interface BlindMessageParams {
  chatChannelId: string;
  /** CHAT 이벤트의 messageTime (ms timestamp) */
  messageTime: number;
  senderChannelId: string;
}
