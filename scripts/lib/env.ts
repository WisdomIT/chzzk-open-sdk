import { readFileSync } from 'node:fs';

/**
 * 아주 작은 .env 로더 (의존성 최소화 원칙 — dotenv 미사용).
 * KEY=VALUE 형식만 지원, `#` 주석·빈 줄 무시, 이미 설정된 process.env는 덮어쓰지 않는다.
 */
export function parseDotEnv(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export function loadDotEnv(path = '.env'): void {
  let source: string;
  try {
    source = readFileSync(path, 'utf8');
  } catch {
    return; // .env 없으면 조용히 무시 (환경변수 직접 주입 케이스)
  }
  for (const [key, value] of Object.entries(parseDotEnv(source))) {
    process.env[key] ??= value;
  }
}

export interface CredentialEnv {
  clientId: string | undefined;
  clientSecret: string | undefined;
  redirectUri: string;
}

export function readCredentialEnv(): CredentialEnv {
  return {
    clientId: process.env.CHZZK_CLIENT_ID,
    clientSecret: process.env.CHZZK_CLIENT_SECRET,
    redirectUri: process.env.CHZZK_REDIRECT_URI ?? 'http://localhost:4989/callback',
  };
}
