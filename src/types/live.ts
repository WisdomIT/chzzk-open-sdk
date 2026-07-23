import { z } from 'zod';
import { type CategoryType } from './category.js';

/**
 * Live API 응답 타입.
 * https://chzzk.gitbook.io/chzzk/chzzk-api/live
 */

const categoryTypeValue = z.custom<CategoryType>((value) => typeof value === 'string');

/** GET /open/v1/lives 의 data[] 항목 (시청자 수 높은 순 정렬) */
export const liveSchema = z.looseObject({
  liveId: z.number(),
  liveTitle: z.string(),
  liveThumbnailImageUrl: z.string().nullable(),
  concurrentUserCount: z.number(),
  openDate: z.string(),
  adult: z.boolean(),
  tags: z.array(z.string()),
  /** 카테고리 미설정 방송은 null 가능성 있음 (실측으로 확정) */
  categoryType: categoryTypeValue.nullable(),
  liveCategory: z.string().nullable(),
  liveCategoryValue: z.string().nullable(),
  channelId: z.string(),
  channelName: z.string(),
  channelImageUrl: z.string().nullable(),
});
export type Live = z.infer<typeof liveSchema>;

export const livesPageSchema = z.looseObject({
  data: z.array(liveSchema),
  page: z
    .looseObject({
      /** 다음 목록 호출용 커서. 마지막 페이지면 없거나 null */
      next: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type LivesPage = z.infer<typeof livesPageSchema>;

/** GET /open/v1/streams/key 응답 */
export const streamKeySchema = z.looseObject({
  streamKey: z.string(),
});

/** GET /open/v1/lives/setting 응답 */
export const liveSettingSchema = z.looseObject({
  defaultLiveTitle: z.string(),
  category: z
    .looseObject({
      categoryType: categoryTypeValue.nullable(),
      categoryId: z.string().nullable(),
      categoryValue: z.string().nullable(),
      posterImageUrl: z.string().nullable(),
    })
    .nullable(),
  tags: z.array(z.string()),
});
export type LiveSetting = z.infer<typeof liveSettingSchema>;

/**
 * PATCH /open/v1/lives/setting 요청 body. 모두 optional — 부분 변경 가능.
 * - defaultLiveTitle: 빈 값으로 설정 불가
 * - categoryId: `""` 전송 시 카테고리 설정 제거
 * - tags: 빈 배열 전송 시 태그 설정 제거. 공백·특수문자 비허용
 */
export interface LiveSettingPatch {
  defaultLiveTitle?: string;
  categoryType?: CategoryType;
  categoryId?: string;
  tags?: string[];
}
