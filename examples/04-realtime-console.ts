/**
 * 예제 4 — 실시간 이벤트를 콘솔에 출력 (에미터 소비).
 *
 * 실행: pnpm exec tsx examples/04-realtime-console.ts
 * 종료: Ctrl+C
 *
 * 클라이언트 인증 세션 + 유저 토큰 구독 조합(봇 아키텍처 표준 패턴)을 사용한다.
 */
import { getChatRole } from '../src/index.js';
import { createExampleClient } from './_shared.js';

const client = createExampleClient();

const realtime = client.createRealtime({
  auth: 'client',
  subscriptions: ['chat', 'donation', 'subscription'],
});

realtime.on('chat', (chat) => {
  const role = getChatRole(chat); // STREAMER / MANAGER / VIEWER 파생
  console.log(`💬 [${role}] ${chat.nickname}: ${chat.content}`);
});
realtime.on('donation', (donation) => {
  console.log(`🎁 ${donation.donatorNickname} → ${donation.payAmount}원: ${donation.donationText}`);
});
realtime.on('subscription', (subscription) => {
  console.log(
    `⭐ ${subscription.subscriberNickname} 티어${subscription.tierNo} (${subscription.month}개월)`,
  );
});
realtime.on('reconnecting', (attempt, delayMs) => {
  console.log(`↻ 재연결 시도 ${attempt} (${delayMs}ms 후) — 새 세션·재구독은 SDK가 자동 처리`);
});

await realtime.start();
console.log('연결됨 — 채팅을 기다립니다. (Ctrl+C로 종료)');

process.on('SIGINT', () => {
  realtime.close();
  process.exit(0);
});
