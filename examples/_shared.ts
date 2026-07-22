/**
 * 예제 공용 부트스트랩.
 *
 * 저장소 안에서 바로 실행할 수 있도록 SDK를 상대 경로로 import한다.
 * 실제 프로젝트에서는 `import { ChzzkOpenClient } from 'chzzk-open-sdk'` 로 바꾸면 된다.
 *
 * 자격증명 준비:
 *   1. `cp .env.example .env` 후 CHZZK_CLIENT_ID / CHZZK_CLIENT_SECRET 입력
 *   2. 유저 토큰이 필요한 예제는 먼저 `pnpm login` (docs/verification.md 참조)
 */
import { ChzzkOpenClient } from '../src/index.js';
import { loadDotEnv, readCredentialEnv } from '../scripts/lib/env.js';
import { FileTokenStore } from '../scripts/lib/token-file.js';

export function createExampleClient(): ChzzkOpenClient {
  loadDotEnv();
  const env = readCredentialEnv();
  if (env.clientId === undefined || env.clientSecret === undefined) {
    console.error(
      '❌ .env에 CHZZK_CLIENT_ID / CHZZK_CLIENT_SECRET을 설정하세요. (.env.example 참조)',
    );
    process.exit(1);
  }
  return new ChzzkOpenClient({
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    // 로컬 파일 저장소 — pnpm login이 발급한 토큰을 재사용하고,
    // 자동 갱신된 토큰도 파일에 다시 저장된다 (refresh token은 일회용).
    tokenStore: new FileTokenStore(),
    logger: {
      debug: () => undefined,
      info: (msg) => console.log('[info]', msg),
      warn: (msg) => console.warn('[warn]', msg),
      error: (msg) => console.error('[error]', msg),
    },
  });
}
