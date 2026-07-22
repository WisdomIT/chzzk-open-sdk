/** 주입 가능한 로거 인터페이스. 기본은 no-op. */
export interface ChzzkLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export const noopLogger: ChzzkLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** 토큰/시크릿을 로그에 남길 때 마스킹한다. 앞 4자만 남긴다. */
export function maskSecret(value: string): string {
  if (value.length <= 4) {
    return '****';
  }
  return `${value.slice(0, 4)}${'*'.repeat(Math.min(value.length - 4, 8))}`;
}

const SENSITIVE_HEADER_NAMES = new Set(['authorization', 'client-secret']);

/** 로그 출력용으로 민감 헤더를 마스킹한 사본을 만든다. */
export function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    masked[key] = SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) ? maskSecret(value) : value;
  }
  return masked;
}
