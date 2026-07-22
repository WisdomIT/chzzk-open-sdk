import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { ChzzkTokenSet, TokenStore } from '../../src/auth/types.js';

export const DEFAULT_TOKEN_FILE = '.tokens.json';

/**
 * 로컬 개발/검증용 파일 TokenStore.
 * `pnpm login`이 저장하고 `pnpm verify`가 읽는다. 파일은 .gitignore 대상.
 * Refresh Token이 일회용이므로 갱신 시마다 즉시 덮어쓴다.
 */
export class FileTokenStore implements TokenStore {
  constructor(private readonly filePath: string = DEFAULT_TOKEN_FILE) {}

  get(): Promise<ChzzkTokenSet | null> {
    if (!existsSync(this.filePath)) {
      return Promise.resolve(null);
    }
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'));
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof (parsed as ChzzkTokenSet).accessToken === 'string' &&
        typeof (parsed as ChzzkTokenSet).refreshToken === 'string'
      ) {
        return Promise.resolve(parsed as ChzzkTokenSet);
      }
      return Promise.resolve(null);
    } catch {
      return Promise.resolve(null);
    }
  }

  set(tokens: ChzzkTokenSet): Promise<void> {
    writeFileSync(this.filePath, `${JSON.stringify(tokens, null, 2)}\n`, { mode: 0o600 });
    return Promise.resolve();
  }

  clear(): Promise<void> {
    if (existsSync(this.filePath)) {
      rmSync(this.filePath);
    }
    return Promise.resolve();
  }
}
