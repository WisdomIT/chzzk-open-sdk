import { describe, expect, it, vi } from 'vitest';
import { ChzzkOpenClient } from '../../src/client.js';
import { ChzzkValidationError } from '../../src/errors.js';

function successEnvelope(content: unknown): Response {
  return new Response(JSON.stringify({ code: 200, message: null, content }), { status: 200 });
}

function makeClient(fetchMock: typeof globalThis.fetch): ChzzkOpenClient {
  return new ChzzkOpenClient({ clientId: 'cid', clientSecret: 'csecret', fetch: fetchMock });
}

function claim(id: string): Record<string, unknown> {
  return {
    claimId: id,
    campaignId: 'camp-1',
    rewardId: 'reward-1',
    categoryId: 'CATEGORY_CHZZK',
    categoryName: '치지직',
    channelId: 'ch-1',
    fulfillmentState: 'CLAIMED',
    claimedDate: '2024-08-01T09:20:26Z',
    updatedDate: '2024-08-01T09:20:26Z',
  };
}

describe('DropsResource.rewardClaims', () => {
  it('GETs reward-claims with Client auth and doc-style dotted page params', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(successEnvelope({ data: [claim('a')], page: { cursor: 'cur-1' } }));
    const client = makeClient(fetchMock);

    const result = await client.drops.rewardClaims({
      from: 'cur-0',
      size: 20,
      channelId: 'ch-1',
      fulfillmentState: 'CLAIMED',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://openapi.chzzk.naver.com/open/v1/drops/reward-claims?page.from=cur-0&page.size=20&channelId=ch-1&fulfillmentState=CLAIMED',
    );
    expect((init.headers as Record<string, string>)['Client-Id']).toBe('cid');
    expect(result.data[0]?.claimId).toBe('a');
    expect(result.page?.cursor).toBe('cur-1');
  });

  it('joins claimIds with commas and rejects more than 100', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successEnvelope({ data: [] }));
    const client = makeClient(fetchMock);

    await client.drops.rewardClaims({ claimIds: ['a', 'b'] });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('claimId=a%2Cb');

    await expect(
      client.drops.rewardClaims({ claimIds: new Array<string>(101).fill('x') }),
    ).rejects.toBeInstanceOf(ChzzkValidationError);
  });

  it('rejects campaignId and categoryId used together', async () => {
    const fetchMock = vi.fn();
    const client = makeClient(fetchMock);

    await expect(
      client.drops.rewardClaims({ campaignId: 'c', categoryId: 'g' }),
    ).rejects.toBeInstanceOf(ChzzkValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('iterateRewardClaims follows page.cursor until exhausted', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        successEnvelope({ data: [claim('a'), claim('b')], page: { cursor: 'c1' } }),
      )
      .mockResolvedValueOnce(successEnvelope({ data: [claim('c')], page: { cursor: '' } }));
    const client = makeClient(fetchMock);

    const ids: string[] = [];
    for await (const item of client.drops.iterateRewardClaims({ size: 2 })) {
      ids.push(item.claimId);
    }

    expect(ids).toEqual(['a', 'b', 'c']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [secondUrl] = fetchMock.mock.calls[1] as [string];
    expect(secondUrl).toContain('page.from=c1');
  });
});

describe('DropsResource.updateRewardClaims', () => {
  it('PUTs claimIds and fulfillmentState, returning status groups', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(successEnvelope({ data: [{ status: 'SUCCESS', ids: ['a', 'b'] }] }));
    const client = makeClient(fetchMock);

    const result = await client.drops.updateRewardClaims({
      claimIds: ['a', 'b'],
      fulfillmentState: 'FULFILLED',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openapi.chzzk.naver.com/open/v1/drops/reward-claims');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({
      claimIds: ['a', 'b'],
      fulfillmentState: 'FULFILLED',
    });
    expect(result[0]?.status).toBe('SUCCESS');
  });

  it('rejects an empty claimIds array before any request', async () => {
    const fetchMock = vi.fn();
    const client = makeClient(fetchMock);

    await expect(
      client.drops.updateRewardClaims({ claimIds: [], fulfillmentState: 'FULFILLED' }),
    ).rejects.toBeInstanceOf(ChzzkValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
