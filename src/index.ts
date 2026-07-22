/**
 * chzzk-open-sdk
 *
 * TypeScript SDK for the official CHZZK Open API (https://openapi.chzzk.naver.com).
 * Official endpoints only — no unofficial/internal APIs.
 */

export {
  ChzzkError,
  ChzzkValidationError,
  ChzzkNetworkError,
  ChzzkApiError,
  ChzzkAuthenticationError,
  ChzzkPermissionError,
  ChzzkRateLimitError,
  type ChzzkApiErrorDetails,
} from './errors.js';

export {
  HttpClient,
  DEFAULT_BASE_URL,
  type HttpClientOptions,
  type HttpRequestOptions,
  type HttpMethod,
  type QueryValue,
  type RetryOptions,
} from './http/client.js';

export { noopLogger, maskSecret, type ChzzkLogger } from './http/logger.js';

export { paginateByPage, paginateByCursor, type CursorPage } from './http/pagination.js';
