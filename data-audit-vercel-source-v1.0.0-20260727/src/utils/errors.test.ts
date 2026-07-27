import { describe, expect, it } from 'vitest';
import { ensureSuccess, getErrorMessage } from './errors';

describe('async error helpers', () => {
  it('extracts readable messages from common database errors', () => {
    expect(getErrorMessage(new Error('network failed'))).toBe('network failed');
    expect(getErrorMessage({ details: 'foreign key violation' })).toBe('foreign key violation');
    expect(getErrorMessage(null, 'fallback')).toBe('fallback');
  });

  it('throws failed database results and returns successful results', () => {
    expect(() => ensureSuccess({ data: null, error: { message: 'failed' } })).toThrow();
    expect(ensureSuccess({ data: [1], error: null }).data).toEqual([1]);
  });
});

