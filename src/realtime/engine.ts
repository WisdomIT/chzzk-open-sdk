import { noopLogger, type ChzzkLogger } from '../http/logger.js';
import {
  decodePollingPayload,
  encodePollingPayload,
  ENGINE_PACKET,
  parseHandshake,
} from './packets.js';

/**
 * 치지직 세션 서버용 경량 Engine.IO v3 클라이언트.
 *
 * 의존성 최소화 원칙에 따라 socket.io-client@2 대신 자체 구현했다.
 * 프로토콜(EIO=3)과 연결 흐름은 실측으로 검증됨 — docs/api-notes.md
 * "실시간 연결 관련 중요 참고" 참조.
 *
 * - WebSocket 전송: `globalThis.WebSocket`이 있으면 사용 (Node 22+, 브라우저).
 *   공식 가이드의 `transports: ['websocket']`과 동일하게 업그레이드 없이 직결.
 * - 폴링 전송: WebSocket이 없는 런타임(Node 18/20)용 폴백. 순수 fetch 기반.
 * - 두 모드 모두 ping(2)/pong(3) 하트비트를 유지하고, pong 미수신 시 죽은
 *   연결로 판정해 onClose를 발화한다.
 */

export interface EngineSocketHandlers {
  /** socket.io 패킷 수신 (엔진 MESSAGE payload — 예: "0", "2[\"SYSTEM\",...]") */
  onMessage(socketIoPacket: string): void;
  /** 연결 종료 (정상/비정상 공통, 정확히 1회) */
  onClose(reason: string, cause?: unknown): void;
}

export interface EngineSocketOptions {
  /** 세션 API가 발급한 URL (`https://host?auth=...`) */
  sessionUrl: string;
  handlers: EngineSocketHandlers;
  logger?: ChzzkLogger;
  fetchFn?: typeof globalThis.fetch;
  /** 기본: WebSocket 사용 가능 시 true */
  preferWebSocket?: boolean;
  /** connected 대기 등에 쓰는 핸드셰이크 타임아웃(ms). 기본 10000 */
  handshakeTimeoutMs?: number;
}

export interface EngineSocket {
  readonly transport: 'websocket' | 'polling';
  close(): void;
}

/** WebSocket 지원 여부 (Node 22+/브라우저) */
export function hasWebSocket(): boolean {
  return typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'function';
}

export async function connectEngineSocket(options: EngineSocketOptions): Promise<EngineSocket> {
  const logger = options.logger ?? noopLogger;
  const preferWs = options.preferWebSocket ?? hasWebSocket();
  if (preferWs && hasWebSocket()) {
    return connectWebSocket(options, logger);
  }
  return connectPolling(options, logger);
}

interface HeartbeatState {
  pingTimer: ReturnType<typeof setInterval> | null;
  pongDeadline: ReturnType<typeof setTimeout> | null;
}

function stopHeartbeat(state: HeartbeatState): void {
  if (state.pingTimer !== null) clearInterval(state.pingTimer);
  if (state.pongDeadline !== null) clearTimeout(state.pongDeadline);
  state.pingTimer = null;
  state.pongDeadline = null;
}

// --- WebSocket 전송 ---------------------------------------------------------

function connectWebSocket(
  options: EngineSocketOptions,
  logger: ChzzkLogger,
): Promise<EngineSocket> {
  const url = new URL(options.sessionUrl);
  const auth = url.searchParams.get('auth');
  const wsUrl =
    `${url.protocol === 'http:' ? 'ws:' : 'wss:'}//${url.host}/socket.io/` +
    `?EIO=3&transport=websocket${auth !== null ? `&auth=${encodeURIComponent(auth)}` : ''}`;

  return new Promise((resolve, reject) => {
    const WebSocketCtor = (globalThis as { WebSocket: typeof WebSocket }).WebSocket;
    const ws = new WebSocketCtor(wsUrl);
    let opened = false;
    let closed = false;
    const heartbeat: HeartbeatState = { pingTimer: null, pongDeadline: null };

    const handshakeTimer = setTimeout(() => {
      if (!opened) {
        ws.close();
        reject(new Error('Engine.IO websocket handshake timed out'));
      }
    }, options.handshakeTimeoutMs ?? 10000);

    const finish = (reason: string, cause?: unknown): void => {
      if (closed) return;
      closed = true;
      stopHeartbeat(heartbeat);
      clearTimeout(handshakeTimer);
      try {
        ws.close();
      } catch {
        // 이미 닫힘
      }
      if (opened) {
        options.handlers.onClose(reason, cause);
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      const packet = typeof event.data === 'string' ? event.data : '';
      const type = packet.charAt(0);
      if (type === ENGINE_PACKET.OPEN) {
        const handshake = parseHandshake(packet);
        opened = true;
        clearTimeout(handshakeTimer);
        heartbeat.pingTimer = setInterval(() => {
          if (heartbeat.pongDeadline === null) {
            heartbeat.pongDeadline = setTimeout(() => {
              finish('ping timeout');
            }, handshake.pingTimeoutMs);
          }
          try {
            ws.send(ENGINE_PACKET.PING);
          } catch (cause) {
            finish('ping send failed', cause);
          }
        }, handshake.pingIntervalMs);
        logger.debug(`chzzk-open-sdk realtime connected via websocket (sid=${handshake.sid})`);
        resolve({
          transport: 'websocket',
          close: () => finish('closed by client'),
        });
        return;
      }
      if (type === ENGINE_PACKET.PONG) {
        if (heartbeat.pongDeadline !== null) {
          clearTimeout(heartbeat.pongDeadline);
          heartbeat.pongDeadline = null;
        }
        return;
      }
      if (type === ENGINE_PACKET.CLOSE) {
        finish('server close packet');
        return;
      }
      if (type === ENGINE_PACKET.MESSAGE) {
        options.handlers.onMessage(packet.slice(1));
      }
    };

    ws.onerror = (event: unknown) => {
      if (!opened) {
        clearTimeout(handshakeTimer);
        reject(new Error('Engine.IO websocket connection failed'));
        return;
      }
      finish('websocket error', event);
    };

    ws.onclose = () => {
      finish('websocket closed');
    };
  });
}

// --- 폴링 전송 ---------------------------------------------------------------

async function connectPolling(
  options: EngineSocketOptions,
  logger: ChzzkLogger,
): Promise<EngineSocket> {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const url = new URL(options.sessionUrl);
  const auth = url.searchParams.get('auth');
  const base =
    `${url.origin}/socket.io/?EIO=3&transport=polling&b64=1` +
    (auth !== null ? `&auth=${encodeURIComponent(auth)}` : '');

  const handshakeResponse = await fetchFn(base, {
    signal: AbortSignal.timeout(options.handshakeTimeoutMs ?? 10000),
  });
  if (!handshakeResponse.ok) {
    throw new Error(`Engine.IO polling handshake failed: HTTP ${handshakeResponse.status}`);
  }
  const packets = decodePollingPayload(await handshakeResponse.text());
  const openPacket = packets.find((packet) => packet.startsWith(ENGINE_PACKET.OPEN));
  if (openPacket === undefined) {
    throw new Error('Engine.IO polling handshake missing OPEN packet');
  }
  const handshake = parseHandshake(openPacket);
  const pollUrl = `${base}&sid=${encodeURIComponent(handshake.sid)}`;

  let closed = false;
  const heartbeat: HeartbeatState = { pingTimer: null, pongDeadline: null };

  const finish = (reason: string, cause?: unknown): void => {
    if (closed) return;
    closed = true;
    stopHeartbeat(heartbeat);
    options.handlers.onClose(reason, cause);
  };

  const handlePacket = (packet: string): void => {
    const type = packet.charAt(0);
    if (type === ENGINE_PACKET.PONG) {
      if (heartbeat.pongDeadline !== null) {
        clearTimeout(heartbeat.pongDeadline);
        heartbeat.pongDeadline = null;
      }
      return;
    }
    if (type === ENGINE_PACKET.CLOSE) {
      finish('server close packet');
      return;
    }
    if (type === ENGINE_PACKET.MESSAGE) {
      options.handlers.onMessage(packet.slice(1));
    }
  };

  // 핸드셰이크 응답에 이미 포함된 패킷 처리 (예: "40")
  for (const packet of packets) {
    if (!packet.startsWith(ENGINE_PACKET.OPEN)) {
      handlePacket(packet);
    }
  }

  // 수신 롱폴 루프
  void (async () => {
    while (!closed) {
      try {
        const response = await fetchFn(pollUrl, {
          signal: AbortSignal.timeout(handshake.pingIntervalMs + handshake.pingTimeoutMs),
        });
        if (!response.ok) {
          finish(`polling failed: HTTP ${response.status}`);
          return;
        }
        const body = await response.text();
        for (const packet of decodePollingPayload(body)) {
          handlePacket(packet);
        }
      } catch (cause) {
        if (!closed) {
          finish('polling error', cause);
        }
        return;
      }
    }
  })();

  // ping 송신 루프
  heartbeat.pingTimer = setInterval(() => {
    if (closed) return;
    if (heartbeat.pongDeadline === null) {
      heartbeat.pongDeadline = setTimeout(() => {
        finish('ping timeout');
      }, handshake.pingTimeoutMs);
    }
    void fetchFn(pollUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: encodePollingPayload([ENGINE_PACKET.PING]),
      signal: AbortSignal.timeout(handshake.pingTimeoutMs),
    }).catch((cause: unknown) => {
      if (!closed) finish('ping send failed', cause);
    });
  }, handshake.pingIntervalMs);

  logger.debug(`chzzk-open-sdk realtime connected via polling (sid=${handshake.sid})`);

  return {
    transport: 'polling',
    close: () => {
      // 클라이언트 주도 종료 — 서버에 close 패킷 전송 시도 후 종료
      void fetchFn(pollUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: encodePollingPayload([ENGINE_PACKET.CLOSE]),
        signal: AbortSignal.timeout(3000),
      }).catch(() => undefined);
      finish('closed by client');
    },
  };
}
