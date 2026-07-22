import type { TokenManager } from '../auth/manager.js';
import type { HttpClient } from '../http/client.js';
import type { ChzzkLogger } from '../http/logger.js';

/** 리소스 모듈이 공유하는 의존성 묶음. ChzzkOpenClient가 주입한다. */
export interface ResourceDeps {
  http: HttpClient;
  /** 유저 인증(Access Token) API용. 토큰 미보유 시 해당 메서드 호출에서 에러. */
  tokenManager: TokenManager;
  /** Client 인증 API용 헤더 */
  clientAuthHeaders: Record<string, string>;
  logger: ChzzkLogger;
}
