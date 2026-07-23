# 실시간 이벤트

공식 세션 API 기반의 정규화 이벤트 스트림입니다. 3계층(Transport → Normalize → Consumers)으로 구성되며, 소비자는 항상 정규화 타입만 봅니다.

## 빠른 시작

```ts
const realtime = client.createRealtime({
  auth: 'client',
  subscriptions: ['chat', 'donation', 'subscription'],
});

realtime.on('chat', (chat) => {
  console.log(`${chat.nickname}: ${chat.content}`);
});

await realtime.start(); // 연결 → SYSTEM(connected)에 반응해 구독
// ... 종료 시
realtime.close();
```

## 세션 인증 방식

| `auth`     | 세션                 | 연결 상한  | 용도                                                                                       |
| ---------- | -------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `'client'` | 클라이언트 인증 세션 | 앱당 10개  | **봇 표준 패턴** — 클라이언트 세션에 유저 토큰으로 구독하는 교차 조합이 동작함을 실측 확인 |
| `'user'`   | 유저 인증 세션       | 유저당 3개 | 해당 유저 이벤트만 구독 가능                                                               |

구독(`chat`/`donation`/`subscription`)에는 각각 `채팅 메시지 조회`/`후원 조회`/`구독 조회` 스코프의 유저 토큰이 필요합니다. 세션당 최대 30개 이벤트를 구독할 수 있습니다.

## 두 가지 소비 방식

**이벤트 에미터** — 리스너 예외는 서로 격리됩니다:

```ts
realtime.on('chat', handler);
realtime.on('donation', handler);
realtime.on('event', handler); // 모든 정규화 이벤트 (unknown 포함)
```

**AsyncIterable** — 소비자마다 독립 버퍼를 가져, 하나가 느려도 다른 소비자와 연결에 영향이 없습니다:

```ts
for await (const chat of realtime.chats()) { ... }
for await (const event of realtime.events({ bufferLimit: 500, signal })) { ... }
```

버퍼 상한(기본 1000)을 넘으면 **가장 오래된 이벤트부터 버립니다**(drop-oldest — 실시간 스트림에서는 최신이 더 가치 있다는 정책). 유실 시 최초 1회 경고가 로깅됩니다.

## 자동 복구

- 연결이 끊기면 **새 세션 URL·새 sessionKey를 재발급받아 재구독**까지 자동 복구합니다 (지수 백오프, `reconnect` 옵션으로 상한 조절)
- 토큰 만료는 세션 발급·구독 호출 안에서 자동 갱신됩니다
- 복구 중에도 스트림은 열려 있고, `close()` 또는 재시도 소진 시에만 소비자가 종료됩니다
- `reconnecting`/`disconnected`/`revoked` 이벤트로 상태를 관찰할 수 있습니다

## 정규화 타입

| 이벤트         | 타입                | 비고                                                                                                                                                  |
| -------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat`         | `ChatMessage`       | 실측 기준 정규화 — `userRole`(문서와 달리 profile 내부에 오는 `userRoleCode` 흡수), `chatChannelId`(임시제한·블라인드에 사용), `emojis`(plain object) |
| `donation`     | `Donation`          | `payAmount`(문자열 원본) + `payAmountNumber`(숫자 파생)                                                                                               |
| `subscription` | `SubscriptionEvent` | 티어/개월 수                                                                                                                                          |
| `system`       | `SystemEvent`       | connected/subscribed/unsubscribed/revoked                                                                                                             |
| `unknown`      | —                   | 미래의 이벤트·스키마 변화도 죽지 않고 통과                                                                                                            |

`getChatRole(chat)`은 STREAMER/MANAGER/VIEWER 3단계 권한을 파생합니다 (실측 `userRole` 1차, 뱃지 추론 폴백).

## SDK의 책임 경계

**SDK는 정규화 스트림 노출까지만 책임집니다.** 필터링·명령 파싱·모더레이션 판단·프론트 전송은 개발자가 스트림 위에서 직접 구현합니다:

- 프론트 릴레이(SSE): [examples/05-relay-sse.ts](https://github.com/WisdomIT/chzzk-open-sdk/blob/dev/examples/05-relay-sse.ts)
- 명령어 봇 + 금지어 사후 블라인드: [examples/06-command-bot.ts](https://github.com/WisdomIT/chzzk-open-sdk/blob/dev/examples/06-command-bot.ts)

::: info 사후 블라인드만 가능
치지직 채팅은 이미 발생한 메시지를 사전 차단할 수 없습니다. `client.chats.blindMessage()`로 사후에 숨길 수만 있으며, 필요한 파라미터(`chatChannelId`/`messageTime`/`senderChannelId`)는 CHAT 이벤트에 들어 있습니다.
:::

## 전송 계층 (참고)

문서상 socket.io-client 1.0.0 ~ 2.0.3만 지원되며, 서버가 socket.io v2(EIO=3) 프로토콜임을 실측으로 확인했습니다. SDK는 구버전 라이브러리 의존 대신 **의존성 0의 자체 EIO=3 클라이언트**를 내장합니다 — `globalThis.WebSocket`(Node 22+/브라우저) 우선, 순수 fetch 롱폴링(Node 18 ~ 20) 폴백. 두 전송 모두 실서버 e2e로 검증되었습니다.
