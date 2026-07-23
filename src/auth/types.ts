/**
 * 발급된 토큰 묶음.
 * `expiresIn`은 문서상 String("86400")이지만 SDK는 number(초)로 정규화한다.
 * (docs/api-notes.md #2 참조)
 */
export interface ChzzkTokenSet {
  accessToken: string;
  refreshToken: string;
  /** "Bearer" 고정 */
  tokenType: string;
  /** 액세스 토큰 유효기간(초) */
  expiresIn: number;
  /** 갱신 응답에만 문서화되어 있어 optional (docs/api-notes.md #3) */
  scope?: string;
  /** SDK가 토큰을 받은 시각(epoch ms). 만료 계산에 사용. */
  obtainedAt: number;
}

/**
 * 토큰 저장/주입 인터페이스.
 * Refresh Token은 일회용이므로, 갱신 직후 `set`으로 전달되는 새 토큰 묶음을
 * 반드시 영속화해야 한다 (DB 등 외부 저장소 구현 시 특히 주의).
 */
export interface TokenStore {
  get(): Promise<ChzzkTokenSet | null>;
  set(tokens: ChzzkTokenSet): Promise<void>;
  clear(): Promise<void>;
}

/** 기본 구현: 프로세스 메모리에만 보관. */
export class InMemoryTokenStore implements TokenStore {
  private tokens: ChzzkTokenSet | null = null;

  get(): Promise<ChzzkTokenSet | null> {
    return Promise.resolve(this.tokens);
  }

  set(tokens: ChzzkTokenSet): Promise<void> {
    this.tokens = tokens;
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.tokens = null;
    return Promise.resolve();
  }
}

/** 토큰 만료(임박) 여부. skewSeconds만큼 이르게 만료로 간주한다. */
export function isTokenExpired(
  tokens: Pick<ChzzkTokenSet, 'expiresIn' | 'obtainedAt'>,
  skewSeconds: number,
  now: number = Date.now(),
): boolean {
  return tokens.obtainedAt + (tokens.expiresIn - skewSeconds) * 1000 <= now;
}
