import { z } from 'zod';

/**
 * Session API 타입.
 * https://chzzk.gitbook.io/chzzk/chzzk-api/session
 */

/** 세션 생성 응답 (클라이언트/유저 공통) */
export const sessionAuthSchema = z.looseObject({
  /** 소켓 연결용 URL. 일정 시간 동안만 유효 */
  url: z.string(),
});

/** 구독 가능한 이벤트 종류 (subscribe/unsubscribe 경로 세그먼트) */
export const sessionEventTypes = ['chat', 'donation', 'subscription'] as const;
export type SessionEventType = (typeof sessionEventTypes)[number];

/** 세션 목록의 구독 이벤트 표기 (대문자). 미래 값 확장 허용. */
export const knownSubscribedEventTypes = ['CHAT', 'DONATION', 'SUBSCRIPTION'] as const;
export type SubscribedEventType =
  (typeof knownSubscribedEventTypes)[number] | (string & Record<never, never>);

/**
 * 세션 목록의 data[] 항목.
 * `disconnectedDate`는 실측(2026-07-22)상 연결 중에는 필드 자체가 없고
 * 끊긴 뒤에만 존재한다 (api-notes #4).
 */
export const sessionInfoSchema = z.looseObject({
  sessionKey: z.string(),
  /** 예: "2026-07-22 22:44:39" (공백 구분, 타임존 없음) */
  connectedDate: z.string(),
  disconnectedDate: z.string().nullable().optional(),
  subscribedEvents: z.array(
    z.looseObject({
      eventType: z.custom<SubscribedEventType>((value) => typeof value === 'string'),
      channelId: z.string(),
    }),
  ),
});
export type SessionInfo = z.infer<typeof sessionInfoSchema>;

/** 페이지 메타는 문서 미기재·실측 확정 (api-notes #20) */
export const sessionsPageSchema = z.looseObject({
  data: z.array(sessionInfoSchema),
  page: z.number().optional(),
  totalCount: z.number().optional(),
  totalPages: z.number().optional(),
});
export type SessionsPage = z.infer<typeof sessionsPageSchema>;
