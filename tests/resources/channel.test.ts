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

function channelItem(id: string): Record<string, unknown> {
  return {
    channelId: id,
    channelName: `name-${id}`,
    channelImageUrl: null,
    followerCount: 10,
    verifiedMark: false,
  };
}

describe('ChannelResource.get', () => {
  it('GETs /open/v1/channels with Client auth headers and comma-joined ids', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(successEnvelope({ data: [channelItem('a'), channelItem('b')] }));
    const client = await makeClient(fetchMock);

    const channels = await client.channels.get(['a', 'b']);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openapi.chzzk.naver.com/open/v1/channels?channelIds=a%2Cb');
    const headers = init.headers as Record<string, string>;
    expect(headers['Client-Id']).toBe('cid');
    expect(headers['Client-Secret']).toBe('csecret');
    expect(headers['Authorization']).toBeUndefined();
    expect(channels).toHaveLength(2);
    expect(channels[0]?.channelId).toBe('a');
  });

  it('rejects empty or oversized channelIds before any request', async () => {
    const fetchMock = vi.fn();
    const client = await makeClient(fetchMock);

    await expect(client.channels.get([])).rejects.toBeInstanceOf(ChzzkValidationError);
    await expect(client.channels.get(new Array<string>(21).fill('x'))).rejects.toBeInstanceOf(
      ChzzkValidationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ChannelResource.streamingRoles', () => {
  it('GETs streaming-roles with a Bearer token and unwraps data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      successEnvelope({
        data: [
          {
            managerChannelId: 'm-1',
            managerChannelName: 'mgr',
            userRole: 'STREAMING_CHAT_MANAGER',
            createdDate: '2026-01-01',
          },
        ],
      }),
    );
    const client = await makeClient(fetchMock);

    const roles = await client.channels.streamingRoles();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openapi.chzzk.naver.com/open/v1/channels/streaming-roles');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer access-0');
    expect(roles[0]?.userRole).toBe('STREAMING_CHAT_MANAGER');
  });
});

describe('ChannelResource.followers / subscribers', () => {
  it('passes page/size/sort query params', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(successEnvelope({ data: [] })));
    const client = await makeClient(fetchMock);

    await client.channels.followers({ page: 2, size: 10 });
    await client.channels.subscribers({ page: 1, size: 20, sort: 'LONGER' });

    const [followersUrl] = fetchMock.mock.calls[0] as [string];
    const [subscribersUrl] = fetchMock.mock.calls[1] as [string];
    expect(followersUrl).toBe(
      'https://openapi.chzzk.naver.com/open/v1/channels/followers?page=2&size=10',
    );
    expect(subscribersUrl).toBe(
      'https://openapi.chzzk.naver.com/open/v1/channels/subscribers?page=1&size=20&sort=LONGER',
    );
  });

  it('rejects out-of-range size before any request', async () => {
    const fetchMock = vi.fn();
    const client = await makeClient(fetchMock);

    await expect(client.channels.followers({ size: 0 })).rejects.toBeInstanceOf(
      ChzzkValidationError,
    );
    await expect(client.channels.subscribers({ size: 51 })).rejects.toBeInstanceOf(
      ChzzkValidationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns page metadata observed in real responses (undocumented)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      successEnvelope({
        data: [{ channelId: 'a', channelName: 'a', createdDate: '2026-01-01' }],
        page: 0,
        totalCount: 7,
        totalPages: 4,
      }),
    );
    const client = await makeClient(fetchMock);

    const result = await client.channels.followers();
    expect(result.totalCount).toBe(7);
    expect(result.totalPages).toBe(4);
    expect(result.data).toHaveLength(1);
  });

  it('iterateFollowers stops via totalPages without an extra empty-page request', async () => {
    const follower = (id: string): Record<string, unknown> => ({
      channelId: id,
      channelName: id,
      createdDate: '2026-01-01',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        successEnvelope({ data: [follower('a'), follower('b')], page: 0, totalPages: 2 }),
      )
      .mockResolvedValueOnce(successEnvelope({ data: [follower('c')], page: 1, totalPages: 2 }));
    const client = await makeClient(fetchMock);

    const ids: string[] = [];
    for await (const item of client.channels.iterateFollowers({ size: 2 })) {
      ids.push(item.channelId);
    }

    expect(ids).toEqual(['a', 'b', 'c']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('iterateFollowers falls back to empty-page termination without totalPages', async () => {
    const follower = (id: string): Record<string, unknown> => ({
      channelId: id,
      channelName: id,
      createdDate: '2026-01-01',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(successEnvelope({ data: [follower('a')] }))
      .mockResolvedValueOnce(successEnvelope({ data: [] }));
    const client = await makeClient(fetchMock);

    const ids: string[] = [];
    for await (const item of client.channels.iterateFollowers({ size: 2 })) {
      ids.push(item.channelId);
    }

    expect(ids).toEqual(['a']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [secondUrl] = fetchMock.mock.calls[1] as [string];
    expect(secondUrl).toContain('page=1');
  });
});
