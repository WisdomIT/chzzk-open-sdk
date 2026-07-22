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

function liveItem(id: number): Record<string, unknown> {
  return {
    liveId: id,
    liveTitle: `live-${id}`,
    liveThumbnailImageUrl: null,
    concurrentUserCount: 100,
    openDate: '2026-07-22 12:00:00',
    adult: false,
    tags: ['태그'],
    categoryType: 'GAME',
    liveCategory: 'League_of_Legends',
    liveCategoryValue: '리그 오브 레전드',
    channelId: `ch-${id}`,
    channelName: `name-${id}`,
    channelImageUrl: null,
  };
}

describe('LiveResource.lives', () => {
  it('GETs /open/v1/lives with Client auth and size/next params', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(successEnvelope({ data: [liveItem(1)], page: { next: 'cursor-1' } }));
    const client = await makeClient(fetchMock);

    const result = await client.lives.lives({ size: 5, next: 'cursor-0' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openapi.chzzk.naver.com/open/v1/lives?size=5&next=cursor-0');
    expect((init.headers as Record<string, string>)['Client-Id']).toBe('cid');
    expect(result.data[0]?.liveId).toBe(1);
    expect(result.page?.next).toBe('cursor-1');
  });

  it('rejects size outside 1~20 before any request', async () => {
    const fetchMock = vi.fn();
    const client = await makeClient(fetchMock);

    await expect(client.lives.lives({ size: 21 })).rejects.toBeInstanceOf(ChzzkValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('iterateLives follows page.next cursors until exhausted', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        successEnvelope({ data: [liveItem(1), liveItem(2)], page: { next: 'c1' } }),
      )
      .mockResolvedValueOnce(successEnvelope({ data: [liveItem(3)], page: { next: null } }));
    const client = await makeClient(fetchMock);

    const ids: number[] = [];
    for await (const live of client.lives.iterateLives({ size: 2 })) {
      ids.push(live.liveId);
    }

    expect(ids).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [secondUrl] = fetchMock.mock.calls[1] as [string];
    expect(secondUrl).toContain('next=c1');
  });
});

describe('LiveResource.streamKey', () => {
  it('GETs /open/v1/streams/key with a Bearer token and returns the key string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successEnvelope({ streamKey: 'sk-123' }));
    const client = await makeClient(fetchMock);

    await expect(client.lives.streamKey()).resolves.toBe('sk-123');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openapi.chzzk.naver.com/open/v1/streams/key');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer access-0');
  });
});

describe('LiveResource.getSetting / updateSetting', () => {
  it('parses the live setting including nullable category', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      successEnvelope({
        defaultLiveTitle: '방송 제목',
        category: {
          categoryType: 'GAME',
          categoryId: 'cat-1',
          categoryValue: '게임',
          posterImageUrl: null,
        },
        tags: ['a', 'b'],
      }),
    );
    const client = await makeClient(fetchMock);

    const setting = await client.lives.getSetting();
    expect(setting.defaultLiveTitle).toBe('방송 제목');
    expect(setting.category?.categoryId).toBe('cat-1');
    expect(setting.tags).toEqual(['a', 'b']);
  });

  it('PATCHes only the provided fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const client = await makeClient(fetchMock);

    await client.lives.updateSetting({ defaultLiveTitle: '새 제목', tags: [] });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openapi.chzzk.naver.com/open/v1/lives/setting');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ defaultLiveTitle: '새 제목', tags: [] });
  });

  it('rejects an empty patch and an empty title before any request', async () => {
    const fetchMock = vi.fn();
    const client = await makeClient(fetchMock);

    await expect(client.lives.updateSetting({})).rejects.toBeInstanceOf(ChzzkValidationError);
    await expect(client.lives.updateSetting({ defaultLiveTitle: '' })).rejects.toBeInstanceOf(
      ChzzkValidationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
