import { describe, expect, it } from 'vitest';
import { SDK_NAME } from '../src/index.js';

describe('scaffold', () => {
  it('exports package name', () => {
    expect(SDK_NAME).toBe('chzzk-open-sdk');
  });
});
