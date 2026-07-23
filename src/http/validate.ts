import { ChzzkValidationError } from '../errors.js';

/** 필수 파라미터 누락 시 요청 전에 명확한 에러를 던진다. */
export function requireParam<T>(value: T | undefined | null, name: string): T {
  if (value === undefined || value === null || (typeof value === 'string' && value === '')) {
    throw new ChzzkValidationError(`"${name}" is required`);
  }
  return value;
}

/** 숫자 파라미터의 범위를 검증한다. undefined는 통과(옵션 파라미터). */
export function requireRange(
  value: number | undefined,
  name: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ChzzkValidationError(`"${name}" must be an integer between ${min} and ${max}`);
  }
  return value;
}

/** 배열 파라미터의 길이 상한을 검증한다. */
export function requireMaxLength<T>(value: readonly T[], name: string, max: number): readonly T[] {
  if (value.length === 0) {
    throw new ChzzkValidationError(`"${name}" must not be empty`);
  }
  if (value.length > max) {
    throw new ChzzkValidationError(`"${name}" accepts at most ${max} items`);
  }
  return value;
}
