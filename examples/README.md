# examples

실행 가능한 사용 예제 모음. 저장소 안에서 상대 경로로 SDK를 import하므로 바로 실행된다
(실제 프로젝트에서는 `import { ... } from 'chzzk-open-sdk'`).

## 사전 준비

```bash
cp .env.example .env   # CHZZK_CLIENT_ID / CHZZK_CLIENT_SECRET 입력
pnpm login             # 유저 토큰 필요한 예제용 (.tokens.json 발급 — docs/verification.md)
```

| 예제                     | 필요 자격증명 | 내용                                                               |
| ------------------------ | ------------- | ------------------------------------------------------------------ |
| `01-login-and-me.ts`     | 유저 토큰     | 인가 URL 생성 흐름 + `users.me()`                                  |
| `02-lives.ts`            | Client 인증만 | 라이브 목록 + 자동 순회(async iterator)                            |
| `03-send-chat.ts`        | 유저 토큰     | 채팅 전송 (⚠️ 실제 전송됨)                                         |
| `04-realtime-console.ts` | 둘 다         | 실시간 chat/donation/subscription 콘솔 출력 (에미터 소비)          |
| `05-relay-sse.ts`        | 둘 다         | **프론트 릴레이 어댑터** — 정규화 스트림을 SSE로 브라우저에 릴레이 |
| `06-command-bot.ts`      | 둘 다         | **스트림 직접 가공 패턴** — `!ping` 응답, 금지어 사후 블라인드     |

```bash
pnpm exec tsx examples/02-lives.ts
```

## 설계 원칙 (예제가 보여주는 것)

- **SDK는 스트림 노출까지**: 05·06의 릴레이/명령 파싱/모더레이션은 SDK 기능이 아니라
  개발자가 정규화 스트림 위에서 직접 구현하는 사용 패턴이다.
- **전송 수단은 앱 소유**: 05의 SSE는 참고 구현일 뿐, WebSocket 등 무엇이든 앱이 결정한다.
- **사후 블라인드만 가능**: 치지직 채팅은 이미 발생한 메시지를 사전 차단할 수 없고,
  `chats/blind-message`로 사후에 가릴 수만 있다 (06 참조).

## ⚠️ 브라우저/보안 주의사항

- **Client Secret·액세스 토큰·스트림키를 브라우저로 보내지 말 것.** 인증이 필요한 모든 호출은
  백엔드에서 수행하고, 프론트에는 05처럼 정규화 이벤트만 릴레이한다.
- 브라우저에서 openapi.chzzk.naver.com을 직접 호출하는 구성은 CORS와 시크릿 노출 문제를
  동시에 가지므로 권장하지 않는다.
- `.env`, `.tokens.json`은 gitignore 대상이다 — 커밋 금지.
