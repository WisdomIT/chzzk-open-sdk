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

export {
  InMemoryTokenStore,
  isTokenExpired,
  type ChzzkTokenSet,
  type TokenStore,
} from './auth/types.js';

export { bearerHeaders, clientHeaders } from './auth/headers.js';

export {
  ACCOUNT_INTERLOCK_URL,
  buildAuthorizationUrl,
  type AuthorizationUrlParams,
} from './auth/oauth.js';

export {
  AuthClient,
  type AuthClientOptions,
  type IssueTokenParams,
  type TokenTypeHint,
} from './auth/client.js';

export { TokenManager, ChzzkTokenRefreshError, type TokenManagerOptions } from './auth/manager.js';
