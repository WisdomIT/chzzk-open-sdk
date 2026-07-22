import type { ZodType } from 'zod';
import { TokenManager } from '../../src/auth/manager.js';
import { AuthClient } from '../../src/auth/client.js';
import { HttpClient } from '../../src/http/client.js';
import { loadDotEnv, readCredentialEnv } from '../lib/env.js';
import { FileTokenStore } from '../lib/token-file.js';

/** 검증 스크립트 공용 컨텍스트. 자격증명 없는 항목은 SKIP 처리된다. */
export interface VerifyContext {
  http: HttpClient;
  /** Client 인증 가능 여부 (CHZZK_CLIENT_ID/SECRET) */
  clientId: string | undefined;
  clientSecret: string | undefined;
  /** 유저 토큰 존재 시에만 설정 (pnpm login으로 발급) */
  tokenManager: TokenManager | undefined;
}

export type CheckRequirement = 'client' | 'user' | 'both';

export interface VerifyCheck {
  /** docs/api-notes.md와 매칭되는 이름 (예: "GET /open/v1/users/me") */
  name: string;
  requires: CheckRequirement;
  run(ctx: VerifyContext): Promise<CheckOutcome>;
}

export interface CheckOutcome {
  /** 문서 대비 초과 수신된 필드 (경고) */
  extraFields?: string[];
  note?: string;
}

export async function createContext(): Promise<VerifyContext> {
  loadDotEnv();
  const env = readCredentialEnv();
  const http = new HttpClient();

  let tokenManager: TokenManager | undefined;
  if (env.clientId !== undefined && env.clientSecret !== undefined) {
    const store = new FileTokenStore();
    if ((await store.get()) !== null) {
      tokenManager = new TokenManager({
        authClient: new AuthClient({
          clientId: env.clientId,
          clientSecret: env.clientSecret,
          http,
        }),
        store,
      });
    }
  }

  return { http, clientId: env.clientId, clientSecret: env.clientSecret, tokenManager };
}

/**
 * 응답을 문서 기반 zod 스키마(loose)로 파싱하고,
 * 문서에 없는 초과 필드를 수집한다 (검증 절차 5항: 관용 파싱 + 경고).
 */
export function checkSchema<T extends Record<string, unknown>>(
  schema: ZodType<T>,
  raw: unknown,
  documentedKeys: readonly string[],
): { parsed: T; extraFields: string[] } {
  const parsed = schema.parse(raw);
  const extraFields =
    typeof raw === 'object' && raw !== null
      ? Object.keys(raw).filter((key) => !documentedKeys.includes(key))
      : [];
  return { parsed, extraFields };
}

export async function runChecks(checks: readonly VerifyCheck[]): Promise<void> {
  const ctx = await createContext();
  let failed = 0;

  console.log('=== chzzk-open-sdk 문서-실제 검증 ===\n');
  if (ctx.clientId === undefined) {
    console.log('ℹ️  CHZZK_CLIENT_ID/SECRET 미설정 → Client 인증 검증은 SKIP됩니다.');
  }
  if (ctx.tokenManager === undefined) {
    console.log(
      'ℹ️  유저 토큰 없음(.tokens.json) → `pnpm login`으로 발급하면 유저 검증이 활성화됩니다.',
    );
  }
  console.log('');

  for (const check of checks) {
    const needsClient = check.requires === 'client' || check.requires === 'both';
    const needsUser = check.requires === 'user' || check.requires === 'both';
    const skipReason =
      needsClient && ctx.clientId === undefined
        ? 'Client 자격증명 없음'
        : needsUser && ctx.tokenManager === undefined
          ? '유저 토큰 없음'
          : null;

    if (skipReason !== null) {
      console.log(`⏭️  SKIP  ${check.name} — ${skipReason} (검증 보류 🟡)`);
      continue;
    }

    try {
      const outcome = await check.run(ctx);
      const extras =
        outcome.extraFields !== undefined && outcome.extraFields.length > 0
          ? ` ⚠️ 문서에 없는 필드: ${outcome.extraFields.join(', ')}`
          : '';
      const note = outcome.note !== undefined ? ` (${outcome.note})` : '';
      console.log(`✅ PASS  ${check.name}${note}${extras}`);
    } catch (error) {
      failed += 1;
      console.log(`❌ FAIL  ${check.name}`);
      console.log(`   ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log('');
  if (failed > 0) {
    console.log(`❌ ${failed}건 실패 — 문서-실제 불일치 발견 시 docs/api-notes.md 갱신 필요`);
    process.exitCode = 1;
  } else {
    console.log('✅ 실행된 검증 모두 통과');
  }
}
