# 리소스 API

공식 엔드포인트와 1:1로 대응하는 리소스 지향 API입니다. 전체 시그니처는 [API 레퍼런스](/api/)를, 엔드포인트별 스코프·파라미터는 [엔드포인트 정리표](/endpoints)를 참고하세요.

| 리소스                | 메서드                                                                                                                                  | 인증                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `client.users`        | `me()`                                                                                                                                  | 유저                   |
| `client.channels`     | `get(channelIds)` · `streamingRoles()` · `followers()` / `iterateFollowers()` · `subscribers()` / `iterateSubscribers()`                | Client / 유저          |
| `client.categories`   | `search({query, size})`                                                                                                                 | Client                 |
| `client.lives`        | `lives()` / `iterateLives()` · `streamKey()` · `getSetting()` · `updateSetting(patch)`                                                  | Client / 유저          |
| `client.chats`        | `send(message)` · `notice(...)` · `getSettings()` · `updateSettings(update)` · `blindMessage(params)`                                   | 유저                   |
| `client.sessions`     | `createClientSessionUrl()` · `createUserSessionUrl()` · `listClientSessions()` · `listUserSessions()` · `subscribe()` · `unsubscribe()` | Client / 유저          |
| `client.drops`        | `rewardClaims()` / `iterateRewardClaims()` · `updateRewardClaims()`                                                                     | Client (드롭스 스코프) |
| `client.restrictions` | `list()` / `iterate()` · `add()` · `remove()` · `addTemporary()` · `removeTemporary()`                                                  | 유저                   |

## 페이지네이션 자동 순회

치지직 API는 페이지 번호/커서 방식이 혼재합니다. `iterate*` 메서드는 방식과 무관하게 async iterator로 전체를 순회합니다:

```ts
for await (const follower of client.channels.iterateFollowers()) {
  console.log(follower.channelName, follower.createdDate);
}
```

실측으로 확인된 미문서 페이지 메타(`totalPages` 등)를 활용해 불필요한 마지막 요청도 생략합니다.

## 입력 검증

필수 파라미터·개수 상한(`channelIds` ≤20)·허용값(`chatSlowModeSec` 0/3/5/10/30/60/120/300 등)은 **요청 전에** 검증되어 `ChzzkValidationError`를 던집니다. 네트워크 왕복 없이 문제를 즉시 알 수 있습니다.

## 에러 처리와 재시도

```ts
import { ChzzkApiError, ChzzkRateLimitError, ChzzkTokenRefreshError } from 'chzzk-open-sdk';

try {
  await client.chats.send('...');
} catch (error) {
  if (error instanceof ChzzkRateLimitError) {
    // 429 — 자동 재시도(Retry-After 존중 + 지수 백오프) 소진 후
  } else if (error instanceof ChzzkTokenRefreshError) {
    // refresh token 만료 — 재로그인 필요
  } else if (error instanceof ChzzkApiError) {
    console.error(error.status, error.apiMessage);
  }
}
```

| 에러                       | 상황                                                         |
| -------------------------- | ------------------------------------------------------------ |
| `ChzzkValidationError`     | 요청 전 입력 검증 실패 (네트워크 호출 없음)                  |
| `ChzzkAuthenticationError` | 401 — 인증 정보 없음/만료 (SDK가 갱신·재시도 후에도 실패 시) |
| `ChzzkPermissionError`     | 403 — 스코프 등 호출 권한 없음                               |
| `ChzzkRateLimitError`      | 429 — `retryAfterSeconds` 포함 가능                          |
| `ChzzkNetworkError`        | fetch 실패 (원인은 `cause`)                                  |
| `ChzzkApiError`            | 그 외 API 실패 (`status`, `apiMessage`)                      |

## 관용 파싱

응답은 zod loose 스키마로 파싱됩니다. 문서에 없는 필드가 새로 와도 죽지 않고 보존되며, 알려진 필드가 사라지면 경고 로그 후 원본을 그대로 반환합니다 — API 변화가 여러분의 서비스를 중단시키지 않습니다.
