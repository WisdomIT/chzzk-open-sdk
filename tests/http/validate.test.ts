import { describe, expect, it } from 'vitest';
import { ChzzkValidationError } from '../../src/errors.js';
import { requireMaxLength, requireParam, requireRange } from '../../src/http/validate.js';
import { maskSecret, maskHeaders } from '../../src/http/logger.js';

describe('requireParam', () => {
  it('returns the value when present', () => {
    expect(requireParam('abc', 'query')).toBe('abc');
    expect(requireParam(0, 'size')).toBe(0);
  });

  it.each([undefined, null, ''])('throws ChzzkValidationError for %o', (value) => {
    expect(() => requireParam(value, 'query')).toThrow(ChzzkValidationError);
    expect(() => requireParam(value, 'query')).toThrow('"query" is required');
  });
});

describe('requireRange', () => {
  it('passes undefined through (optional param)', () => {
    expect(requireRange(undefined, 'size', 1, 50)).toBeUndefined();
  });

  it('returns valid integers', () => {
    expect(requireRange(1, 'size', 1, 50)).toBe(1);
    expect(requireRange(50, 'size', 1, 50)).toBe(50);
  });

  it.each([0, 51, 1.5, NaN])('rejects %o outside 1~50', (value) => {
    expect(() => requireRange(value, 'size', 1, 50)).toThrow(ChzzkValidationError);
  });
});

describe('requireMaxLength', () => {
  it('rejects empty arrays and arrays over the limit', () => {
    expect(() => requireMaxLength([], 'channelIds', 20)).toThrow(ChzzkValidationError);
    expect(() => requireMaxLength(new Array<string>(21).fill('x'), 'channelIds', 20)).toThrow(
      '"channelIds" accepts at most 20 items',
    );
  });

  it('returns valid arrays', () => {
    expect(requireMaxLength(['a'], 'channelIds', 20)).toEqual(['a']);
  });
});

describe('secret masking', () => {
  it('masks all but the first 4 characters', () => {
    expect(maskSecret('FFok65zQFQVcFvH2')).toBe('FFok********');
    expect(maskSecret('abc')).toBe('****');
  });

  it('masks Authorization and Client-Secret headers only', () => {
    const masked = maskHeaders({
      Authorization: 'Bearer FFok65zQFQVcFvH2',
      'Client-Secret': 'VeIMuc9XGle7PSxI',
      'Client-Id': 'fefb6bbb',
      'Content-Type': 'application/json',
    });
    expect(masked['Authorization']).toBe('Bear********');
    expect(masked['Client-Secret']).toBe('VeIM********');
    expect(masked['Client-Id']).toBe('fefb6bbb');
    expect(masked['Content-Type']).toBe('application/json');
  });
});
