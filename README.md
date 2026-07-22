# chzzk-open-sdk

네이버 치지직(CHZZK) **공식 OPEN API** 전용 TypeScript SDK.

> **이 SDK는 [공식 OPEN API](https://chzzk.gitbook.io/chzzk)(`openapi.chzzk.naver.com`)만 지원하며, 문서에 없는 비공식·내부 엔드포인트는 포함하지 않습니다.**

## 왜 이 SDK인가

- ✅ **공식 스펙만, 전부** — 공식 문서의 REST 엔드포인트 31개 100% 커버, 비공식 엔드포인트 0건
- ✅ **문서를 맹신하지 않음** — 모든 엔드포인트를 실제 응답으로 검증하고, 문서와 다른 실제를 [docs/api-notes.md](docs/api-notes.md)에 기록 (35건 추적, 예: `expiresIn`은 문서와 달리 number, CHAT 이벤트의 `userRoleCode`는 `profile` 내부, 응답에만 존재하는 미문서 페이지 메타 등). **타입은 실제 응답 우선**
- ✅ **타입 안전** — strict TypeScript, 모든 요청/응답 타입 제공, 응답은 zod 스키마로 관용 파싱(미문서 필드가 와도 죽지 않음)
- ✅ **OAuth 자동 관리** — 만료 임박 선제 갱신, 401 시 갱신 후 1회 재시도, 일회용 refresh token의 동시 갱신 경합 방지(single-flight)
- ✅ **실시간 이벤트** — 공식 세션 API 기반 chat/donation/subscription 정규화 스트림. **의존성 0의 자체 socket.io v2(EIO=3) 클라이언트** (WebSocket 우선, fetch 폴링 폴백), 재연결 시 세션 재발급·재구독 자동 복구
- ✅ **의존성 최소화** — 런타임 의존성은 zod 하나. HTTP는 내장 fetch (Node 18+ / 브라우저)
- ✅ **ESM + CJS 듀얼 패키지**, `.d.ts` 포함

## 설치

```bash
npm install chzzk-open-sdk
# 또는 pnpm add chzzk-open-sdk
```

> Node.js 18 이상. (실시간 WebSocket 전송은 Node 22+/브라우저에서 자동 사용되며, Node 18~20은 폴링으로 자동 폴백)

## 빠른 시작

```ts
import { ChzzkOpenClient } from 'chzzk-open-sdk';

const client = new ChzzkOpenClient({
  clientId: process.env.CHZZK_CLIENT_ID!,
  clientSecret: process.env.CHZZK_CLIENT_SECRET!,
});

// Client 인증 API는 바로 사용 가능
const lives = await client.lives.lives({ size: 10 });
const categories = await client.categories.search({ query: '게임' });
```

### OAuth (유저 인증 API)

```ts
// 1) 유저를 인가 URL로 리다이렉트
const url = client.getAuthorizationUrl({
  redirectUri: 'https://your-app.example/callback',
  state: randomState,
});

// 2) 콜백에서 코드 교환 — 토큰은 tokenStore에 저장된다
await client.auth.login({ code, state });

// 3) 이후 유저 인증 API는 토큰 걱정 없이 호출
//    (만료 임박 선제 갱신 + 401 시 갱신 후 1회 재시도 자동)
const me = await client.users.me();
await client.chats.send('안녕하세요!');
```

토큰을 DB 등에 영속화하려면 `TokenStore` 인터페이스(`get`/`set`/`clear`)를 구현해 `tokenStore` 옵션으로 주입하세요. **refresh token은 일회용**이므로 갱신 시마다 `set`으로 전달되는 새 토큰 묶음을 반드시 저장해야 합니다.

## 리소스 API

| 리소스                | 메서드                                                                                                                                                    | 인증                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `client.users`        | `me()`                                                                                                                                                    | 유저                   |
| `client.channels`     | `get(channelIds)` · `streamingRoles()` · `followers()` / `iterateFollowers()` · `subscribers()` / `iterateSubscribers()`                                  | Client / 유저          |
| `client.categories`   | `search({query, size})`                                                                                                                                   | Client                 |
| `client.lives`        | `lives()` / `iterateLives()` · `streamKey()` · `getSetting()` · `updateSetting(patch)`                                                                    | Client / 유저          |
| `client.chats`        | `send(message)` · `notice({message｜messageId})` · `getSettings()` · `updateSettings(update)` · `blindMessage(params)`                                    | 유저                   |
| `client.sessions`     | `createClientSessionUrl()` · `createUserSessionUrl()` · `listClientSessions()` · `listUserSessions()` · `subscribe(type, key)` · `unsubscribe(type, key)` | Client / 유저          |
| `client.drops`        | `rewardClaims()` / `iterateRewardClaims()` · `updateRewardClaims()`                                                                                       | Client (드롭스 스코프) |
| `client.restrictions` | `list()` / `iterate()` · `add()` · `remove()` · `addTemporary()` · `removeTemporary()`                                                                    | 유저                   |

- 목록 API는 **자동 순회 async iterator**(`iterate*`)를 함께 제공합니다 (페이지/커서를 SDK가 따라감).
- 필수 파라미터·허용값(예: `chatSlowModeSec`)은 요청 전에 검증되어 명확한 에러를 던집니다.

## 실시간 이벤트

공식 세션 API 기반. 단일 업스트림 연결 위에 여러 소비자가 붙습니다.

```ts
const realtime = client.createRealtime({
  auth: 'client', // 클라이언트 세션 + 유저 토큰 구독 (봇 아키텍처 표준. 'user'도 가능)
  subscriptions: ['chat', 'donation', 'subscription'],
});

// 소비 방식 1: 이벤트 에미터
realtime.on('chat', (chat) => {
  console.log(`${chat.nickname}: ${chat.content}`);
});

// 소비 방식 2: AsyncIterable — 소비자마다 독립 버퍼 (하나가 느려도 서로 무영향)
for await (const donation of realtime.donations()) {
  console.log(`${donation.donatorNickname} → ${donation.payAmount}원`);
}

await realtime.start(); // 연결 → SYSTEM(connected)에 반응해 구독
// 끊기면 새 세션 재발급 → 재구독 자동 복구. 종료는 realtime.close()
```

- 이벤트는 **정규화 타입**(`ChatMessage`/`Donation`/`SubscriptionEvent`)으로 전달됩니다 — 문서-실제 불일치는 SDK가 흡수합니다.
- `getChatRole(chat)`로 STREAMER/MANAGER/VIEWER 3단계 권한을 파생할 수 있습니다.
- **SDK는 스트림 노출까지만 책임집니다.** 명령어 파싱·금지어 감지·프론트 릴레이 같은 가공은 스트림 위에서 직접 구현하세요 — [examples/](examples/)에 SSE 릴레이 어댑터와 명령어 봇 패턴이 있습니다.
- 참고: 치지직 채팅은 사전 차단이 불가능하며 `chats.blindMessage()`로 **사후 숨김**만 가능합니다.

## 에러 처리 / 재시도 / 로깅

```ts
import { ChzzkApiError, ChzzkRateLimitError, ChzzkTokenRefreshError } from 'chzzk-open-sdk';

try {
  await client.chats.send('...');
} catch (error) {
  if (error instanceof ChzzkRateLimitError) {
    // 429 — SDK가 Retry-After/지수 백오프로 재시도한 뒤에도 실패한 경우
  } else if (error instanceof ChzzkTokenRefreshError) {
    // refresh token 만료 — 재로그인(인가 코드 재발급) 필요
  } else if (error instanceof ChzzkApiError) {
    console.error(error.status, error.apiMessage); // 401/403/404 등
  }
}
```

- 429는 기본으로 `Retry-After` 존중 + 지수 백오프 재시도 (옵션 `retry`로 조정/비활성).
- `logger` 옵션으로 로거를 주입할 수 있습니다 (기본 no-op, `Authorization`/`Client-Secret` 자동 마스킹).

## 브라우저 사용 시 주의

Client Secret·액세스 토큰·스트림키는 브라우저에 노출하면 안 됩니다. 인증 호출은 백엔드에서 수행하고, 프론트에는 정규화 이벤트만 릴레이하세요 ([examples/05-relay-sse.ts](examples/05-relay-sse.ts) 참고).

## 문서

- [examples/](examples/) — 실행 가능한 예제 (OAuth, 라이브 목록, 채팅, 실시간, SSE 릴레이, 명령어 봇)
- [docs/endpoints.md](docs/endpoints.md) — 전체 엔드포인트 정리표 (스코프/파라미터/응답)
- [docs/api-notes.md](docs/api-notes.md) — **문서 vs 실제 검증 기록** (이 SDK의 신뢰성 근거)
- [docs/verification.md](docs/verification.md) — 검증 하니스 사용법 (`pnpm login` / `pnpm verify`)

## 개발

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm login    # 검증용 유저 토큰 발급 (브라우저 OAuth)
pnpm verify   # 문서-실제 검증 러너
```

기여 흐름: `dev` 브랜치 기준으로 작업 브랜치를 만들어 PR을 올립니다. 자세한 진행 상황은 [로드맵 이슈](https://github.com/WisdomIT/chzzk-open-sdk/issues/1)를 참고하세요.

## 라이선스

[MIT](LICENSE)
