import { describe, expect, it, vi } from 'vitest';
import { getChatRole, normalizeSessionEvent } from '../../src/realtime/normalize.js';
import type { ChzzkLogger } from '../../src/http/logger.js';

function makeLogger(): ChzzkLogger & { warnMock: ReturnType<typeof vi.fn> } {
  const warnMock = vi.fn();
  return { debug: vi.fn(), info: vi.fn(), warn: warnMock, error: vi.fn(), warnMock };
}

/** 실측(2026-07-22) CHAT payload — probe에서 캡처한 실제 구조 */
const REAL_CHAT_PAYLOAD = {
  channelId: 'd9c571e0ecae37fec31711735f95c8f4',
  chatChannelId: 'N2dODq',
  senderChannelId: 'd9c571e0ecae37fec31711735f95c8f4',
  profile: {
    nickname: '위즈 WisdomIT',
    verifiedMark: false,
    badges: [{ imageUrl: 'https://ssl.pstatic.net/static/nng/glive/icon/streamer.png' }],
    userRoleCode: 'streamer',
  },
  content: 'chzzk-open-sdk CHAT 이벤트 실측 테스트',
  emojis: {},
  messageTime: 1784728108501,
  eventSentAt: '2026-07-22T22:48:28.525460090',
};

describe('normalizeSessionEvent — CHAT', () => {
  it('normalizes the real captured payload, absorbing the userRoleCode location mismatch', () => {
    const result = normalizeSessionEvent({
      name: 'CHAT',
      body: JSON.stringify(REAL_CHAT_PAYLOAD),
    });

    expect(result.type).toBe('chat');
    if (result.type !== 'chat') return;
    expect(result.chat).toEqual({
      channelId: 'd9c571e0ecae37fec31711735f95c8f4',
      senderChannelId: 'd9c571e0ecae37fec31711735f95c8f4',
      chatChannelId: 'N2dODq',
      nickname: '위즈 WisdomIT',
      badges: [{ imageUrl: 'https://ssl.pstatic.net/static/nng/glive/icon/streamer.png' }],
      verifiedMark: false,
      userRole: 'streamer', // profile 내부(실측 위치)에서 흡수
      content: 'chzzk-open-sdk CHAT 이벤트 실측 테스트',
      emojis: {},
      messageTime: 1784728108501,
      eventSentAt: '2026-07-22T22:48:28.525460090',
    });
  });

  it('falls back to the documented top-level userRoleCode position', () => {
    const payload = {
      ...REAL_CHAT_PAYLOAD,
      profile: { ...REAL_CHAT_PAYLOAD.profile, userRoleCode: undefined },
      userRoleCode: 'common_user',
    };
    const result = normalizeSessionEvent({ name: 'CHAT', body: JSON.stringify(payload) });

    expect(result.type).toBe('chat');
    if (result.type === 'chat') {
      expect(result.chat.userRole).toBe('common_user');
    }
  });

  it('tolerates missing optional fields (chatChannelId/emojis/eventSentAt)', () => {
    const minimal = {
      channelId: 'c',
      senderChannelId: 's',
      profile: { nickname: 'n' },
      content: 'hi',
      messageTime: 1,
    };
    const result = normalizeSessionEvent({ name: 'CHAT', body: JSON.stringify(minimal) });

    expect(result.type).toBe('chat');
    if (result.type === 'chat') {
      expect(result.chat.chatChannelId).toBeNull();
      expect(result.chat.badges).toEqual([]);
      expect(result.chat.emojis).toEqual({});
      expect(result.chat.userRole).toBeNull();
      expect(result.chat.eventSentAt).toBeNull();
    }
  });
});

describe('normalizeSessionEvent — DONATION / SUBSCRIPTION', () => {
  it('normalizes a documented donation payload with a numeric derivation', () => {
    const result = normalizeSessionEvent({
      name: 'DONATION',
      body: JSON.stringify({
        donationType: 'CHAT',
        channelId: 'c',
        donatorChannelId: 'd',
        donatorNickname: '후원자',
        payAmount: '1000',
        donationText: '응원합니다',
        emojis: { e1: 'https://example.com/e1.png' },
      }),
    });

    expect(result.type).toBe('donation');
    if (result.type === 'donation') {
      expect(result.donation.payAmount).toBe('1000');
      expect(result.donation.payAmountNumber).toBe(1000);
      expect(result.donation.donationText).toBe('응원합니다');
    }
  });

  it('keeps payAmountNumber null when the amount is not numeric', () => {
    const result = normalizeSessionEvent({
      name: 'DONATION',
      body: JSON.stringify({
        donationType: 'VIDEO',
        channelId: 'c',
        donatorChannelId: 'd',
        donatorNickname: 'n',
        payAmount: 'unknown',
      }),
    });

    expect(result.type).toBe('donation');
    if (result.type === 'donation') {
      expect(result.donation.payAmountNumber).toBeNull();
      expect(result.donation.emojis).toEqual({});
    }
  });

  it('normalizes a documented subscription payload', () => {
    const result = normalizeSessionEvent({
      name: 'SUBSCRIPTION',
      body: JSON.stringify({
        channelId: 'c',
        subscriberChannelId: 's',
        subscriberNickname: '구독자',
        tierNo: 2,
        tierName: '브랜드',
        month: 3,
      }),
    });

    expect(result).toEqual({
      type: 'subscription',
      subscription: {
        channelId: 'c',
        subscriberChannelId: 's',
        subscriberNickname: '구독자',
        tierNo: 2,
        tierName: '브랜드',
        month: 3,
      },
    });
  });
});

describe('normalizeSessionEvent — SYSTEM', () => {
  it('normalizes connected/subscribed/revoked messages', () => {
    const connected = normalizeSessionEvent({
      name: 'SYSTEM',
      body: JSON.stringify({ type: 'connected', data: { sessionKey: 'sk-1' } }),
    });
    expect(connected).toEqual({
      type: 'system',
      system: { type: 'connected', sessionKey: 'sk-1' },
    });

    const subscribed = normalizeSessionEvent({
      name: 'SYSTEM',
      body: JSON.stringify({ type: 'subscribed', data: { eventType: 'CHAT', channelId: 'c' } }),
    });
    expect(subscribed).toEqual({
      type: 'system',
      system: { type: 'subscribed', eventType: 'CHAT', channelId: 'c' },
    });
  });

  it('passes through unknown SYSTEM types without crashing', () => {
    const result = normalizeSessionEvent({
      name: 'SYSTEM',
      body: JSON.stringify({ type: 'future_notice', data: { x: 1 } }),
    });
    expect(result).toEqual({
      type: 'system',
      system: { type: 'unknown', systemType: 'future_notice', data: { x: 1 } },
    });
  });
});

describe('normalizeSessionEvent — 관용 처리', () => {
  it('returns unknown for unrecognized event names', () => {
    const result = normalizeSessionEvent({ name: 'FUTURE_EVENT', body: '{"a":1}' });
    expect(result).toEqual({ type: 'unknown', eventName: 'FUTURE_EVENT', body: '{"a":1}' });
  });

  it('returns unknown with a warning for unparsable bodies', () => {
    const logger = makeLogger();
    const result = normalizeSessionEvent({ name: 'CHAT', body: 'not-json' }, logger);
    expect(result.type).toBe('unknown');
    expect(logger.warnMock).toHaveBeenCalledOnce();
  });

  it('returns unknown with a warning for schema mismatches instead of throwing', () => {
    const logger = makeLogger();
    const result = normalizeSessionEvent(
      { name: 'CHAT', body: JSON.stringify({ totally: 'different' }) },
      logger,
    );
    expect(result.type).toBe('unknown');
    expect(logger.warnMock).toHaveBeenCalledOnce();
  });
});

describe('getChatRole', () => {
  it('derives roles from the live-verified userRole first', () => {
    expect(getChatRole({ userRole: 'streamer', badges: [] })).toBe('STREAMER');
    expect(getChatRole({ userRole: 'streaming_channel_manager', badges: [] })).toBe('MANAGER');
    expect(getChatRole({ userRole: 'streaming_chat_manager', badges: [] })).toBe('MANAGER');
    expect(getChatRole({ userRole: 'common_user', badges: [] })).toBe('VIEWER');
  });

  it('falls back to badge inference when userRole is missing (legacy wizbot logic)', () => {
    expect(getChatRole({ userRole: null, badges: [{ imageUrl: 'https://x/streamer.png' }] })).toBe(
      'STREAMER',
    );
    expect(getChatRole({ userRole: null, badges: [{ imageUrl: 'https://x/manager.png' }] })).toBe(
      'MANAGER',
    );
    expect(getChatRole({ userRole: null, badges: [] })).toBe('VIEWER');
  });
});
