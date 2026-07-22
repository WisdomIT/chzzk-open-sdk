# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **전체 공식 REST 엔드포인트 31개 구현** — user / channel / category / live / chat / drops / restriction / session (`ChzzkOpenClient` 리소스 지향 API)
- **OAuth**: 인가 URL 빌더, 토큰 발급·자동 갱신(만료 임박 선제 + 401 재시도 + single-flight)·폐기, `TokenStore` 인터페이스(+메모리 기본 구현)
- **HTTP 계층**: `ChzzkApiError` 에러 계층(401/403/429 구분), 429 `Retry-After`·지수 백오프 재시도, 페이지네이션 자동 순회 헬퍼, 주입형 로거(민감정보 마스킹)
- **실시간 3계층**: 의존성 0의 socket.io v2(EIO=3) 자체 클라이언트(WebSocket/폴링), `SYSTEM(connected)` 반응 구독·재연결 시 세션 재발급·재구독 자동 복구, 정규화 이벤트(`ChatMessage`/`Donation`/`SubscriptionEvent`), 에미터+AsyncIterable 팬아웃(소비자별 격리), `getChatRole` 파생
- **문서-실제 검증 하니스**: 로컬 OAuth 로그인 서버(`pnpm login`), 검증 러너(`pnpm verify`), [docs/api-notes.md](docs/api-notes.md)에 35건 실측 기록
- 실행 가능한 examples 6종 (SSE 릴레이 어댑터, 스트림 가공 명령어 봇 포함)

### Fixed (기존 wizbot 구현 대비 교정)

- 토큰 폐기 경로를 문서 기준 `/auth/v1/token/revoke`로 교정
- `SUBSCRIPTION` 세션 이벤트 지원 추가 (구 코드 누락)
- 채팅 설정 필드명 오타 교정(`allowSubscriberInFollowerMode`), `chatSlowModeSec`/`chatEmojiMode` 반영
- 세션 목록 `disconnectedDate` 철자 교정 및 optional 처리
- `expiresIn`을 number로 정규화 (실측: 문서의 String 표기가 오류)
