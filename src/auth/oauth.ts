import { requireParam } from '../http/validate.js';

/** 인가 코드 요청은 OPEN API와 다른 도메인을 사용한다. */
export const ACCOUNT_INTERLOCK_URL = 'https://chzzk.naver.com/account-interlock';

export interface AuthorizationUrlParams {
  clientId: string;
  /** 애플리케이션 등록 시 입력한 로그인 리디렉션 URL과 일치해야 한다. */
  redirectUri: string;
  /** CSRF 방지용 임의 문자열. 리다이렉트 응답에서 그대로 돌아온다. */
  state: string;
}

/**
 * 인가 코드 요청 리다이렉트 URL을 만든다.
 * 사용자를 이 URL로 보내면 `redirectUri`로 `code`, `state`가 전달된다.
 * https://chzzk.gitbook.io/chzzk/chzzk-api/authorization
 */
export function buildAuthorizationUrl(params: AuthorizationUrlParams): string {
  const query = new URLSearchParams({
    clientId: requireParam(params.clientId, 'clientId'),
    redirectUri: requireParam(params.redirectUri, 'redirectUri'),
    state: requireParam(params.state, 'state'),
  });
  return `${ACCOUNT_INTERLOCK_URL}?${query.toString()}`;
}
