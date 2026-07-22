import { describe, expect, it, vi } from 'vitest';
import { paginateByCursor, paginateByPage } from '../../src/http/pagination.js';

async function collect<T>(iter: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) {
    out.push(item);
  }
  return out;
}

describe('paginateByPage', () => {
  it('iterates pages from 0 until an empty page', async () => {
    const pages = [['a', 'b'], ['c', 'd'], ['e'], [], ['never']];
    const fetchPage = vi.fn((page: number) => Promise.resolve(pages[page] ?? []));

    const items = await collect(paginateByPage(fetchPage));

    expect(items).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(fetchPage).toHaveBeenCalledTimes(4);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0);
    expect(fetchPage).toHaveBeenNthCalledWith(4, 3);
  });

  it('supports a custom start page', async () => {
    const fetchPage = vi.fn((page: number) => Promise.resolve(page < 3 ? [page] : []));

    const items = await collect(paginateByPage(fetchPage, 2));

    expect(items).toEqual([2]);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 2);
  });

  it('is lazy — stops fetching when the consumer breaks early', async () => {
    const fetchPage = vi.fn((page: number) => Promise.resolve([page * 2, page * 2 + 1]));

    const iter = paginateByPage(fetchPage);
    const first = await iter.next();
    expect(first.value).toBe(0);
    await iter.return();

    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

describe('paginateByCursor', () => {
  it('follows next cursors until exhausted', async () => {
    const pages: Record<string, { items: string[]; next: string | null }> = {
      start: { items: ['a', 'b'], next: 'c1' },
      c1: { items: ['c'], next: 'c2' },
      c2: { items: ['d'], next: null },
    };
    const fetchPage = vi.fn((cursor: string | undefined) =>
      Promise.resolve(pages[cursor ?? 'start']!),
    );

    const items = await collect(paginateByCursor(fetchPage));

    expect(items).toEqual(['a', 'b', 'c', 'd']);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, undefined);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 'c1');
  });

  it('treats empty-string cursor as the last page', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: ['a'], next: '' });

    const items = await collect(paginateByCursor(fetchPage));

    expect(items).toEqual(['a']);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('stops when the server repeats the same cursor (infinite loop guard)', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: ['a'], next: 'x' })
      .mockResolvedValue({ items: ['b'], next: 'x' });

    const items = await collect(paginateByCursor(fetchPage));

    expect(items).toEqual(['a', 'b']);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('stops after a page with items but no next', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: ['a'], next: undefined });

    const items = await collect(paginateByCursor(fetchPage));

    expect(items).toEqual(['a']);
  });
});
