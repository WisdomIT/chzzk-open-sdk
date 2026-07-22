import { describe, expect, it, vi } from 'vitest';
import { ChzzkOpenClient } from '../../src/client.js';
import { ChzzkValidationError } from '../../src/errors.js';

function successEnvelope(content: unknown): Response {
  return new Response(JSON.stringify({ code: 200, message: null, content }), { status: 200 });
}

function makeClient(fetchMock: typeof globalThis.fetch): ChzzkOpenClient {
  return new ChzzkOpenClient({ clientId: 'cid', clientSecret: 'csecret', fetch: fetchMock });
}

describe('CategoryResource.search', () => {
  it('GETs /open/v1/categories/search with Client auth and query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      successEnvelope({
        data: [
          {
            categoryType: 'GAME',
            categoryId: 'League_of_Legends',
            categoryValue: '리그 오브 레전드',
            posterImageUrl: 'https://example.com/poster.png',
          },
        ],
      }),
    );
    const client = makeClient(fetchMock);

    const categories = await client.categories.search({ query: '리그', size: 10 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://openapi.chzzk.naver.com/open/v1/categories/search?query=%EB%A6%AC%EA%B7%B8&size=10',
    );
    const headers = init.headers as Record<string, string>;
    expect(headers['Client-Id']).toBe('cid');
    expect(headers['Client-Secret']).toBe('csecret');
    expect(categories).toHaveLength(1);
    expect(categories[0]?.categoryId).toBe('League_of_Legends');
  });

  it('rejects missing query and out-of-range size before any request', async () => {
    const fetchMock = vi.fn();
    const client = makeClient(fetchMock);

    await expect(client.categories.search({ query: '' })).rejects.toBeInstanceOf(
      ChzzkValidationError,
    );
    await expect(client.categories.search({ query: 'x', size: 51 })).rejects.toBeInstanceOf(
      ChzzkValidationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tolerates undocumented categoryType values', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      successEnvelope({
        data: [
          {
            categoryType: 'FUTURE_TYPE',
            categoryId: 'x',
            categoryValue: 'y',
            posterImageUrl: null,
          },
        ],
      }),
    );
    const client = makeClient(fetchMock);

    const categories = await client.categories.search({ query: 'x' });
    expect(categories[0]?.categoryType).toBe('FUTURE_TYPE');
  });
});
