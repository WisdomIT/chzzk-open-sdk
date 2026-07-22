import { z } from 'zod';

/**
 * Restriction API 타입.
 * https://chzzk.gitbook.io/chzzk/chzzk-api/restriction
 *
 * 목록 응답 래핑은 실측(2026-07-22)으로 확정: `{ data: [...], page: { next } }`
 * (문서에는 래핑 표기 없음 — api-notes #17)
 */

/** GET /open/v1/restrict-channels 의 data[] 항목 */
export const restrictedChannelSchema = z.looseObject({
  restrictedChannelId: z.string(),
  restrictedChannelName: z.string(),
  /** 활동 제한 일자 */
  createdDate: z.string(),
  /** 활동 제한 해제 일자 (미해제 시 null 가능성 — 실측 항목 확보 후 확정) */
  releaseDate: z.string().nullable().optional(),
});
export type RestrictedChannel = z.infer<typeof restrictedChannelSchema>;

export const restrictedChannelsPageSchema = z.looseObject({
  data: z.array(restrictedChannelSchema),
  page: z
    .looseObject({
      next: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type RestrictedChannelsPage = z.infer<typeof restrictedChannelsPageSchema>;

/** 임시제한 추가/해제 파라미터. chatChannelId는 세션 CHAT 이벤트에서 얻는다. */
export interface TemporaryRestrictionParams {
  targetChannelId: string;
  chatChannelId: string;
}
