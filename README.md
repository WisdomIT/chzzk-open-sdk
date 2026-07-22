# chzzk-open-sdk

> **⚠️ 개발 중 (Work in Progress)** — 아직 npm에 배포되지 않았습니다. API는 예고 없이 변경될 수 있습니다.

네이버 치지직(CHZZK) **공식 OPEN API** 전용 TypeScript SDK.

**이 SDK는 [공식 OPEN API](https://chzzk.gitbook.io/chzzk)(`openapi.chzzk.naver.com`)만 지원하며, 문서에 없는 비공식·내부 엔드포인트는 포함하지 않습니다.**

## 특징 (목표)

- ✅ **공식 스펙만, 전부** — 공식 문서의 모든 엔드포인트를 100% 커버, 비공식 엔드포인트 0건
- ✅ **타입 안전** — 모든 요청/응답에 대한 TypeScript 타입, strict 모드
- ✅ **문서-실제 검증** — 실제 응답으로 스키마를 검증하고 불일치를 [docs/api-notes.md](docs/api-notes.md)에 기록
- ✅ **OAuth 토큰 자동 갱신** — 만료/401 시 refresh 후 재시도
- ✅ **실시간 이벤트** — 공식 세션 API 기반 chat / donation / subscription 정규화 스트림 (단일 업스트림 → 다중 다운스트림 팬아웃)
- ✅ **의존성 최소화** — 런타임 내장 `fetch` 사용 (Node 18+ / 브라우저)
- ✅ **ESM + CJS 듀얼 패키지**, `.d.ts` 포함

## 설치

```bash
# 아직 배포 전입니다
npm install chzzk-open-sdk
```

## 사용 예시 (설계 초안)

```ts
import { ChzzkOpenClient } from 'chzzk-open-sdk';

const client = new ChzzkOpenClient({
  clientId: process.env.CHZZK_CLIENT_ID!,
  clientSecret: process.env.CHZZK_CLIENT_SECRET!,
});

const channel = await client.channels.get({ channelIds: ['...'] });
await client.chats.send({ message: '안녕하세요!' });
```

## 브라우저 사용 시 주의

Client Secret과 액세스 토큰은 브라우저에 노출되면 안 됩니다. 인증이 필요한 호출은 백엔드에서 수행하고, 프론트엔드에는 정규화된 이벤트 스트림만 릴레이하는 구성을 권장합니다. (`examples/` 참고 예정)

## 개발

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## 로드맵

전체 로드맵과 진행 상황은 [GitHub Issues](https://github.com/WisdomIT/chzzk-open-sdk/issues)에서 확인할 수 있습니다.

## 라이선스

[MIT](LICENSE)
