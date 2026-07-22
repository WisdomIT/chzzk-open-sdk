import { z } from 'zod';

/**
 * GET /open/v1/users/me 응답.
 * https://chzzk.gitbook.io/chzzk/chzzk-api/user
 *
 * `nickname`은 문서에 없지만 실측(2026-07-22)으로 확인된 필드
 * (docs/api-notes.md #23). loose 스키마이므로 그 외 미문서 필드도 보존된다.
 */
export const userMeSchema = z.looseObject({
  channelId: z.string(),
  channelName: z.string(),
  nickname: z.string(),
});

export type UserMe = z.infer<typeof userMeSchema>;
