# CHZZK Open API 엔드포인트 정리표

> 기준: [공식 문서](https://chzzk.gitbook.io/chzzk) `llms-full.txt` (2026-07-22 fetch).
> 이 표는 이슈 [#2](https://github.com/WisdomIT/chzzk-open-sdk/issues/2)의 산출물이며 구현의 1차 기준이다.
> 문서와 실제 응답이 어긋나는 지점(의심 포함)은 [api-notes.md](api-notes.md)에 기록한다.

## 공통 규격

- **Base URL**: `https://openapi.chzzk.naver.com` (인가 코드 요청만 `https://chzzk.naver.com/account-interlock`)
- **인증 방식 2종**
  - **Access Token 인증**: `Authorization: Bearer {accessToken}` + `Content-Type: application/json`
  - **Client 인증**: `Client-Id: {clientId}` + `Client-Secret: {clientSecret}` + `Content-Type: application/json`
- **공통 응답 구조**
  - 성공: `{ "code": 200, "message": null, "content": {responseBody} }`
  - 실패: `{ "code": <int>, "message": <string> }`
- **에러 코드**

  | HTTP | Error Message             | 의미                             |
  | ---- | ------------------------- | -------------------------------- |
  | 400  | 잘못된 값을 입력했습니다. | 요청 파라미터 에러               |
  | 401  | `UNAUTHORIZED`            | 필요 인증 정보 없음              |
  | 401  | `INVALID_CLIENT`          | Client 정보 비정상               |
  | 401  | `INVALID_TOKEN`           | 존재하지 않는/만료된/삭제된 토큰 |
  | 403  | `FORBIDDEN`               | 호출 권한 없음 (스코프 등)       |
  | 404  | `NOT_FOUND`               | 검색 결과 없음                   |
  | 429  | `TOO_MANY_REQUESTS`       | Quota 제한 초과                  |
  | 500  | `INTERNAL_SERVER_ERROR`   | 서버 내부 에러                   |

- **기타 규격**
  - 최근 90일간 API Scope 사용량이 0인 애플리케이션은 삭제됨
  - Access Token 만료 1일, Refresh Token 만료 30일, **Refresh Token은 일회용** (갱신 시 새 refresh token 발급)

## 페이지네이션 방식 (3종 혼재)

| 방식        | 사용하는 API                | 파라미터                 | 응답                                                               |
| ----------- | --------------------------- | ------------------------ | ------------------------------------------------------------------ |
| 페이지 번호 | 세션 목록, 팔로워, 구독자   | `page`(0부터), `size`    | `data[]`만 반환 (총 개수/다음 페이지 정보 없음 → 빈 배열까지 순회) |
| 커서 `next` | 라이브 목록, 활동 제한 목록 | `size`, `next`           | `page.next` 반환                                                   |
| 커서 `from` | 드롭스 지급 요청 조회       | `page.from`, `page.size` | `page.cursor` 반환 (다음 조회의 `from`으로 사용)                   |

---

## 1. 인증 / 토큰 (OAuth)

### 1.1 인가 코드 요청 — `GET https://chzzk.naver.com/account-interlock`

리다이렉트 방식. `redirectUri`는 애플리케이션 등록 시 입력한 로그인 리디렉션 URL과 일치해야 함.

| Param       | Type   | Required | 비고 |
| ----------- | ------ | -------- | ---- |
| clientId    | String | *        |      |
| redirectUri | String | *        |      |
| state       | String | *        |      |

응답(리다이렉트 쿼리): `code`, `state`. **scope 파라미터 없음** — 스코프는 개발자 센터 애플리케이션 설정에서 관리.

### 1.2 토큰 발급 — `POST /auth/v1/token` (grantType=authorization_code)

Body: `grantType`("authorization_code" 고정), `clientId`, `clientSecret`, `code`, `state`

응답: `accessToken`, `refreshToken`, `tokenType`("Bearer" 고정), `expiresIn`(문서상 String "86400" — [검증 대상](api-notes.md))

### 1.3 토큰 갱신 — `POST /auth/v1/token` (grantType=refresh_token)

Body: `grantType`("refresh_token" 고정), `refreshToken`, `clientId`, `clientSecret`

응답: `accessToken`, `refreshToken`, `tokenType`, `expiresIn`, `scope`(예: "채널 조회" — 발급 응답에는 문서상 없음, [검증 대상](api-notes.md))

### 1.4 토큰 폐기 — `POST /auth/v1/token/revoke`

Body: `clientId`, `clientSecret`, `token`, `tokenTypeHint`("access_token" 기본 | "refresh_token")

동일 clientId+user로 발급된 **모든 토큰이 함께 제거**됨. wizbot 기존 코드는 `/auth/v1/revoke` 사용 — [경로 검증 대상](api-notes.md).

---

## 2. User

### 2.1 유저 정보 조회 — `GET /open/v1/users/me` 〔유저 토큰 · Scope: 유저 정보 조회〕

파라미터 없음. 응답: `channelId`, `channelName`

---

## 3. Channel

### 3.1 채널 정보 조회 — `GET /open/v1/channels` 〔Client 인증〕

| Param      | Type     | Required | 비고                             |
| ---------- | -------- | -------- | -------------------------------- |
| channelIds | String[] | *        | 최대 20개 (쿼리스트링 콤마 구분) |

응답 `data[]`: `channelId`, `channelName`, `channelImageUrl`, `followerCount`(Int), `verifiedMark`(Boolean, 2025.07 추가). 일치 채널 없으면 해당 항목 미반환.

### 3.2 채널 관리자 조회 — `GET /open/v1/channels/streaming-roles` 〔유저 토큰 · Scope: 채널 관리자 조회〕

파라미터 없음(문서 기준). 응답 `data[]`: `managerChannelId`, `managerChannelName`, `userRole`(`STREAMING_CHANNEL_OWNER` | `STREAMING_CHANNEL_MANAGER` | `STREAMING_CHAT_MANAGER` | `STREAMING_SETTLEMENT_MANAGER`), `createdDate`(Date)

※ 2026.03 "채널 관리자 조회 API 사용 불가 이슈 수정" 이력 있음.

### 3.3 채널 팔로워 조회 — `GET /open/v1/channels/followers` 〔유저 토큰 · Scope: 채널 팔로워 조회〕

| Param | Type | Required | 비고          |
| ----- | ---- | -------- | ------------- |
| page  | Int  | optional | 0부터, 기본 0 |
| size  | Int  | optional | 1~50, 기본 30 |

응답 `data[]`: `channelId`, `channelName`, `createdDate`(팔로우 일자). 문서상 페이지 메타 정보 없음.

### 3.4 채널 구독자 조회 — `GET /open/v1/channels/subscribers` 〔유저 토큰 · Scope: 채널 구독자 조회〕

| Param | Type   | Required | 비고                                             |
| ----- | ------ | -------- | ------------------------------------------------ |
| page  | Int    | optional | 0부터, 기본 0                                    |
| size  | Int    | optional | 1~50, 기본 30                                    |
| sort  | String | optional | `RECENT`(최신 구독 순) \| `LONGER`(구독 개월 순) |

응답 `data[]`: `channelId`, `channelName`, `month`(Int), `tierNo`(1|2), `createdDate`

---

## 4. Category

### 4.1 카테고리 검색 — `GET /open/v1/categories/search` 〔Client 인증〕

| Param | Type   | Required | 비고          |
| ----- | ------ | -------- | ------------- |
| query | String | *        | 포함 검색     |
| size  | Int    | optional | 1~50, 기본 20 |

응답 `data[]`: `categoryType`(`GAME`|`SPORTS`|`ETC`), `categoryId`, `categoryValue`, `posterImageUrl`

---

## 5. Live

### 5.1 라이브 목록 조회 — `GET /open/v1/lives` 〔Client 인증〕

| Param | Type   | Required | 비고                |
| ----- | ------ | -------- | ------------------- |
| size  | Int    | optional | 1~20, 기본 20       |
| next  | String | optional | 응답 `page.next` 값 |

응답 `data[]`(시청자 수 높은 순): `liveId`(Int), `liveTitle`, `liveThumbnailImageUrl`, `concurrentUserCount`(Int), `openDate`, `adult`(boolean), `tags`(String[]), `categoryType`, `liveCategory`(카테고리 식별자), `liveCategoryValue`, `channelId`, `channelName`, `channelImageUrl` + `page.next`

### 5.2 방송 스트림키 조회 — `GET /open/v1/streams/key` 〔유저 토큰 · Scope: 방송 스트림키 조회〕

파라미터 없음. 응답: `streamKey`

### 5.3 방송 설정 조회 — `GET /open/v1/lives/setting` 〔유저 토큰 · Scope: 방송 설정 조회〕

파라미터 없음. 응답: `defaultLiveTitle`, `category`{`categoryType`, `categoryId`, `categoryValue`, `posterImageUrl`}, `tags`(String[])

### 5.4 방송 설정 변경 — `PATCH /open/v1/lives/setting` 〔유저 토큰 · Scope: 방송 설정 변경〕

Body(모두 optional — 부분 변경 가능): `defaultLiveTitle`(빈 값 불가), `categoryType`, `categoryId`(`""` 전송 시 카테고리 제거), `tags`(빈 배열 시 태그 제거, 공백·특수문자 비허용)

---

## 6. Chat

모두 유저 토큰 필요.

### 6.1 채팅 메시지 전송 — `POST /open/v1/chats/send` 〔Scope: 채팅 메시지 쓰기〕

Body: `message`(최대 100자). 응답: `messageId`

### 6.2 채팅 공지 등록 — `POST /open/v1/chats/notice` 〔Scope: 채팅 공지 쓰기〕

Body: `message`(신규 등록, optional) 또는 `messageId`(기존 메시지 지정, optional). 응답: 200 (본문 없음)

### 6.3 채팅 설정 조회 — `GET /open/v1/chats/settings` 〔Scope: 채팅 설정 조회〕

응답: `chatAvailableCondition`(`NONE`|`REAL_NAME`), `chatAvailableGroup`(`ALL`|`FOLLOWER`|`MANAGER`|`SUBSCRIBER`), `minFollowerMinute`(Int), `allowSubscriberInFollowerMode`(boolean), `chatSlowModeSec`(Int, 2025.07 추가), `chatEmojiMode`(Boolean, 2025.07 추가)

### 6.4 채팅 설정 변경 — `PUT /open/v1/chats/settings` 〔Scope: 채팅 설정 변경〕

Body(문서상 required 표기 없음):

- `chatAvailableCondition`, `chatAvailableGroup`: 조회와 동일 enum
- `minFollowerMinute`: **0, 5, 10, 30, 60, 1440, 10080, 43200, 86400, 129600, 172800, 216000, 259200만 허용** (2025.12 확장)
- `chatSlowModeSec`: **0(off), 3, 5, 10, 30, 60, 120, 300만 허용**
- `allowSubscriberInFollowerMode`, `chatEmojiMode`: boolean

### 6.5 채팅 메시지 숨기기 — `POST /open/v1/chats/blind-message` 〔Scope: 채팅 메시지 쓰기〕 (2026.03 추가)

Body: `chatChannelId`, `messageTime`(long, 채팅 이벤트의 messageTime), `senderChannelId`

에러: 400(스트리머가 아님), 403(권한 없음), 404(메시지 없음)

---

## 7. Session (REST)

구독 계열 Scope: `채팅 메시지 조회`, `후원 조회`, `구독 조회` (유저 토큰 필요).

### 7.1 세션 생성(클라이언트) — `GET /open/v1/sessions/auth/client` 〔Client 인증〕

응답: `url`(소켓 연결용, 일정 시간만 유효). **클라이언트당 최대 10개 연결.**

### 7.2 세션 생성(유저) — `GET /open/v1/sessions/auth` 〔유저 토큰〕

응답: `url`. 해당 세션은 **생성에 사용한 Access Token과 동일한 유저 이벤트만 구독 가능.** **유저당 최대 3개 연결.**

### 7.3 세션 목록(클라이언트) — `GET /open/v1/sessions/client` 〔Client 인증〕

### 7.4 세션 목록(유저) — `GET /open/v1/sessions` 〔유저 토큰〕

| Param | Type              | Required | 비고                                                                    |
| ----- | ----------------- | -------- | ----------------------------------------------------------------------- |
| size  | Int               | optional | 1~50, 기본 20                                                           |
| page  | String(문서 표기) | optional | 0부터, 기본 0 — 타입 표기는 Int가 자연스러움([검증 대상](api-notes.md)) |

응답 `data[]`: `sessionKey`, `connectedDate`, `disconnectedDate`, `subscribedEvents[]`{`eventType`(`CHAT`|`DONATION`|`SUBSCRIPTION`), `channelId`}. 끊어진 세션은 90일간만 조회 가능.

### 7.5 이벤트 구독/취소 — `POST /open/v1/sessions/events/{subscribe|unsubscribe}/{chat|donation|subscription}` 〔유저 토큰〕

6개 엔드포인트 모두 동일 규격. **Request Param**(쿼리): `sessionKey`(*)

- subscribe/chat 〔Scope: 채팅 메시지 조회〕 / subscribe/donation 〔Scope: 후원 조회〕 / subscribe/subscription 〔Scope: 구독 조회〕
- **세션당 최대 30개 이벤트 구독**
- 구독/취소 완료는 응답이 아니라 **세션으로 오는 SYSTEM 메시지(subscribed/unsubscribed)로 통지**

### 7.6 소켓 연결 규격

- **[Socket.IO-client](https://github.com/socketio/socket.io-client) 1.0.0+ ~ 2.0.3 버전까지 지원** ⚠️ (v4 클라이언트 비호환 가능성 — [api-notes.md](api-notes.md) 참조)
- 권장 옵션: `reconnection: false`, `'force new connection': true`, `'connect timeout': 3000`, `transports: ['websocket']`
- 이벤트명: `SYSTEM`, `CHAT`, `DONATION`, `SUBSCRIPTION` — payload는 **JSON 문자열**(파싱 필요)

### 7.7 세션 메시지 스키마

**SYSTEM** — `{ type, data }`

| type           | data                                                            |
| -------------- | --------------------------------------------------------------- |
| `connected`    | `{ sessionKey }` — 연결 완료. 이 sessionKey로 구독 호출         |
| `subscribed`   | `{ eventType, channelId }`                                      |
| `unsubscribed` | `{ eventType, channelId }`                                      |
| `revoked`      | `{ eventType, channelId }` — 동의 철회/스코프 변경 등 권한 회수 |

**CHAT** (2026.03에 `chatChannelId`, 2025.07에 `userRoleCode` 추가)

| Field                | Type     | 비고                                                                                   |
| -------------------- | -------- | -------------------------------------------------------------------------------------- |
| channelId            | String   | 이벤트 채널                                                                            |
| senderChannelId      | String   | 작성자 채널                                                                            |
| chatChannelId        | String   | 임시제한·메시지 숨기기에 사용                                                          |
| profile.nickname     | String   |                                                                                        |
| profile.badges       | Object[] | **필드 구성 문서 미기술** — 실측 `{ imageUrl }` ([검증 대상](api-notes.md))            |
| profile.verifiedMark | boolean  |                                                                                        |
| userRoleCode         | String   | `streamer` \| `common_user` \| `streaming_channel_manager` \| `streaming_chat_manager` |
| content              | String   |                                                                                        |
| emojis               | Map      | `{식별자: URL}`                                                                        |
| messageTime          | Int64    | ms — blind-message의 `messageTime`으로 사용                                            |

**DONATION**

| Field                                          | Type   | 비고                |
| ---------------------------------------------- | ------ | ------------------- |
| donationType                                   | String | `CHAT` \| `VIDEO`   |
| channelId / donatorChannelId / donatorNickname | String |                     |
| payAmount                                      | String | 원 단위, **문자열** |
| donationText                                   | String |                     |
| emojis                                         | Map    |                     |

**SUBSCRIPTION** (2025.07 추가)

| Field                                                | Type   | 비고                 |
| ---------------------------------------------------- | ------ | -------------------- |
| channelId / subscriberChannelId / subscriberNickname | String |                      |
| tierNo                                               | Int    | 1(티어1) \| 2(티어2) |
| tierName                                             | String | 구독 브랜드명        |
| month                                                | Int    | 구독 개월 수         |

---

## 8. Drops

Client 인증 + 드롭스 API Scope 신청 필요(법인 인증 단체 ID만 가능).

### 8.1 리워드 지급 요청 조회 — `GET /open/v1/drops/reward-claims` 〔Client 인증〕

| Param                      | Type   | Required | 비고                                                                      |
| -------------------------- | ------ | -------- | ------------------------------------------------------------------------- |
| page.from                  | String | optional | 커서 (응답 `page.cursor` 값) — 쿼리 직렬화 형식 [검증 대상](api-notes.md) |
| page.size                  | Int    | optional | 기본 20                                                                   |
| claimId                    | String | optional | 콤마 구분, 최대 100개                                                     |
| channelId                  | String | optional |                                                                           |
| campaignId 또는 categoryId | String | optional | **동시 사용 불가**                                                        |
| fulfillmentState           | String | optional | `CLAIMED` \| `FULFILLED`                                                  |

응답 `data[]`: `claimId`, `campaignId`, `rewardId`, `categoryId`, `categoryName`, `channelId`, `fulfillmentState`, `claimedDate`(RFC3339 UTC), `updatedDate` + `page.cursor`(claimId 지정 조회 시 없거나 빈 문자열 가능)

### 8.2 리워드 지급 상태 갱신 — `PUT /open/v1/drops/reward-claims` 〔Client 인증〕

Body: `claimIds`(String[], _), `fulfillmentState`(_, `CLAIMED`|`FULFILLED`)

응답 `data[]`: `status`(`SUCCESS` | `INVALID_ID` | `NOT_FOUND` | `UNAUTHORIZED` | `UPDATE_FAILED`), `ids`(String[])

### (참고) 드롭스 Webhook Event — SDK 호출 대상 아님

치지직이 **게임사의 Webhook URL로 POST하는 인바운드 이벤트** (`drop_reward_claim`). REST 엔드포인트가 아니므로 리소스 모듈 범위 밖. 단, 공식 규격이므로 **HMAC-SHA256 서명 검증 헬퍼**(`Chzzk-Event-Message-Signature`, `sha256=` prefix, `secret`으로 `messageId+timestamp+body` 서명) 제공 여부는 별도 결정 사항 — [#11](https://github.com/WisdomIT/chzzk-open-sdk/issues/11)에서 논의.

---

## 9. Restriction

모두 유저 토큰 필요.

### 9.1 활동 제한 추가 — `POST /open/v1/restrict-channels` 〔Scope: 활동제한 쓰기〕

Body: `targetChannelId`. 응답: 200

### 9.2 활동 제한 삭제 — `DELETE /open/v1/restrict-channels` 〔Scope: 활동제한 쓰기〕

Body: `targetChannelId`. 응답: 200

### 9.3 활동 제한 목록 조회 — `GET /open/v1/restrict-channels` 〔Scope: 활동제한 조회〕

파라미터(문서에 "Request Body"로 표기 — GET이므로 쿼리로 추정, [검증 대상](api-notes.md)): `size`(기본 30, 최대 30), `next`

응답(문서상 래핑 표기 없음 — `data[]` + `page.next` 래핑 여부 [검증 대상](api-notes.md)): `restrictedChannelId`, `restrictedChannelName`, `createdDate`, `releaseDate`

### 9.4 임시제한 추가 — `POST /open/v1/temporary-restrict-channels` 〔Scope: 활동제한 쓰기〕 (2026.03 추가)

Body: `targetChannelId`, `chatChannelId`(채팅 이벤트의 chatChannelId). 에러: 400(존재하지 않는 사용자/이미 임시제한/등록 불가 계정), 403

### 9.5 임시제한 해제 — `DELETE /open/v1/temporary-restrict-channels` 〔Scope: 활동제한 쓰기〕

Body: `targetChannelId`, `chatChannelId`. 에러: 400(존재하지 않는 사용자/해제 불가 계정), 403

---

## 커버리지 대조 결과 (로드맵 #1 목록 vs 공식 문서)

- 로드맵 #1의 엔드포인트 목록 **31건 전부 공식 문서에 존재**하며, 문서에만 있고 목록에 없는 **호출형(outbound) REST 엔드포인트는 0건**.
- 목록 외 공식 규격 1건: **드롭스 Webhook Event**(인바운드, 게임사 서버가 수신). REST 래퍼 대상은 아니며 서명 검증 헬퍼 제공 여부만 #11에서 결정.
- 스코프 전체 목록: 유저 정보 조회 / 채널 관리자 조회 / 채널 팔로워 조회 / 채널 구독자 조회 / 방송 스트림키 조회 / 방송 설정 조회 / 방송 설정 변경 / 채팅 메시지 조회 / 채팅 메시지 쓰기 / 채팅 공지 쓰기 / 채팅 설정 조회 / 채팅 설정 변경 / 후원 조회 / 구독 조회 / 활동제한 쓰기 / 활동제한 조회 / 드롭스
- rate limit: 문서에는 429(`TOO_MANY_REQUESTS`, "Quota 제한 초과")만 명시. 구체 한도·`Retry-After` 헤더 존재 여부는 미기술 → HTTP 계층(#4)에서 실측.
