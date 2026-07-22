/**
 * 예제 5 — 백엔드 → 프론트엔드 SSE 릴레이 어댑터.
 *
 * "전송 수단은 앱 소유" 원칙의 참고 구현이다. SDK는 정규화 스트림을
 * 노출할 뿐이고, 그걸 프론트로 어떻게 보낼지(SSE/WebSocket/폴링)는
 * 애플리케이션이 결정한다. 여기서는 표준 SSE(EventSource)를 사용한다.
 *
 * 실행: pnpm exec tsx examples/05-relay-sse.ts
 * 확인: 브라우저에서 http://localhost:8787 접속 → 채널에 채팅 발생 시 실시간 표시
 *
 * ⚠️ 보안: Client Secret·액세스 토큰은 절대 프론트로 보내지 않는다.
 * 브라우저에는 이 릴레이가 내보내는 "정규화 이벤트"만 전달된다.
 */
import { createServer, type ServerResponse } from 'node:http';
import type { NormalizedEvent } from '../src/index.js';
import { createExampleClient } from './_shared.js';

const PORT = 8787;
const client = createExampleClient();
const realtime = client.createRealtime({ auth: 'client', subscriptions: ['chat', 'donation'] });

// 접속 중인 SSE 클라이언트들 (다운스트림)
const sseClients = new Set<ServerResponse>();

// 단일 업스트림 → 다중 다운스트림: 에미터 소비자 하나가 SSE로 팬아웃
realtime.on('event', (event: NormalizedEvent) => {
  if (event.type !== 'chat' && event.type !== 'donation') return;
  const frame = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) {
    res.write(frame);
  }
});

const PAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>chzzk relay</title>
<style>body{font-family:sans-serif;max-width:40rem;margin:2rem auto}li{margin:.2rem 0}</style>
</head><body><h1>실시간 채팅 릴레이 (SSE)</h1><ul id="log"></ul><script>
const log = document.getElementById('log');
new EventSource('/events').onmessage = (e) => {
  const event = JSON.parse(e.data);
  const li = document.createElement('li');
  li.textContent = event.type === 'chat'
    ? '💬 ' + event.chat.nickname + ': ' + event.chat.content
    : '🎁 ' + event.donation.donatorNickname + ' ' + event.donation.payAmount + '원';
  log.prepend(li);
};
</script></body></html>`;

const server = createServer((req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(PAGE);
});

await realtime.start();
server.listen(PORT, () => {
  console.log(`릴레이 서버: http://localhost:${PORT} (SSE: /events)`);
});

process.on('SIGINT', () => {
  realtime.close();
  server.close();
  process.exit(0);
});
