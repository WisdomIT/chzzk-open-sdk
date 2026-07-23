/**
 * Engine.IO v3 (EIO=3) 폴링 페이로드 인코딩.
 *
 * 폴링 요청에 `b64=1`을 붙이면 텍스트 인코딩(`<길이>:<패킷>` 연쇄)으로
 * 응답이 온다. 길이는 UTF-16 코드유닛이 아닌 "문자 수" 기준
 * (Engine.IO v3 규격 — 서로게이트 쌍도 1문자).
 *
 * 실측(2026-07-22): 치지직 세션 서버는 EIO=3(socket.io v2)로 동작한다
 * — docs/api-notes.md "실시간 연결 관련 중요 참고" 참조.
 */

/** `<길이>:<패킷>` 연쇄를 개별 엔진 패킷 문자열로 분해한다. */
export function decodePollingPayload(body: string): string[] {
  const packets: string[] = [];
  const chars = [...body]; // 문자 단위 (서로게이트 쌍 = 1)
  let i = 0;
  while (i < chars.length) {
    let lengthStr = '';
    while (i < chars.length && chars[i] !== ':') {
      lengthStr += chars[i];
      i += 1;
    }
    if (i >= chars.length) {
      break; // 콜론 없이 끝남 — 잘린 페이로드는 무시
    }
    i += 1; // ':' 건너뜀
    const length = Number(lengthStr);
    if (!Number.isInteger(length) || length < 0) {
      break;
    }
    packets.push(chars.slice(i, i + length).join(''));
    i += length;
  }
  return packets;
}

/** 엔진 패킷들을 폴링 POST body로 인코딩한다. */
export function encodePollingPayload(packets: readonly string[]): string {
  return packets.map((packet) => `${[...packet].length}:${packet}`).join('');
}

/** Engine.IO 패킷 타입 (첫 글자) */
export const ENGINE_PACKET = {
  OPEN: '0',
  CLOSE: '1',
  PING: '2',
  PONG: '3',
  MESSAGE: '4',
  UPGRADE: '5',
  NOOP: '6',
} as const;

export interface EngineHandshake {
  sid: string;
  pingIntervalMs: number;
  pingTimeoutMs: number;
}

/** OPEN 패킷(`0{...}`)에서 핸드셰이크 정보를 파싱한다. */
export function parseHandshake(openPacket: string): EngineHandshake {
  const parsed: unknown = JSON.parse(openPacket.slice(1));
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { sid?: unknown }).sid !== 'string'
  ) {
    throw new Error('Invalid Engine.IO handshake packet');
  }
  const record = parsed as { sid: string; pingInterval?: unknown; pingTimeout?: unknown };
  return {
    sid: record.sid,
    pingIntervalMs: typeof record.pingInterval === 'number' ? record.pingInterval : 25000,
    pingTimeoutMs: typeof record.pingTimeout === 'number' ? record.pingTimeout : 60000,
  };
}

/**
 * socket.io v2 이벤트 패킷(`2["이벤트명","payload"]`)을 파싱한다.
 * 치지직 세션의 payload는 항상 JSON "문자열"(이중 인코딩)이다.
 * @returns 이벤트 패킷이 아니면 null
 */
export function parseSocketIoEvent(packet: string): { name: string; body: string } | null {
  if (!packet.startsWith('2')) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(packet.slice(1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) {
    return null;
  }
  const tuple = parsed as unknown[];
  const name = tuple[0];
  if (typeof name !== 'string') {
    return null;
  }
  const body = tuple[1];
  return { name, body: typeof body === 'string' ? body : JSON.stringify(body) };
}
