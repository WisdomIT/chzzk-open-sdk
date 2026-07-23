import { describe, expect, it } from 'vitest';
import {
  decodePollingPayload,
  encodePollingPayload,
  parseHandshake,
  parseSocketIoEvent,
} from '../../src/realtime/packets.js';

describe('decodePollingPayload', () => {
  it('splits concatenated <length>:<packet> chunks', () => {
    expect(decodePollingPayload('2:40' + '5:42[1]')).toEqual(['40', '42[1]']);
  });

  it('counts multibyte characters as single units (EIO3 rule)', () => {
    const packet = '42["SYSTEM","한글"]';
    const payload = `${[...packet].length}:${packet}`;
    expect(decodePollingPayload(payload)).toEqual([packet]);
  });

  it('ignores truncated trailing data', () => {
    expect(decodePollingPayload('2:40' + '99')).toEqual(['40']);
  });

  it('round-trips with encodePollingPayload', () => {
    const packets = ['2', '42["SYSTEM","{\\"type\\":\\"connected\\"}"]'];
    expect(decodePollingPayload(encodePollingPayload(packets))).toEqual(packets);
  });
});

describe('parseHandshake', () => {
  it('parses sid and ping settings', () => {
    const handshake = parseHandshake(
      '0{"sid":"abc","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":60000}',
    );
    expect(handshake).toEqual({ sid: 'abc', pingIntervalMs: 25000, pingTimeoutMs: 60000 });
  });

  it('falls back to defaults when ping settings are missing', () => {
    const handshake = parseHandshake('0{"sid":"abc"}');
    expect(handshake.pingIntervalMs).toBe(25000);
    expect(handshake.pingTimeoutMs).toBe(60000);
  });

  it('throws on malformed handshake', () => {
    expect(() => parseHandshake('0{}')).toThrow();
  });
});

describe('parseSocketIoEvent', () => {
  it('parses event packets keeping the body as a raw string', () => {
    const packet =
      '2["SYSTEM","{\\"type\\":\\"connected\\",\\"data\\":{\\"sessionKey\\":\\"sk\\"}}"]';
    const event = parseSocketIoEvent(packet);
    expect(event?.name).toBe('SYSTEM');
    expect(JSON.parse(event?.body ?? '')).toMatchObject({ type: 'connected' });
  });

  it('returns null for non-event packets', () => {
    expect(parseSocketIoEvent('0')).toBeNull();
    expect(parseSocketIoEvent('3')).toBeNull();
    expect(parseSocketIoEvent('2not-json')).toBeNull();
  });
});
