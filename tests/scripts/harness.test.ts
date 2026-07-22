import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseDotEnv } from '../../scripts/lib/env.js';
import { FileTokenStore } from '../../scripts/lib/token-file.js';
import type { ChzzkTokenSet } from '../../src/auth/types.js';

describe('parseDotEnv', () => {
  it('parses KEY=VALUE lines, ignoring comments and blanks', () => {
    const parsed = parseDotEnv(
      [
        '# comment',
        '',
        'CHZZK_CLIENT_ID=abc',
        'CHZZK_CLIENT_SECRET="quo ted"',
        "X='y'",
        'BROKEN',
      ].join('\n'),
    );
    expect(parsed).toEqual({
      CHZZK_CLIENT_ID: 'abc',
      CHZZK_CLIENT_SECRET: 'quo ted',
      X: 'y',
    });
  });
});

describe('FileTokenStore', () => {
  let dir: string;
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function tokenSet(): ChzzkTokenSet {
    return {
      accessToken: 'a',
      refreshToken: 'r',
      tokenType: 'Bearer',
      expiresIn: 86400,
      obtainedAt: Date.now(),
    };
  }

  it('round-trips a token set and clears it', async () => {
    dir = mkdtempSync(join(tmpdir(), 'chzzk-sdk-'));
    const store = new FileTokenStore(join(dir, '.tokens.json'));

    await expect(store.get()).resolves.toBeNull();

    const tokens = tokenSet();
    await store.set(tokens);
    await expect(store.get()).resolves.toEqual(tokens);

    await store.clear();
    await expect(store.get()).resolves.toBeNull();
  });

  it('returns null for corrupt files instead of throwing', async () => {
    dir = mkdtempSync(join(tmpdir(), 'chzzk-sdk-'));
    const path = join(dir, '.tokens.json');
    const store = new FileTokenStore(path);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path, 'not-json');

    await expect(store.get()).resolves.toBeNull();
  });
});
