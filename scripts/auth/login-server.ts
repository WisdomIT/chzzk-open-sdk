/**
 * 유저 토큰 발급용 로컬 로그인 서버.
 *
 * 사용법:
 *   1. .env에 CHZZK_CLIENT_ID / CHZZK_CLIENT_SECRET 설정
 *      (개발자 센터 애플리케이션의 로그인 리디렉션 URL에
 *       http://localhost:4989/callback 을 등록해야 한다)
 *   2. pnpm login
 *   3. 브라우저에서 http://localhost:4989 열고 "치지직으로 로그인"
 *   4. 성공하면 토큰이 .tokens.json 에 저장됨 → pnpm verify 실행 가능
 */
import { randomUUID } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import { AuthClient } from '../../src/auth/client.js';
import { buildAuthorizationUrl } from '../../src/auth/oauth.js';
import { HttpClient } from '../../src/http/client.js';
import { maskSecret } from '../../src/http/logger.js';
import { loadDotEnv, readCredentialEnv } from '../lib/env.js';
import { DEFAULT_TOKEN_FILE, FileTokenStore } from '../lib/token-file.js';

loadDotEnv();
const env = readCredentialEnv();

if (env.clientId === undefined || env.clientSecret === undefined) {
  console.error(
    '❌ .env에 CHZZK_CLIENT_ID / CHZZK_CLIENT_SECRET을 설정하세요. (.env.example 참조)',
  );
  process.exit(1);
}
const clientId = env.clientId;
const clientSecret = env.clientSecret;

const redirect = new URL(env.redirectUri);
const port = Number(redirect.port !== '' ? redirect.port : 80);
const callbackPath = redirect.pathname;

const authClient = new AuthClient({ clientId, clientSecret, http: new HttpClient() });
const store = new FileTokenStore();
const issuedStates = new Set<string>();

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>chzzk-open-sdk 로그인</title>
<style>body{font-family:sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;line-height:1.6}
a.btn{display:inline-block;padding:.7rem 1.4rem;background:#00e2a1;color:#000;border-radius:.5rem;
text-decoration:none;font-weight:700}code{background:#eee;padding:.15rem .35rem;border-radius:.25rem}</style>
</head><body>${body}</body></html>`);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);

  if (url.pathname === '/') {
    const state = randomUUID();
    issuedStates.add(state);
    const authUrl = buildAuthorizationUrl({ clientId, redirectUri: env.redirectUri, state });
    html(
      res,
      200,
      `<h1>chzzk-open-sdk 검증용 로그인</h1>
<p>아래 버튼을 누르면 치지직 로그인/동의 화면으로 이동합니다.<br>
완료되면 토큰이 로컬 파일 <code>${DEFAULT_TOKEN_FILE}</code>에 저장됩니다 (git에 커밋되지 않음).</p>
<p><a class="btn" href="${authUrl}">치지직으로 로그인</a></p>`,
    );
    return;
  }

  if (url.pathname === callbackPath) {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (code === null || state === null || !issuedStates.has(state)) {
      html(
        res,
        400,
        `<h1>❌ 잘못된 콜백</h1><p>code/state가 없거나 state가 일치하지 않습니다. 처음부터 다시 시도하세요.</p>`,
      );
      return;
    }
    issuedStates.delete(state);

    authClient
      .issueToken({ code, state })
      .then(async (tokens) => {
        await store.set(tokens);
        console.log('✅ 토큰 발급 완료 →', DEFAULT_TOKEN_FILE);
        console.log(
          `   accessToken: ${maskSecret(tokens.accessToken)} (expiresIn ${tokens.expiresIn}s)`,
        );
        html(
          res,
          200,
          `<h1>✅ 토큰 발급 완료</h1>
<p><code>${DEFAULT_TOKEN_FILE}</code>에 저장했습니다.</p>
<ul><li>accessToken: <code>${maskSecret(tokens.accessToken)}</code></li>
<li>expiresIn: <code>${tokens.expiresIn}s</code> / scope: <code>${tokens.scope ?? '(응답에 없음)'}</code></li></ul>
<p>이제 터미널에서 <code>pnpm verify</code>를 실행하세요. 이 서버는 종료해도 됩니다 (Ctrl+C).</p>`,
        );
      })
      .catch((error: unknown) => {
        console.error('❌ 토큰 교환 실패:', error);
        html(
          res,
          500,
          `<h1>❌ 토큰 교환 실패</h1><pre>${error instanceof Error ? error.message : String(error)}</pre>
<p>터미널 로그를 확인하세요.</p>`,
        );
      });
    return;
  }

  html(res, 404, '<h1>404</h1>');
});

server.listen(port, () => {
  console.log(`🔑 로그인 서버 시작: http://localhost:${port}`);
  console.log(`   redirectUri: ${env.redirectUri}`);
  console.log('   (개발자 센터 애플리케이션의 로그인 리디렉션 URL과 일치해야 합니다)');
});
