import { parseLenient } from '../http/parse.js';
import { requireParam, requireRange } from '../http/validate.js';
import { categoriesSearchResponseSchema, type Category } from '../types/category.js';
import type { ResourceDeps } from './shared.js';

export interface CategorySearchParams {
  /** 검색할 카테고리 이름. 해당 값을 포함하는 카테고리 목록 반환. */
  query: string;
  /** 1~50. 기본 20 */
  size?: number;
}

/**
 * Category 리소스.
 * https://chzzk.gitbook.io/chzzk/chzzk-api/category
 */
export class CategoryResource {
  constructor(private readonly deps: ResourceDeps) {}

  /** 카테고리 검색 — `GET /open/v1/categories/search` 〔Client 인증〕 */
  async search(params: CategorySearchParams): Promise<Category[]> {
    requireParam(params.query, 'query');
    requireRange(params.size, 'size', 1, 50);
    const raw = await this.deps.http.request<unknown>({
      method: 'GET',
      path: '/open/v1/categories/search',
      query: { query: params.query, size: params.size },
      headers: this.deps.clientAuthHeaders,
    });
    return parseLenient(
      categoriesSearchResponseSchema,
      raw,
      this.deps.logger,
      'GET /open/v1/categories/search',
    ).data;
  }
}
