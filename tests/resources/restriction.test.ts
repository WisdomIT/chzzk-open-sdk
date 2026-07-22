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

function restricted(id: string): Record<string, unknown> {
  return {
    restrictedChannelId: id,
    restrictedChannelName: `name-${id}`,
    createdDate: '2026-07-22 23:00:00',
    releaseDate: null,
  };
}

describe('RestrictionResource.list / iterate', () => {
  it('GETs restrict-channels with query params and parses the live-verified wrapping', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(successEnvelope({ data: [restricted('a')], page: { next: null } }));
    const client = await makeClient(fetchMock);

    const result = await client.restrictions.list({ size: 5 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openapi.chzzk.naver.com/open/v1/restrict-channels?size=5');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer access-0');
    expect(result.data[0]?.restrictedChannelId).toBe('a');
    expect(result.page?.next).toBeNull();
  });

  it('rejects size over 30 before any request', async () => {
    const fetchMock = vi.fn();
    const client = await makeClient(fetchMock);

    await expect(client.restrictions.list({ size: 31 })).rejects.toBeInstanceOf(
      ChzzkValidationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('iterate follows page.next cursors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(successEnvelope({ data: [restricted('a')], page: { next: 'c1' } }))
      .mockResolvedValueOnce(successEnvelope({ data: [restricted('b')], page: { next: null } }));
    const client = await makeClient(fetchMock);

    const ids: string[] = [];
    for await (const item of client.restrictions.iterate({ size: 1 })) {
      ids.push(item.restrictedChannelId);
    }

    expect(ids).toEqual(['a', 'b']);
    const [secondUrl] = fetchMock.mock.calls[1] as [string];
    expect(secondUrl).toContain('next=c1');
  });
});

describe('RestrictionResource add/remove', () => {
  it('POSTs and DELETEs with targetChannelId in the body', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response('', { status: 200 })));
    const client = await makeClient(fetchMock);

    await client.restrictions.add('target-1');
    await client.restrictions.remove('target-1');

    const [addUrl, addInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [removeUrl, removeInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(addUrl).toBe('https://openapi.chzzk.naver.com/open/v1/restrict-channels');
    expect(addInit.method).toBe('POST');
    expect(JSON.parse(addInit.body as string)).toEqual({ targetChannelId: 'target-1' });
    expect(removeUrl).toBe(addUrl);
    expect(removeInit.method).toBe('DELETE');
    expect(JSON.parse(removeInit.body as string)).toEqual({ targetChannelId: 'target-1' });
  });

  it('rejects empty targetChannelId before any request', async () => {
    const fetchMock = vi.fn();
    const client = await makeClient(fetchMock);

    await expect(client.restrictions.add('')).rejects.toBeInstanceOf(ChzzkValidationError);
    await expect(client.restrictions.remove('')).rejects.toBeInstanceOf(ChzzkValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('RestrictionResource temporary add/remove', () => {
  it('POSTs and DELETEs temporary restrictions with chatChannelId', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response('', { status: 200 })));
    const client = await makeClient(fetchMock);

    const params = { targetChannelId: 'target-1', chatChannelId: 'N2dODq' };
    await client.restrictions.addTemporary(params);
    await client.restrictions.removeTemporary(params);

    const [addUrl, addInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(addUrl).toBe('https://openapi.chzzk.naver.com/open/v1/temporary-restrict-channels');
    expect(JSON.parse(addInit.body as string)).toEqual(params);
    const [, removeInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(removeInit.method).toBe('DELETE');
  });

  it('rejects missing chatChannelId before any request', async () => {
    const fetchMock = vi.fn();
    const client = await makeClient(fetchMock);

    await expect(
      client.restrictions.addTemporary({ targetChannelId: 't', chatChannelId: '' }),
    ).rejects.toBeInstanceOf(ChzzkValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
