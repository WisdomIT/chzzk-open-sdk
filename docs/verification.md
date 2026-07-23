# 문서-실제 검증 하니스 사용법

문서 스펙과 실제 API 응답을 대조하는 절차. 결과·불일치는 [api-notes.md](api-notes.md)에 기록한다.

## 1. 자격증명 준비

```bash
cp .env.example .env
# CHZZK_CLIENT_ID / CHZZK_CLIENT_SECRET 입력
```

- [치지직 개발자 센터](https://developers.chzzk.naver.com)에서 애플리케이션을 등록하고 Client ID/Secret을 발급받는다.
- 검증할 API Scope(유저 정보 조회, 채팅 메시지 조회 등)를 애플리케이션에 신청해 둔다.
- 애플리케이션의 **로그인 리디렉션 URL**에 `http://localhost:4989/callback`을 등록한다 (`.env`의 `CHZZK_REDIRECT_URI`와 일치해야 함).

## 2. 유저 토큰 발급 (OAuth 로그인)

유저 인증 API(users/me, chat, session 등)는 실제 사용자가 브라우저에서 로그인해야 토큰이 나온다.
이를 위한 로컬 로그인 서버를 제공한다:

```bash
pnpm login
# → 브라우저에서 http://localhost:4989 접속
# → "치지직으로 로그인" 클릭 → 네이버 로그인/동의
# → 토큰이 .tokens.json에 저장됨 (gitignore 대상, mode 600)
```

- Access Token 만료(1일) 시에는 검증 러너가 Refresh Token으로 자동 갱신해 `.tokens.json`을 덮어쓴다.
- Refresh Token까지 만료(30일)되면 `pnpm login`을 다시 실행한다.

## 3. 검증 실행

```bash
pnpm verify
```

- 자격증명 범위 내에서 실행 가능한 검증만 수행한다:
  - Client 인증 검증 — `.env`의 Client ID/Secret 필요
  - 유저 토큰 검증 — `.tokens.json` 필요
- 자격증명이 없는 항목은 **SKIP(검증 보류 🟡)** 로 표시된다.
- 응답은 문서 기반 zod 스키마(loose)로 파싱한다:
  - 문서에 명시된 필드 누락/타입 불일치 → **FAIL**
  - 문서에 없는 초과 필드 수신 → **PASS + ⚠️ 경고** (api-notes에 기록 후 타입 반영 검토)

## 4. 결과 반영

- FAIL/경고 발견 시 [api-notes.md](api-notes.md)의 해당 행을 갱신하고(상태 🟢/🟡, 실측 결과), SDK 타입은 **실제 응답 우선**으로 수정한다.
- 새 리소스 이슈(#6~#13) 구현 시 `scripts/verify/run.ts`에 해당 엔드포인트 검증 항목을 추가한다.

## CI

검증 러너는 실제 네트워크·자격증명이 필요하므로 **CI에서 실행하지 않는다** (CI는 `pnpm test` 단위 테스트만).
