/**
 * 예제 2 — 라이브 목록 조회 (Client 인증 — 유저 로그인 불필요).
 *
 * 실행: pnpm exec tsx examples/02-lives.ts
 */
import { createExampleClient } from './_shared.js';

const client = createExampleClient();

// 단일 페이지
const page = await client.lives.lives({ size: 5 });
for (const live of page.data) {
  console.log(`[${live.concurrentUserCount}명] ${live.channelName} — ${live.liveTitle}`);
}

// 자동 순회(async iterator)로 상위 20개까지
let count = 0;
for await (const _live of client.lives.iterateLives({ size: 20 })) {
  count += 1;
  if (count >= 20) break;
}
console.log(`\n자동 순회로 ${count}개 확인 (커서는 SDK가 따라간다)`);
