/**
 * 토큰 갱신 응답의 "원시" 타입 실측 (docs/api-notes.md #2, #3).
 *
 * AuthClient는 expiresIn을 정규화해 버리므로, 여기서는 raw fetch로
 * 갱신 응답의 실제 JSON 타입을 관찰한다. 값 자체는 출력하지 않는다(마스킹).
 *
 * ⚠️ Refresh Token을 1회 소모(회전)한다 — 새 토큰 묶음은 .tokens.json에 저장됨.
 *
 * 사용법: pnpm verify:token
 */
import { DEFAULT_BASE_URL } from '../../src/http/client.js';
import type { ChzzkTokenSet } from '../../src/auth/types.js';
import { loadDotEnv, readCredentialEnv } from '../lib/env.js';
import { FileTokenStore } from '../lib/token-file.js';

loadDotEnv();
const env = readCredentialEnv();
if (env.clientId === undefined || env.clientSecret === undefined) {
  console.error('❌ .env에 CHZZK_CLIENT_ID / CHZZK_CLIENT_SECRET이 필요합니다.');
  process.exit(1);
}

const store = new FileTokenStore();
const current = await store.get();
if (current === null) {
  console.error('❌ .tokens.json 없음 — 먼저 `pnpm login`을 실행하세요.');
  process.exit(1);
}

const response = await fetch(`${DEFAULT_BASE_URL}/auth/v1/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grantType: 'refresh_token',
    refreshToken: current.refreshToken,
    clientId: env.clientId,
    clientSecret: env.clientSecret,
  }),
});

const envelope: unknown = await response.json();
console.log(`HTTP ${response.status}`);
if (typeof envelope !== 'object' || envelope === null) {
  console.error('❌ 응답이 JSON 객체가 아닙니다.');
  process.exit(1);
}

const { code, content } = envelope as { code?: unknown; content?: unknown };
console.log(
  `envelope.code: ${JSON.stringify(code)} / envelope keys: ${Object.keys(envelope).join(', ')}`,
);

if (typeof content !== 'object' || content === null) {
  console.error('❌ content가 없습니다. 전체 envelope 구조를 확인하세요.');
  process.exit(1);
}

const record = content as Record<string, unknown>;
console.log('--- 갱신 응답(content) 실측 ---');
console.log(`keys: ${Object.keys(record).join(', ')}`);
for (const key of ['accessToken', 'refreshToken', 'tokenType', 'expiresIn', 'scope'] as const) {
  const value = record[key];
  const detail =
    key === 'expiresIn' || key === 'tokenType' || key === 'scope'
      ? ` (value: ${JSON.stringify(value)})` // 민감하지 않은 필드만 값 출력
      : '';
  console.log(`  ${key}: ${key in record ? typeof value : '(없음)'}${detail}`);
}

// 회전된 토큰 저장 (expiresIn 정규화)
const expiresInRaw = record.expiresIn;
const expiresIn =
  typeof expiresInRaw === 'number'
    ? expiresInRaw
    : Number(typeof expiresInRaw === 'string' ? expiresInRaw : NaN);
const rotated: ChzzkTokenSet = {
  accessToken: String(record.accessToken),
  refreshToken: String(record.refreshToken),
  tokenType: typeof record.tokenType === 'string' ? record.tokenType : 'Bearer',
  expiresIn: Number.isFinite(expiresIn) ? expiresIn : 86400,
  obtainedAt: Date.now(),
};
if (typeof record.scope === 'string') {
  rotated.scope = record.scope;
}
await store.set(rotated);
console.log('✅ 회전된 토큰을 .tokens.json에 저장했습니다.');
