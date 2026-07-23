/**
 * 예제 3 — 채팅 전송과 공지 등록.
 *
 * 실행: pnpm exec tsx examples/03-send-chat.ts "보낼 메시지"
 * ⚠️ 본인 채널 채팅창에 실제 메시지가 전송된다.
 * 참고: 채팅 채널은 라이브 여부와 무관하게 항상 존재한다 (실측 확인).
 */
import { createExampleClient } from './_shared.js';

const client = createExampleClient();
const message = process.argv[2] ?? 'chzzk-open-sdk 예제 메시지';

const messageId = await client.chats.send(message);
console.log('전송 완료. messageId:', messageId);

// 전송한 메시지를 공지로 등록하려면:
// await client.chats.notice({ messageId });
