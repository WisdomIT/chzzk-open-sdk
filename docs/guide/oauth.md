# OAuth 인증

유저 인증 API(채팅 전송, 방송 설정, 세션 구독 등)는 사용자의 Access Token이 필요합니다.

## 인가 코드 → 토큰

```ts
// 1) 유저를 인가 URL로 리다이렉트
//    redirectUri는 개발자 센터 애플리케이션의 "로그인 리디렉션 URL"과 일치해야 합니다
const url = client.getAuthorizationUrl({
  redirectUri: 'https://your-app.example/callback',
  state: randomState, // CSRF 방지 — 콜백에서 동일 값 확인
});

// 2) 콜백에서 코드 교환
await client.auth.login({ code, state });

// 3) 이후 유저 인증 API는 토큰 걱정 없이 호출
const me = await client.users.me();
```

## 자동 갱신

- Access Token 만료 1일, Refresh Token 만료 30일 (**일회용** — 갱신할 때마다 새 쌍 발급)
- SDK는 만료 60초 전(설정 가능)부터 선제 갱신하고, 401을 받으면 갱신 후 정확히 1회 재시도합니다
- 동시에 여러 요청이 갱신을 트리거해도 하나의 갱신으로 합쳐집니다(single-flight) — 일회용 refresh token이 경합으로 무효화되는 사고를 방지
- Refresh Token까지 만료되면 `ChzzkTokenRefreshError`가 던져집니다 → 재로그인 필요

## TokenStore 영속화

기본 저장소는 프로세스 메모리입니다. 서버 재시작에도 토큰을 유지하려면 `TokenStore`를 구현해 주입하세요:

```ts
import type { TokenStore, ChzzkTokenSet } from 'chzzk-open-sdk';

class DbTokenStore implements TokenStore {
  async get(): Promise<ChzzkTokenSet | null> {
    /* DB에서 로드 */
  }
  async set(tokens: ChzzkTokenSet): Promise<void> {
    /* DB에 저장 */
  }
  async clear(): Promise<void> {
    /* 삭제 */
  }
}

const client = new ChzzkOpenClient({ clientId, clientSecret, tokenStore: new DbTokenStore() });
```

::: warning refresh token은 일회용
갱신 직후 `set`으로 전달되는 새 토큰 묶음을 반드시 영속화하세요. 이전 refresh token은 더 이상 유효하지 않습니다.
:::

## 토큰 폐기

```ts
await client.auth.revoke(); // 동일 clientId+유저로 발급된 모든 토큰이 함께 제거됨
```

## 여러 유저 다루기 (봇 서비스)

`ChzzkOpenClient` 하나는 하나의 유저 토큰 컨텍스트를 가집니다. 여러 스트리머를 담당하는 봇이라면 유저별로 클라이언트(또는 최소한 `tokenStore`)를 분리하세요. 실시간 구독은 [클라이언트 세션 + 유저 토큰 조합](/guide/realtime#세션-인증-방식)으로 하나의 앱이 여러 채널을 구독할 수 있습니다.
