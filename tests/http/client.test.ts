import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChzzkApiError,
  ChzzkAuthenticationError,
  ChzzkNetworkError,
  ChzzkPermissionError,
  ChzzkRateLimitError,
} from '../../src/errors.js';
import { HttpClient } from '../../src/http/client.js';
import type { ChzzkLogger } from '../../src/http/logger.js';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function successEnvelope(content: unknown): Response {
  return jsonResponse({ code: 200, message: null, content });
}

describe('HttpClient.request', () => {
  it('builds URL with base, path and query; omits undefined and joins arrays with comma', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successEnvelope({ ok: true }));
    const client = new HttpClient({ fetch: fetchMock });

    await client.request({
      method: 'GET',
      path: '/open/v1/channels',
      query: { channelIds: ['a', 'b', 'c'], size: 20, next: undefined },
    });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://openapi.chzzk.naver.com/open/v1/channels?channelIds=a%2Cb%2Cc&size=20',
    );
  });

  it('sends JSON body with Content-Type and given headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successEnvelope(null));
    const client = new HttpClient({ fetch: fetchMock });

    await client.request({
      method: 'POST',
      path: '/open/v1/chats/send',
      headers: { Authorization: 'Bearer token123' },
      body: { message: 'hi' },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ message: 'hi' }));
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer token123',
      'Content-Type': 'application/json',
    });
  });

  it('does not set Content-Type or body for GET without body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successEnvelope({}));
    const client = new HttpClient({ fetch: fetchMock });

    await client.request({ method: 'GET', path: '/open/v1/users/me' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('unwraps the content field on success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(successEnvelope({ channelId: 'abc', channelName: '테스트' }));
    const client = new HttpClient({ fetch: fetchMock });

    const content = await client.request<{ channelId: string; channelName: string }>({
      method: 'GET',
      path: '/open/v1/users/me',
    });

    expect(content).toEqual({ channelId: 'abc', channelName: '테스트' });
  });

  it('returns null for 200 responses with empty body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const client = new HttpClient({ fetch: fetchMock });

    const content = await client.request<null>({ method: 'POST', path: '/open/v1/chats/notice' });
    expect(content).toBeNull();
  });

  it.each([
    [400, ChzzkApiError],
    [401, ChzzkAuthenticationError],
    [403, ChzzkPermissionError],
    [404, ChzzkApiError],
    [500, ChzzkApiError],
  ])('maps HTTP %i to the right error class with api message', async (status, errorClass) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ code: status, message: 'SOME_ERROR' }, { status }));
    const client = new HttpClient({ fetch: fetchMock });

    const error = await client
      .request({ method: 'GET', path: '/open/v1/users/me' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(errorClass);
    const apiError = error as ChzzkApiError;
    expect(apiError.status).toBe(status);
    expect(apiError.apiMessage).toBe('SOME_ERROR');
    expect(apiError.method).toBe('GET');
    expect(apiError.path).toBe('/open/v1/users/me');
  });

  it('throws ChzzkApiError when HTTP is 200 but envelope code is not 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ code: 403, message: 'FORBIDDEN' }));
    const client = new HttpClient({ fetch: fetchMock });

    await expect(client.request({ method: 'GET', path: '/x' })).rejects.toMatchObject({
      name: 'ChzzkApiError',
      status: 403,
      apiMessage: 'FORBIDDEN',
    });
  });

  it('wraps fetch failures in ChzzkNetworkError with cause', async () => {
    const cause = new TypeError('fetch failed');
    const fetchMock = vi.fn().mockRejectedValue(cause);
    const client = new HttpClient({ fetch: fetchMock });

    const error = await client
      .request({ method: 'GET', path: '/open/v1/lives' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ChzzkNetworkError);
    expect((error as ChzzkNetworkError).cause).toBe(cause);
  });

  it('returns raw body with a warning when response is not the documented envelope', async () => {
    const warn = vi.fn();
    const logger: ChzzkLogger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ foo: 'bar' }));
    const client = new HttpClient({ fetch: fetchMock, logger });

    const content = await client.request<{ foo: string }>({ method: 'GET', path: '/x' });

    expect(content).toEqual({ foo: 'bar' });
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('HttpClient 429 retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function rateLimited(headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify({ code: 429, message: 'TOO_MANY_REQUESTS' }), {
      status: 429,
      headers,
    });
  }

  it('respects Retry-After header and succeeds on retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimited({ 'Retry-After': '3' }))
      .mockResolvedValueOnce(successEnvelope({ ok: true }));
    const client = new HttpClient({ fetch: fetchMock });

    const promise = client.request<{ ok: boolean }>({ method: 'GET', path: '/open/v1/lives' });
    await vi.advanceTimersByTimeAsync(3000);

    await expect(promise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses exponential backoff when Retry-After is missing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(successEnvelope({ ok: true }));
    const client = new HttpClient({ fetch: fetchMock, retry: { baseDelayMs: 100 } });

    const promise = client.request<{ ok: boolean }>({ method: 'GET', path: '/x' });

    // 1차 재시도: 100ms
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 2차 재시도: 200ms
    await vi.advanceTimersByTimeAsync(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await expect(promise).resolves.toEqual({ ok: true });
  });

  it('throws ChzzkRateLimitError with retryAfterSeconds after exhausting retries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(rateLimited({ 'Retry-After': '1' }));
    const client = new HttpClient({ fetch: fetchMock, retry: { maxRetries: 2 } });

    const promise = client.request({ method: 'GET', path: '/x' }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10000);

    const error = await promise;
    expect(error).toBeInstanceOf(ChzzkRateLimitError);
    expect((error as ChzzkRateLimitError).retryAfterSeconds).toBe(1);
    // 최초 1회 + 재시도 2회
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry when retry is disabled on the client', async () => {
    const fetchMock = vi.fn().mockResolvedValue(rateLimited());
    const client = new HttpClient({ fetch: fetchMock, retry: { enabled: false } });

    await expect(client.request({ method: 'GET', path: '/x' })).rejects.toBeInstanceOf(
      ChzzkRateLimitError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry when retry is disabled per request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(rateLimited());
    const client = new HttpClient({ fetch: fetchMock });

    await expect(
      client.request({ method: 'GET', path: '/x', retry: false }),
    ).rejects.toBeInstanceOf(ChzzkRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
