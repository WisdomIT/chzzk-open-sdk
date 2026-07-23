import { z } from 'zod';

/**
 * Drops API 타입.
 * https://chzzk.gitbook.io/chzzk/chzzk-api/drops
 *
 * ⚠️ 드롭스 API Scope는 법인 인증 단체 ID만 신청 가능 — 실측 검증 보류
 * (docs/api-notes.md #18, #19. 스코프 없이 호출 시 403 "드롭스 스코프가 필요합니다.")
 */

export const knownFulfillmentStates = ['CLAIMED', 'FULFILLED'] as const;
export type FulfillmentState =
  (typeof knownFulfillmentStates)[number] | (string & Record<never, never>);

/** GET /open/v1/drops/reward-claims 의 data[] 항목 */
export const dropsRewardClaimSchema = z.looseObject({
  claimId: z.string(),
  campaignId: z.string(),
  rewardId: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  channelId: z.string(),
  fulfillmentState: z.custom<FulfillmentState>((value) => typeof value === 'string'),
  /** RFC3339 UTC (문서 예시: "2024-08-01T09:20:26Z") */
  claimedDate: z.string(),
  updatedDate: z.string(),
});
export type DropsRewardClaim = z.infer<typeof dropsRewardClaimSchema>;

export const dropsRewardClaimsPageSchema = z.looseObject({
  data: z.array(dropsRewardClaimSchema),
  page: z
    .looseObject({
      /** 다음 조회의 page.from으로 사용. claimId 지정 조회 시 없거나 빈 문자열 가능 */
      cursor: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type DropsRewardClaimsPage = z.infer<typeof dropsRewardClaimsPageSchema>;

/** PUT /open/v1/drops/reward-claims 응답의 data[] 항목 */
export const knownRewardClaimUpdateStatuses = [
  'SUCCESS',
  'INVALID_ID',
  'NOT_FOUND',
  'UNAUTHORIZED', // 문서 표기는 "UNAUTHORIZ ED" 오타 — UNAUTHORIZED로 구현 (api-notes #19)
  'UPDATE_FAILED',
] as const;
export type RewardClaimUpdateStatus =
  (typeof knownRewardClaimUpdateStatuses)[number] | (string & Record<never, never>);

export const dropsUpdateResultSchema = z.looseObject({
  data: z.array(
    z.looseObject({
      status: z.custom<RewardClaimUpdateStatus>((value) => typeof value === 'string'),
      ids: z.array(z.string()),
    }),
  ),
});
export type DropsUpdateResult = z.infer<typeof dropsUpdateResultSchema>;
