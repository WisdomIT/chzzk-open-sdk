import { describe, expect, it, vi } from 'vitest';
import { ChzzkOpenClient } from '../../src/client.js';
import { ChzzkValidationError } from '../../src/errors.js';
import type { ChzzkTokenSet } from '../../src/auth/types.js';

function freshTokens(): ChzzkTokenSet {
  return {
    accessToken: 'access-0',
    refreshToken: 'refresh-0',
    tokenType: 'Bearer',
    expiresIn: 86400,
    obtainedAt: Date.now(),
  };
}

function successEnvelope(content: unknown): Response {
  return new Response(JSON.stringify({ code: 200, message: null, content }), { status: 200 });
}

async function makeClient(fetchMock: typeof globalThis.fetch): Promise<ChzzkOpenClient> {
  const client = new ChzzkOpenClient({
    clientId: 'cid',
    clientSecret: 'csecret',
    fetch: fetchMock,
  });
  await client.auth.setTokens(freshTokens());
  return client;
}

describe('ChatResource.send', () => {
  it('POSTs the message with a Bearer token and returns messageId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successEnvelope({ messageId: 'msg-1' }));
    const client = await makeClient(fetchMock);

    await expect(client.chats.send('안녕하세요')).resolves.toBe('msg-1');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openapi.chzzk.naver.com/open/v1/chats/send');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer access-0');
    expect(JSON.parse(init.body as string)).toEqual({ message: '안녕하세요' });
  });

  it('rejects empty and over-100-char messages before any request', async () => {
    const fetchMock = vi.fn();
    const client = await makeClient(fetchMock);

    await expect(client.chats.send('')).rejects.toBeInstanceOf(ChzzkValidationError);
    await expect(client.chats.send('가'.repeat(101))).rejects.toBeInstanceOf(ChzzkValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ChatResource.notice', () => {
  it('registers a notice with a new message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const client = await makeClient(fetchMock);

    await client.chats.notice({ message: '공지입니다' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openapi.chzzk.naver.com/open/v1/chats/notice');
    expect(JSON.parse(init.body as string)).toEqual({ message: '공지입니다' });
  });

  it('registers a notice from an existing messageId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const client = await makeClient(fetchMock);

    await client.chats.notice({ messageId: 'msg-1' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ messageId: 'msg-1' });
  });

  it('rejects when neither or both of message/messageId are given', async () => {
    const fetchMock = vi.fn();
    const client = await makeClient(fetchMock);

    await expect(
      client.chats.notice({} as Parameters<typeof client.chats.notice>[0]),
    ).rejects.toBeInstanceOf(ChzzkValidationError);
    await expect(
      client.chats.notice({ message: 'a', messageId: 'b' } as Parameters<
        typeof client.chats.notice
      >[0]),
    ).rejects.toBeInstanceOf(ChzzkValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ChatResource.getSettings / updateSettings', () => {
  it('parses settings using field names confirmed against the live API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      successEnvelope({
        chatAvailableCondition: 'NONE',
        chatAvailableGroup: 'ALL',
        minFollowerMinute: 0,
        allowSubscriberInFollowerMode: true,
        chatSlowModeSec: 0,
        chatEmojiMode: false,
      }),
    );
    const client = await makeClient(fetchMock);

    const settings = await client.chats.getSettings();
    expect(settings.allowSubscriberInFollowerMode).toBe(true);
    expect(settings.chatSlowModeSec).toBe(0);
  });

  it('PUTs only the provided fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const client = await makeClient(fetchMock);

    await client.chats.updateSettings({ chatSlowModeSec: 30, chatEmojiMode: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openapi.chzzk.naver.com/open/v1/chats/settings');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ chatSlowModeSec: 30, chatEmojiMode: true });
  });

  it('rejects disallowed minFollowerMinute / chatSlowModeSec values before any request', async () => {
    const fetchMock = vi.fn();
    const client = await makeClient(fetchMock);

    await expect(client.chats.updateSettings({})).rejects.toBeInstanceOf(ChzzkValidationError);
    await expect(client.chats.updateSettings({ minFollowerMinute: 7 })).rejects.toBeInstanceOf(
      ChzzkValidationError,
    );
    await expect(client.chats.updateSettings({ chatSlowModeSec: 4 })).rejects.toBeInstanceOf(
      ChzzkValidationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts the 2025.12-extended minFollowerMinute values', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const client = await makeClient(fetchMock);

    await client.chats.updateSettings({ minFollowerMinute: 259200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('ChatResource.blindMessage', () => {
  it('POSTs chatChannelId/messageTime/senderChannelId from a chat event', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const client = await makeClient(fetchMock);

    await client.chats.blindMessage({
      chatChannelId: 'N2dODq',
      messageTime: 1784728108501,
      senderChannelId: 'sender-1',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openapi.chzzk.naver.com/open/v1/chats/blind-message');
    expect(JSON.parse(init.body as string)).toEqual({
      chatChannelId: 'N2dODq',
      messageTime: 1784728108501,
      senderChannelId: 'sender-1',
    });
  });

  it('rejects missing fields before any request', async () => {
    const fetchMock = vi.fn();
    const client = await makeClient(fetchMock);

    await expect(
      client.chats.blindMessage({ chatChannelId: '', messageTime: 1, senderChannelId: 's' }),
    ).rejects.toBeInstanceOf(ChzzkValidationError);
    await expect(
      client.chats.blindMessage({
        chatChannelId: 'c',
        messageTime: Number.NaN,
        senderChannelId: 's',
      }),
    ).rejects.toBeInstanceOf(ChzzkValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
