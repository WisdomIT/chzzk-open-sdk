/**
 * 예제 1 — OAuth 로그인 흐름과 내 채널 정보 조회.
 *
 * 실행: pnpm exec tsx examples/01-login-and-me.ts
 * 사전 준비: pnpm login (브라우저 로그인으로 .tokens.json 발급)
 */
import { createExampleClient } from './_shared.js';

const client = createExampleClient();

// 1) 신규 로그인이 필요한 경우의 인가 URL (서버라면 이 URL로 redirect)
const authorizationUrl = client.getAuthorizationUrl({
  redirectUri: 'http://localhost:4989/callback',
  state: 'random-state-string',
});
console.log('인가 URL 예시:', authorizationUrl);
// 콜백에서: await client.auth.login({ code, state })
// → 토큰이 tokenStore에 저장되고, 이후 만료 시 자동 갱신된다.

// 2) 저장된 토큰으로 내 채널 정보 조회
const me = await client.users.me();
console.log('내 채널:', me.channelName, `(${me.channelId})`);
console.log('닉네임(문서에 없는 실측 필드):', me.nickname);
