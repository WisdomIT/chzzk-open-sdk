# 시작하기

## 설치

```bash
npm install chzzk-open-sdk
# 또는 pnpm add chzzk-open-sdk
```

- Node.js **18 이상** (실시간 WebSocket 전송은 Node 22+/브라우저에서 자동 사용, Node 18~20은 폴링 자동 폴백)
- 치지직 [개발자 센터](https://developers.chzzk.naver.com)에서 애플리케이션을 등록하고 Client ID/Secret을 발급받아야 합니다. 사용할 API Scope도 애플리케이션에 신청해 두세요.

## 클라이언트 생성

```ts
import { ChzzkOpenClient } from 'chzzk-open-sdk';

const client = new ChzzkOpenClient({
  clientId: process.env.CHZZK_CLIENT_ID!,
  clientSecret: process.env.CHZZK_CLIENT_SECRET!,
});
```

Client 인증만 필요한 API는 바로 호출할 수 있습니다:

```ts
const { data: lives } = await client.lives.lives({ size: 10 });
const categories = await client.categories.search({ query: '게임' });
const channels = await client.channels.get(['채널ID']);
```

유저 인증(Access Token)이 필요한 API는 [OAuth 인증](/guide/oauth)을 먼저 설정하세요.

## 옵션

```ts
new ChzzkOpenClient({
  clientId,
  clientSecret,
  tokenStore, // 토큰 영속화 (기본: 메모리)
  expirySkewSeconds, // 만료 몇 초 전부터 선제 갱신할지 (기본 60)
  retry, // 429 재시도 정책 { enabled, maxRetries, baseDelayMs, maxDelayMs }
  logger, // 로거 주입 (기본 no-op, 민감정보 자동 마스킹)
  fetch, // fetch 주입 (테스트/커스텀 런타임)
});
```

## 브라우저 사용 시 주의

Client Secret·액세스 토큰·스트림키는 브라우저에 노출하면 안 됩니다. 인증 호출은 백엔드에서 수행하고, 프론트에는 정규화 이벤트만 릴레이하세요 — [실시간 이벤트](/guide/realtime) 참고.
