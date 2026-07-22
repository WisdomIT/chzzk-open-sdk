# 문서 vs 실제 검증 노트

공식 문서와 실제 API 응답의 불일치(확정·의심)를 기록한다.
각 항목은 검증 하니스([#14](https://github.com/WisdomIT/chzzk-open-sdk/issues/14), `scripts/verify/*`)로 실측 후 상태를 갱신하며, **타입은 실제 응답을 우선**한다.

상태 범례: 🔴 미검증(의심) · 🟡 검증 보류(자격증명/조건 필요) · 🟢 검증 완료

## 문서 vs 실제 대조표

| #   | 상태       | 대상                                            | 문서                                                            | wizbot 실측/코드                                      | 판단·조치                                                                                                                                                                       |
| --- | ---------- | ----------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 🟡         | 토큰 폐기 경로                                  | `POST /auth/v1/token/revoke`                                    | `POST /auth/v1/revoke` 호출 (동작했던 것으로 추정)    | **SDK(#5)는 문서 경로로 구현** (`AuthClient.revokeToken`). 실자격 검증은 보류 — 하니스(#14)에서 두 경로 실호출 확인 후 확정                                                     |
| 2   | 🟢         | 토큰 응답 `expiresIn`                           | Type: **String** ("86400")                                      | 타입도 `string`으로 정의됨                            | **실측(2026-07-22, `pnpm verify:token`): 실제는 `number`(86400) — 문서가 틀림.** 토큰 엔드포인트도 공통 envelope `{code,message,content}` 사용 확인. SDK는 양쪽 수용 유지       |
| 3   | 🟡         | 토큰 발급 응답 `scope`                          | 발급(authorization_code) 응답엔 없음, 갱신(refresh) 응답엔 있음 | wizbot 타입엔 항상 있음                               | **갱신 응답 scope 존재 실측 확인(2026-07-22)** — 공백 구분 스코프명 나열 문자열 (예: "채널 정보 조회 채팅 메시지 쓰기 …"). 발급 응답은 다음 로그인 시 확인. SDK는 optional 유지 |
| 4   | 🔴         | 세션 목록 `disconnectedDate`                    | `disconnectedDate` (정상 철자)                                  | `disconnedtedDate` (오타)로 타입 정의                 | 실제 응답 필드명 확인 — wizbot 오타인지, 과거 실제 응답의 오타였는지 판별                                                                                                       |
| 5   | 🟢(문서상) | 세션 이벤트 타입                                | `CHAT`\|`DONATION`\|`SUBSCRIPTION`                              | `CHAT`\|`DONATION`만 정의 (SUBSCRIPTION 누락)         | SDK는 3종 전부 + subscribe/unsubscribe/subscription 포함. 실측으로 재확인                                                                                                       |
| 6   | 🔴         | CHAT 이벤트 `userRoleCode`, `chatChannelId`     | 존재 (2025.07 / 2026.03 추가)                                   | 타입에 둘 다 없음 (구버전)                            | 실제 payload로 존재 확인. `getChatRole` 뱃지 추론은 `userRoleCode` 기반으로 대체 검토                                                                                           |
| 7   | 🔴         | CHAT `profile.badges`                           | Type `Object[]`만 표기, **필드 구성 미기술**                    | `{ imageUrl: string }[]` 실측                         | 실제 payload 캡처로 필드 확정 (문서 공백을 실측으로 채움)                                                                                                                       |
| 8   | 🔴         | CHAT/DONATION `emojis`                          | Type `Map` (key: 식별자, value: URL)                            | `{ [key: string]: string }[]` — **배열로 정의(모순)** | 실제는 plain object(`Record<string, string>`) 추정. 실측 확정                                                                                                                   |
| 9   | 🔴         | DONATION `payAmount`                            | Type **String**                                                 | string                                                | 문자열 맞는지 실측. 정규화 계층에서 number 파생 필드 제공 검토                                                                                                                  |
| 10  | 🔴         | 이벤트 구독/취소 `sessionKey` 전달 위치         | "Request Param" (쿼리)                                          | 쿼리 파라미터로 전송 (동작 확인됨)                    | POST+쿼리 조합 실측 재확인. body 병행 수용 여부는 확인 불필요(쿼리 고정)                                                                                                        |
| 11  | 🔴         | 채팅 설정 응답 필드명                           | `allowSubscriberInFollowerMode`                                 | `allowSubscriberFollowerMode` (In 없음)               | 실제 필드명 확인                                                                                                                                                                |
| 12  | 🔴         | 채팅 설정 응답 누락 필드                        | `chatSlowModeSec`, `chatEmojiMode` 존재                         | 타입에 없음 (2025.07 이전 작성)                       | 실측 확인 후 SDK 타입에 포함                                                                                                                                                    |
| 13  | 🔴         | `minFollowerMinute` 허용 값                     | 0~259200의 13개 값 (2025.12 확장)                               | 0~43200의 8개 값                                      | PUT 시 허용 값 검증은 문서 기준 13개로. 실서버 거부 여부 실측                                                                                                                   |
| 14  | 🔴         | 채널 정보 `verifiedMark`                        | 존재 (2025.07 추가)                                             | 타입에 없음                                           | 실측 확인 후 포함                                                                                                                                                               |
| 15  | 🔴         | 세션 목록 `page` 파라미터 타입                  | **String** 표기 ("0부터 조회")                                  | number로 사용                                         | Int로 간주하고 직렬화. 실측으로 확인                                                                                                                                            |
| 16  | 🔴         | 활동 제한 목록 조회 파라미터 위치               | GET인데 "Request Body" 표기 (`size`, `next`)                    | (wizbot 미구현)                                       | 쿼리 파라미터로 구현 후 실측                                                                                                                                                    |
| 17  | 🔴         | 활동 제한 목록 응답 래핑                        | `data[]`/`page` 래핑 표기 없음 (필드 나열만)                    | (wizbot 미구현)                                       | 실제 응답 구조 확인 — `content.data[]` + `page.next` 래핑 추정                                                                                                                  |
| 18  | 🟡         | 드롭스 조회 `page.from`/`page.size` 쿼리 직렬화 | 중첩 Object로 표기                                              | (wizbot 미구현)                                       | `page.from=...` vs `from=...` 실측 필요. **드롭스 스코프(법인) 필요 → 검증 보류**                                                                                               |
| 19  | 🟡         | 드롭스 지급 갱신 응답                           | `status` enum 중 `UNAUTHORIZ`ED 오타 포함                       | (wizbot 미구현)                                       | `UNAUTHORIZED`로 구현. 법인 자격 필요 → 검증 보류                                                                                                                               |
| 20  | 🔴         | 팔로워/구독자/세션 목록 응답 페이지 메타        | `data[]` 외 메타 없음                                           | (부분 미구현)                                         | totalCount/page 메타가 실제로 오는지 확인 (자동 순회 종료 조건 설계에 필요)                                                                                                     |
| 21  | 🔴         | 429 `Retry-After` 헤더                          | 미기술                                                          | (미구현)                                              | 실측 후 재시도 로직(#4)에 반영. 헤더 없으면 지수 백오프만 사용                                                                                                                  |
| 22  | 🟢(문서상) | SUBSCRIPTION 이벤트 `month` 설명                | "사용된구독 기간치지직 이모티콘 정보" — 문서 자체 오타          | —                                                     | 의미는 "구독 개월 수"(Int)로 확정. 구현 영향 없음                                                                                                                               |
| 23  | 🟢         | users/me 응답 `nickname`                        | **문서에 없음** (channelId, channelName만 기재)                 | (wizbot 타입에도 없음)                                | **실측(2026-07-22, `pnpm verify`): 실제 응답에 `nickname`(string) 존재.** SDK 타입(#6 `UserMe`)에 포함 — 문서 공백을 실측으로 채움                                              |
| 24  | 🟢         | categories/search 응답                          | data[]: categoryType/categoryId/categoryValue/posterImageUrl    | —                                                     | **실측(2026-07-22, `pnpm verify`): 문서와 일치** (query=게임, 5건 수신, 초과 필드 없음)                                                                                         |

## 실시간 연결 관련 중요 참고

- **socket.io-client 지원 버전이 1.0.0+ ~ 2.0.3** 로 문서에 명시됨. 최신 socket.io-client v4는 프로토콜(EIO=4)이 달라 **비호환 가능성이 높음**. Transport(#15) 구현 시:
  - 선택지 A: `socket.io-client@2.x` 의존성 (구버전이지만 문서 준수)
  - 선택지 B: EIO=3 프로토콜을 말하는 경량 클라이언트 직접 구현 (의존성 최소화 원칙 부합, 유지비용 있음)
  - 실측으로 서버가 실제 수용하는 프로토콜 버전을 확인한 뒤 결정하고 사유를 기록한다.
- 소켓 이벤트 payload는 **JSON 문자열**로 전달됨 (`JSON.parse` 필요) — wizbot 실측과 문서 예제 모두 일치.
- 구독 성공 통지는 HTTP 응답이 아니라 세션의 `SYSTEM(subscribed)` 메시지로 온다. Transport는 이 메시지를 구독 완료 신호로 사용한다 (wizbot의 `setTimeout(1000)` 방식 제거 근거).
- 세션 연결 상한: 클라이언트 세션 10개 / 유저 세션 3개 / 세션당 구독 30개 — SDK에서 초과 시 명확한 에러 안내.

## 검증 절차 (하니스 #14에서 표준화)

1. 문서 스펙으로 요청/응답 zod 스키마(passthrough) 1차 정의
2. 실제 자격증명으로 호출 → 스키마 파싱. 문서에 없는 필드 수신 시 경고 로그, 알려진 필드 누락 시 실패
3. 불일치 발견 시 이 문서의 표를 갱신하고 타입은 실제 응답 기준으로 수정
4. 자격증명·조건(법인 스코프 등) 미비로 호출 불가한 항목은 🟡 유지 + 코드에 문서 링크 주석
