import {
  ChzzkApiError,
  ChzzkNetworkError,
  ChzzkValidationError,
  createApiError,
} from '../errors.js';
import { maskHeaders, noopLogger, type ChzzkLogger } from './logger.js';

export const DEFAULT_BASE_URL = 'https://openapi.chzzk.naver.com';

/**
 * API 공통 응답 구조.
 * 성공: `{ code: 200, message: null, content: {...} }`
 * 실패: `{ code: <int>, message: <string> }`
 * https://chzzk.gitbook.io/chzzk/chzzk-api/tips#api
 */
interface ResponseEnvelope {
  code?: unknown;
  message?: unknown;
  content?: unknown;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryValue = string | number | boolean | readonly (string | number)[] | undefined;

export interface HttpRequestOptions {
  method: HttpMethod;
  path: string;
  headers?: Record<string, string>;
  /** undefined 값은 생략, 배열은 콤마로 조인된다 (예: channelIds). */
  query?: Record<string, QueryValue>;
  /** JSON으로 직렬화되어 전송된다. */
  body?: unknown;
  /** 이 요청에 한해 재시도를 끈다 (기본은 클라이언트 설정을 따름). */
  retry?: boolean;
}

export interface RetryOptions {
  /** 429 재시도 여부. 기본 true. */
  enabled?: boolean;
  /** 최대 재시도 횟수(최초 시도 제외). 기본 2. */
  maxRetries?: number;
  /** Retry-After 헤더가 없을 때 지수 백오프의 기본 지연(ms). 기본 1000. */
  baseDelayMs?: number;
  /** 지연 상한(ms). 기본 30000. */
  maxDelayMs?: number;
}

export interface HttpClientOptions {
  baseUrl?: string;
  /** 테스트/커스텀 런타임용 fetch 주입. 기본은 globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  logger?: ChzzkLogger;
  retry?: RetryOptions;
}

interface ResolvedRetryOptions {
  enabled: boolean;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildQueryString(query: Record<string, QueryValue> | undefined): string {
  if (!query) {
    return '';
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const serialized = params.toString();
  return serialized === '' ? '' : `?${serialized}`;
}

function parseRetryAfterSeconds(response: Response): number | undefined {
  const header = response.headers.get('Retry-After');
  if (header === null) {
    return undefined;
  }
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/**
 * fetch 래퍼. 공통 응답 구조 언랩, 에러 매핑, 429 재시도를 담당한다.
 * 인증 헤더는 상위 계층(auth/리소스)이 `headers`로 주입한다.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly logger: ChzzkLogger;
  private readonly retry: ResolvedRetryOptions;

  constructor(options: HttpClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.logger = options.logger ?? noopLogger;
    this.retry = {
      enabled: options.retry?.enabled ?? true,
      maxRetries: options.retry?.maxRetries ?? 2,
      baseDelayMs: options.retry?.baseDelayMs ?? 1000,
      maxDelayMs: options.retry?.maxDelayMs ?? 30000,
    };
    if (typeof this.fetchFn !== 'function') {
      throw new ChzzkValidationError(
        'fetch is not available in this runtime. Node.js 18+ or a fetch polyfill is required.',
      );
    }
  }

  /** 성공 응답의 `content`를 T로 반환한다. content가 없는 200 응답은 null을 반환한다. */
  async request<T>(options: HttpRequestOptions): Promise<T> {
    const url = `${this.baseUrl}${options.path}${buildQueryString(options.query)}`;
    const headers: Record<string, string> = { ...options.headers };
    if (options.body !== undefined && headers['Content-Type'] === undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const init: RequestInit = { method: options.method, headers };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    const retryEnabled = this.retry.enabled && (options.retry ?? true);
    const maxAttempts = retryEnabled ? this.retry.maxRetries + 1 : 1;

    for (let attempt = 1; ; attempt += 1) {
      this.logger.debug(
        `chzzk-open-sdk request ${options.method} ${options.path} (attempt ${attempt}/${maxAttempts})`,
        maskHeaders(headers),
      );

      let response: Response;
      try {
        response = await this.fetchFn(url, init);
      } catch (cause) {
        throw new ChzzkNetworkError(`Network request failed: ${options.method} ${options.path}`, {
          cause,
        });
      }

      if (response.status === 429 && attempt < maxAttempts) {
        const retryAfterSeconds = parseRetryAfterSeconds(response);
        const delayMs = Math.min(
          retryAfterSeconds !== undefined
            ? retryAfterSeconds * 1000
            : this.retry.baseDelayMs * 2 ** (attempt - 1),
          this.retry.maxDelayMs,
        );
        this.logger.warn(
          `chzzk-open-sdk 429 TOO_MANY_REQUESTS on ${options.method} ${options.path}; retrying in ${delayMs}ms`,
        );
        await sleep(delayMs);
        continue;
      }

      return this.handleResponse<T>(response, options);
    }
  }

  private async handleResponse<T>(response: Response, options: HttpRequestOptions): Promise<T> {
    let parsed: unknown = null;
    const text = await response.text();
    if (text !== '') {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }

    const envelope: ResponseEnvelope = typeof parsed === 'object' && parsed !== null ? parsed : {};

    if (!response.ok) {
      const apiMessage = typeof envelope.message === 'string' ? envelope.message : null;
      throw createApiError(
        {
          status: response.status,
          apiMessage,
          method: options.method,
          path: options.path,
        },
        parseRetryAfterSeconds(response),
      );
    }

    // HTTP 200이지만 envelope의 code가 200이 아닌 방어적 케이스
    if (typeof envelope.code === 'number' && envelope.code !== 200) {
      const apiMessage = typeof envelope.message === 'string' ? envelope.message : null;
      throw new ChzzkApiError({
        status: envelope.code,
        apiMessage,
        method: options.method,
        path: options.path,
      });
    }

    if ('content' in envelope) {
      return envelope.content as T;
    }

    // 문서화된 공통 구조와 다른 응답 — 죽지 않고 그대로 반환하되 경고를 남긴다.
    if (parsed !== null) {
      this.logger.warn(
        `chzzk-open-sdk unexpected response shape on ${options.method} ${options.path}: missing "content" envelope`,
      );
    }
    return parsed as T;
  }
}
