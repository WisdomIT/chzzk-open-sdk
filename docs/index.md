---
layout: home

hero:
  name: chzzk-open-sdk
  text: 치지직 공식 OPEN API 전용 TypeScript SDK
  tagline: 공식 스펙만, 전부, 타입 안전하게 — 그리고 문서를 맹신하지 않고 실제 응답으로 검증합니다
  actions:
    - theme: brand
      text: 시작하기
      link: /guide/getting-started
    - theme: alt
      text: API 레퍼런스
      link: /api/
    - theme: alt
      text: GitHub
      link: https://github.com/WisdomIT/chzzk-open-sdk

features:
  - icon: ✅
    title: 공식 API 100% 커버
    details: 공식 문서의 REST 엔드포인트 31개 전부 구현, 비공식·내부 엔드포인트 0건. openapi.chzzk.naver.com만 사용합니다.
  - icon: 🔬
    title: 문서-실제 검증
    details: 모든 엔드포인트를 실제 응답으로 검증하고 불일치 35건을 기록했습니다. 타입은 항상 실제 응답을 우선합니다.
  - icon: 🔐
    title: OAuth 자동 관리
    details: 만료 임박 선제 갱신, 401 시 갱신 후 재시도, 일회용 refresh token의 동시 갱신 경합 방지까지 SDK가 처리합니다.
  - icon: ⚡
    title: 실시간 정규화 스트림
    details: 의존성 0의 자체 socket.io v2 클라이언트로 chat/donation/subscription 이벤트를 수신하고, 재연결 시 세션 재발급·재구독을 자동 복구합니다.
  - icon: 🪶
    title: 의존성 최소화
    details: 런타임 의존성은 zod 하나. HTTP는 내장 fetch(Node 18+/브라우저), ESM+CJS 듀얼 패키지.
  - icon: 🧩
    title: 스트림만 노출, 가공은 개발자 몫
    details: SDK는 정확하고 견고한 정규화 스트림 제공까지만 책임집니다. 릴레이·명령 파싱·모더레이션은 예제 패턴으로 제공합니다.
---
