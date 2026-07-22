/**
 * 에러 계층.
 *
 * - `ChzzkError` — SDK의 모든 에러의 베이스
 * - `ChzzkValidationError` — 요청 전 입력 검증 실패 (네트워크 호출 없음)
 * - `ChzzkNetworkError` — fetch 자체가 실패 (DNS, 연결 끊김 등)
 * - `ChzzkApiError` — API가 실패 응답(`{ code, message }`)을 반환
 *   - `ChzzkAuthenticationError` — 401 (UNAUTHORIZED / INVALID_CLIENT / INVALID_TOKEN)
 *   - `ChzzkPermissionError` — 403 (스코프 등 호출 권한 없음)
 *   - `ChzzkRateLimitError` — 429 (Quota 초과, `retryAfterSeconds` 포함 가능)
 *
 * 에러 코드 규격: https://chzzk.gitbook.io/chzzk/chzzk-api/tips#error-code
 */

export class ChzzkError extends Error {
  override name = 'ChzzkError';
}

/** 요청을 보내기 전에 SDK가 잡아낸 잘못된 입력. */
export class ChzzkValidationError extends ChzzkError {
  override name = 'ChzzkValidationError';
}

/** fetch 레벨 실패. 원인은 `cause`로 전달된다. */
export class ChzzkNetworkError extends ChzzkError {
  override name = 'ChzzkNetworkError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export interface ChzzkApiErrorDetails {
  /** HTTP 상태 코드 */
  status: number;
  /** API 실패 응답의 `message` 필드 (없으면 null) */
  apiMessage: string | null;
  method: string;
  path: string;
}

export class ChzzkApiError extends ChzzkError {
  override name = 'ChzzkApiError';

  readonly status: number;
  readonly apiMessage: string | null;
  readonly method: string;
  readonly path: string;

  constructor(details: ChzzkApiErrorDetails) {
    super(
      `CHZZK API error ${details.status} on ${details.method} ${details.path}` +
        (details.apiMessage !== null ? `: ${details.apiMessage}` : ''),
    );
    this.status = details.status;
    this.apiMessage = details.apiMessage;
    this.method = details.method;
    this.path = details.path;
  }
}

/** 401 — 인증 정보 없음/비정상/만료. 토큰 갱신 트리거로 사용된다. */
export class ChzzkAuthenticationError extends ChzzkApiError {
  override name = 'ChzzkAuthenticationError';
}

/** 403 — 호출 권한(스코프) 없음. */
export class ChzzkPermissionError extends ChzzkApiError {
  override name = 'ChzzkPermissionError';
}

/** 429 — Quota 제한 초과. */
export class ChzzkRateLimitError extends ChzzkApiError {
  override name = 'ChzzkRateLimitError';

  /** `Retry-After` 헤더 값(초). 헤더가 없으면 undefined. */
  readonly retryAfterSeconds: number | undefined;

  constructor(details: ChzzkApiErrorDetails, retryAfterSeconds?: number) {
    super(details);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** HTTP 상태에 맞는 에러 클래스를 골라 생성한다. */
export function createApiError(
  details: ChzzkApiErrorDetails,
  retryAfterSeconds?: number,
): ChzzkApiError {
  switch (details.status) {
    case 401:
      return new ChzzkAuthenticationError(details);
    case 403:
      return new ChzzkPermissionError(details);
    case 429:
      return new ChzzkRateLimitError(details, retryAfterSeconds);
    default:
      return new ChzzkApiError(details);
  }
}
