import type { ZodType } from 'zod';
import type { ChzzkLogger } from './logger.js';

/**
 * 응답을 문서+실측 기반 스키마로 관용 파싱한다.
 *
 * 스키마 불일치(필드 누락·타입 변화)가 나도 죽지 않고 경고 후 원본을 반환한다 —
 * SDK가 API 변화로 소비자를 중단시키지 않기 위함. 불일치는 검증 하니스
 * (`pnpm verify`)에서 잡아 docs/api-notes.md에 기록한다.
 */
export function parseLenient<T>(
  schema: ZodType<T>,
  raw: unknown,
  logger: ChzzkLogger,
  context: string,
): T {
  const result = schema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  logger.warn(
    `chzzk-open-sdk response schema mismatch on ${context}: ${result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')}`,
  );
  return raw as T;
}
