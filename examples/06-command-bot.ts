/**
 * 예제 6 — 스트림 위에서 개발자가 직접 가공하는 패턴 (명령어 봇 + 사후 블라인드).
 *
 * ⚠️ 이 필터링·명령 파싱·모더레이션 판단은 SDK 기능이 아니다.
 * SDK의 책임은 "정확하고 견고한 정규화 스트림 제공"까지이고,
 * 그 위에서 무엇을 할지는 아래처럼 개발자가 스트림을 소비하며 결정한다.
 *
 * 실행: pnpm exec tsx examples/06-command-bot.ts
 * 동작:
 *   - "!ping" 채팅 → "pong!" 응답 전송
 *   - 금지어 포함 채팅 → chats/blind-message로 사후 숨김
 *     (치지직 채팅은 이미 발생한 메시지의 사전 차단이 불가능하고
 *      사후 블라인드만 가능하다 — 이 판단 로직도 개발자 영역)
 */
import { getChatRole } from '../src/index.js';
import { createExampleClient } from './_shared.js';

const BANNED_WORDS = ['금지어예시'];

const client = createExampleClient();
const me = await client.users.me();
const realtime = client.createRealtime({ auth: 'client', subscriptions: ['chat'] });

// AsyncIterable 소비 — for-await 루프 안이 전부 "개발자 영역"이다
async function run(): Promise<void> {
  for await (const chat of realtime.chats()) {
    // 봇 자신의 메시지는 무시 (무한 루프 방지)
    if (chat.senderChannelId === me.channelId) continue;

    // 1) 명령어 파싱
    if (chat.content.startsWith('!')) {
      const [command] = chat.content.slice(1).split(' ');
      if (command === 'ping') {
        await client.chats.send('pong!');
        console.log(`✅ !ping ← ${chat.nickname}`);
      }
      continue;
    }

    // 2) 금지어 감지 → 사후 블라인드
    if (BANNED_WORDS.some((word) => chat.content.includes(word))) {
      if (chat.chatChannelId === null) continue; // 블라인드에 필요한 식별자 없음
      await client.chats.blindMessage({
        chatChannelId: chat.chatChannelId,
        messageTime: chat.messageTime,
        senderChannelId: chat.senderChannelId,
      });
      console.log(`🙈 금지어 블라인드: ${chat.nickname} (${getChatRole(chat)})`);
    }
  }
}

await realtime.start();
console.log('명령어 봇 실행 중 — "!ping" 을 채팅으로 입력해보세요. (Ctrl+C로 종료)');
void run();

process.on('SIGINT', () => {
  realtime.close();
  process.exit(0);
});
