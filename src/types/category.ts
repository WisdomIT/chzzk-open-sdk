import { z } from 'zod';

/**
 * Category API 응답 타입.
 * https://chzzk.gitbook.io/chzzk/chzzk-api/category
 */

/** 문서 기준 3종. 미래의 미문서 값도 수용하도록 string 확장을 허용한다. */
export const knownCategoryTypes = ['GAME', 'SPORTS', 'ETC'] as const;
export type CategoryType = (typeof knownCategoryTypes)[number] | (string & Record<never, never>);

/** GET /open/v1/categories/search 의 data[] 항목 */
export const categorySchema = z.looseObject({
  categoryType: z.custom<CategoryType>((value) => typeof value === 'string'),
  categoryId: z.string(),
  categoryValue: z.string(),
  posterImageUrl: z.string().nullable(),
});
export type Category = z.infer<typeof categorySchema>;

export const categoriesSearchResponseSchema = z.looseObject({
  data: z.array(categorySchema),
});
